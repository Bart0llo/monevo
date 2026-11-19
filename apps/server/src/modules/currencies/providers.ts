import type { RateProviderId } from '@monevo/contracts';
import { addDays, Decimal, isLocalDate, type LocalDate, roundRate } from '@monevo/domain';

// Rate provider adapters (multi-currency.md#8-rate-providers). Providers are called on demand by
// the resolver only; there is no background fetching. `fetch` is injected so tests never reach
// the network.

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<FetchResponseLike>;

/** One quote: 1 `from` = `rate` `to`, as published on `publishedOn`. */
export interface ProviderQuote {
  readonly from: string;
  readonly to: string;
  readonly rate: Decimal;
  readonly publishedOn: LocalDate;
}

export interface RateProvider {
  readonly id: RateProviderId;
  /** Currency the provider quotes against; cross rates go through it. */
  readonly pivot: string;
  /**
   * Quotes that let the resolver derive `from → to` on `date` (direct, or both legs via the pivot).
   * An empty list means the provider has no data; failures throw.
   */
  fetchQuotes(from: string, to: string, date: LocalDate): Promise<ProviderQuote[]>;
}

export const PROVIDER_TIMEOUT_MS = 5000;

export class ProviderError extends Error {
  constructor(
    readonly providerId: RateProviderId,
    message: string,
  ) {
    super(`${providerId}: ${message}`);
    this.name = 'ProviderError';
  }
}

function parseRate(providerId: RateProviderId, value: unknown): Decimal {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new ProviderError(providerId, 'rate is not a number');
  }
  try {
    // JSON numbers are converted through their string form, never used as floats.
    return roundRate(new Decimal(String(value)));
  } catch {
    throw new ProviderError(providerId, 'rate is not a valid positive number');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function getJson(
  fetchFn: FetchLike,
  providerId: RateProviderId,
  url: string,
  noDataStatuses: readonly number[],
): Promise<unknown> {
  let response: FetchResponseLike;
  try {
    response = await fetchFn(url, {
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    throw new ProviderError(
      providerId,
      `request failed (${error instanceof Error ? error.name : 'unknown'})`,
    );
  }
  if (noDataStatuses.includes(response.status)) return undefined;
  if (!response.ok) throw new ProviderError(providerId, `HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new ProviderError(providerId, 'response is not JSON');
  }
}

/** Frankfurter v1 (ECB reference rates, EUR pivot). https://frankfurter.dev */
export function frankfurterProvider(
  fetchFn: FetchLike,
  baseUrl = 'https://api.frankfurter.dev/v1',
): RateProvider {
  const id: RateProviderId = 'frankfurter';
  return {
    id,
    pivot: 'EUR',
    async fetchQuotes(from, to, date) {
      const url = `${baseUrl}/${date}?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`;
      // 404 / 422: unsupported currency or no data for the date.
      const body = await getJson(fetchFn, id, url, [404, 422]);
      if (body === undefined) return [];
      if (!isRecord(body) || !isRecord(body['rates']) || !isLocalDate(body['date'])) {
        throw new ProviderError(id, 'unexpected response shape');
      }
      const value = body['rates'][to];
      if (value === undefined) return [];
      return [{ from, to, rate: parseRate(id, value), publishedOn: body['date'] }];
    },
  };
}

/** NBP (Narodowy Bank Polski) tables A and B, PLN pivot. https://api.nbp.pl */
export function nbpProvider(fetchFn: FetchLike, baseUrl = 'https://api.nbp.pl/api'): RateProvider {
  const id: RateProviderId = 'nbp';
  const pivot = 'PLN';

  async function quoteToPln(code: string, date: LocalDate): Promise<ProviderQuote | undefined> {
    const start = addDays(date, -7);
    for (const table of ['a', 'b'] as const) {
      const url = `${baseUrl}/exchangerates/rates/${table}/${code.toLowerCase()}/${start}/${date}/?format=json`;
      const body = await getJson(fetchFn, id, url, [404]);
      if (body === undefined) continue;
      if (!isRecord(body) || !Array.isArray(body['rates'])) {
        throw new ProviderError(id, 'unexpected response shape');
      }
      let latest: { effectiveDate: LocalDate; mid: unknown } | undefined;
      for (const entry of body['rates'] as unknown[]) {
        if (!isRecord(entry) || !isLocalDate(entry['effectiveDate'])) continue;
        const effectiveDate = entry['effectiveDate'];
        if (effectiveDate > date) continue;
        if (!latest || effectiveDate > latest.effectiveDate) {
          latest = { effectiveDate, mid: entry['mid'] };
        }
      }
      if (!latest) continue;
      return {
        from: code,
        to: pivot,
        rate: parseRate(id, latest.mid),
        publishedOn: latest.effectiveDate,
      };
    }
    return undefined;
  }

  return {
    id,
    pivot,
    async fetchQuotes(from, to, date) {
      const quotes: ProviderQuote[] = [];
      for (const code of [from, to]) {
        if (code === pivot) continue;
        const quote = await quoteToPln(code, date);
        // Without one leg no rate can be derived.
        if (!quote) return [];
        quotes.push(quote);
      }
      return quotes;
    },
  };
}

export function createProviders(
  fetchFn: FetchLike,
): Readonly<Record<RateProviderId, RateProvider>> {
  return { frankfurter: frankfurterProvider(fetchFn), nbp: nbpProvider(fetchFn) };
}
