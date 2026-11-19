import { describe, expect, it } from 'vitest';
import {
  type FetchLike,
  type FetchResponseLike,
  frankfurterProvider,
  nbpProvider,
  ProviderError,
} from '../providers.js';

// Provider adapters against recorded response shapes; the network is never used.

function response(status: number, body: unknown): FetchResponseLike {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

function routes(table: Record<string, FetchResponseLike>): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const fn = (url: string) => {
    calls.push(url);
    return Promise.resolve(table[url] ?? response(404, { message: 'not found' }));
  };
  return Object.assign(fn, { calls });
}

// Recorded from https://api.frankfurter.dev/v1/2026-11-14?base=EUR&symbols=PLN (Saturday → Friday).
const FRANKFURTER_EUR_PLN = {
  amount: 1.0,
  base: 'EUR',
  date: '2026-11-13',
  rates: { PLN: 4.2365 },
};

// Recorded shape of https://api.nbp.pl/api/exchangerates/rates/a/eur/{start}/{end}/?format=json
const NBP_EUR = {
  table: 'A',
  currency: 'euro',
  code: 'EUR',
  rates: [
    { no: '219/A/NBP/2026', effectiveDate: '2026-11-12', mid: 4.2401 },
    { no: '220/A/NBP/2026', effectiveDate: '2026-11-13', mid: 4.2365 },
  ],
};
const NBP_USD = {
  table: 'A',
  currency: 'dolar amerykański',
  code: 'USD',
  rates: [{ no: '220/A/NBP/2026', effectiveDate: '2026-11-13', mid: 3.6512 }],
};
const NBP_AFN_B = {
  table: 'B',
  currency: 'afgani (Afganistan)',
  code: 'AFN',
  rates: [{ no: '046/B/NBP/2026', effectiveDate: '2026-11-11', mid: 0.0532 }],
};

describe('frankfurterProvider', () => {
  const url = 'https://api.frankfurter.dev/v1/2026-11-14?base=EUR&symbols=PLN';

  it('returns the direct quote with the publication date', async () => {
    const fetchFn = routes({ [url]: response(200, FRANKFURTER_EUR_PLN) });
    const quotes = await frankfurterProvider(fetchFn).fetchQuotes('EUR', 'PLN', '2026-11-14');
    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.from).toBe('EUR');
    expect(quotes[0]?.to).toBe('PLN');
    expect(quotes[0]?.rate.toFixed(12)).toBe('4.236500000000');
    expect(quotes[0]?.publishedOn).toBe('2026-11-13');
    expect(fetchFn.calls).toEqual([url]);
  });

  it('treats 404 and 422 as no data', async () => {
    for (const status of [404, 422]) {
      const fetchFn = routes({ [url]: response(status, { message: 'not found' }) });
      await expect(
        frankfurterProvider(fetchFn).fetchQuotes('EUR', 'PLN', '2026-11-14'),
      ).resolves.toEqual([]);
    }
  });

  it('returns no quote when the symbol is missing from the response', async () => {
    const fetchFn = routes({ [url]: response(200, { ...FRANKFURTER_EUR_PLN, rates: {} }) });
    await expect(
      frankfurterProvider(fetchFn).fetchQuotes('EUR', 'PLN', '2026-11-14'),
    ).resolves.toEqual([]);
  });

  it('throws on server errors, network errors and malformed bodies', async () => {
    const provider = (fetchFn: FetchLike) => frankfurterProvider(fetchFn);
    await expect(
      provider(routes({ [url]: response(503, {}) })).fetchQuotes('EUR', 'PLN', '2026-11-14'),
    ).rejects.toBeInstanceOf(ProviderError);
    await expect(
      provider(() => Promise.reject(new DOMException('timed out', 'TimeoutError'))).fetchQuotes(
        'EUR',
        'PLN',
        '2026-11-14',
      ),
    ).rejects.toThrow(/TimeoutError/);
    await expect(
      provider(routes({ [url]: response(200, { rates: 'x' }) })).fetchQuotes(
        'EUR',
        'PLN',
        '2026-11-14',
      ),
    ).rejects.toBeInstanceOf(ProviderError);
    await expect(
      provider(
        routes({ [url]: response(200, { ...FRANKFURTER_EUR_PLN, rates: { PLN: -1 } }) }),
      ).fetchQuotes('EUR', 'PLN', '2026-11-14'),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it('passes a timeout signal', async () => {
    let signal: AbortSignal | undefined;
    const fetchFn: FetchLike = (_url, init) => {
      signal = init.signal;
      return Promise.resolve(response(200, FRANKFURTER_EUR_PLN));
    };
    await frankfurterProvider(fetchFn).fetchQuotes('EUR', 'PLN', '2026-11-14');
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});

describe('nbpProvider', () => {
  const nbp = (table: string, code: string) =>
    `https://api.nbp.pl/api/exchangerates/rates/${table}/${code}/2026-11-07/2026-11-14/?format=json`;

  it('quotes the non-PLN side against PLN using the latest effective date', async () => {
    const fetchFn = routes({ [nbp('a', 'eur')]: response(200, NBP_EUR) });
    const quotes = await nbpProvider(fetchFn).fetchQuotes('PLN', 'EUR', '2026-11-14');
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({ from: 'EUR', to: 'PLN', publishedOn: '2026-11-13' });
    expect(quotes[0]?.rate.toFixed(12)).toBe('4.236500000000');
  });

  it('returns both legs for a cross pair', async () => {
    const fetchFn = routes({
      [nbp('a', 'eur')]: response(200, NBP_EUR),
      [nbp('a', 'usd')]: response(200, NBP_USD),
    });
    const quotes = await nbpProvider(fetchFn).fetchQuotes('EUR', 'USD', '2026-11-14');
    expect(quotes.map((quote) => `${quote.from}${quote.to}`)).toEqual(['EURPLN', 'USDPLN']);
  });

  it('falls back to table B', async () => {
    const fetchFn = routes({ [nbp('b', 'afn')]: response(200, NBP_AFN_B) });
    const quotes = await nbpProvider(fetchFn).fetchQuotes('AFN', 'PLN', '2026-11-14');
    expect(quotes[0]).toMatchObject({ from: 'AFN', to: 'PLN', publishedOn: '2026-11-11' });
    expect(fetchFn.calls).toEqual([nbp('a', 'afn'), nbp('b', 'afn')]);
  });

  it('returns nothing when a leg is unknown to both tables', async () => {
    const fetchFn = routes({ [nbp('a', 'eur')]: response(200, NBP_EUR) });
    await expect(nbpProvider(fetchFn).fetchQuotes('EUR', 'XAU', '2026-11-14')).resolves.toEqual([]);
  });

  it('ignores entries after the requested date and throws on errors', async () => {
    const future = {
      ...NBP_EUR,
      rates: [{ no: 'x', effectiveDate: '2026-11-15', mid: 9 }, ...NBP_EUR.rates],
    };
    const quotes = await nbpProvider(
      routes({ [nbp('a', 'eur')]: response(200, future) }),
    ).fetchQuotes('EUR', 'PLN', '2026-11-14');
    expect(quotes[0]?.publishedOn).toBe('2026-11-13');
    await expect(
      nbpProvider(routes({ [nbp('a', 'eur')]: response(500, {}) })).fetchQuotes(
        'EUR',
        'PLN',
        '2026-11-14',
      ),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
