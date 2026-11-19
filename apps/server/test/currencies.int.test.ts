import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FetchLike } from '../src/modules/currencies/index.js';
import {
  type Agent,
  createHarness,
  fakeResponse,
  type Harness,
  signedIn,
} from './identity-harness.js';

// Currencies, exchange rates and the rate provider admin setting (multi-currency.md) against a
// real database. Rate providers only ever see the fake HTTP client below: never the network.

const NOW = new Date('2026-11-19T12:00:00Z'); // today = 2026-11-19 in UTC
const MINUTE = 60_000;

interface User {
  agent: Agent;
  csrf: string;
}

interface FrankfurterQuote {
  readonly date: string;
  readonly rate: number;
}

/**
 * A fake for both providers. Frankfurter: `"<date>|<base>|<symbol>"` → quote. NBP:
 * `"<code>|<date>"` → mid rate in table A. Everything else answers `fallbackStatus`.
 */
function fakeProviders(
  frankfurter: Record<string, FrankfurterQuote>,
  nbp: Record<string, { effectiveDate: string; mid: number }> = {},
  fallbackStatus = 404,
): { fetch: FetchLike; urls: string[] } {
  const urls: string[] = [];
  const fetch: FetchLike = (url) => {
    urls.push(url);
    const parsed = new URL(url);
    if (parsed.hostname === 'api.frankfurter.dev') {
      const date = parsed.pathname.split('/').pop() ?? '';
      const base = parsed.searchParams.get('base') ?? '';
      const symbol = parsed.searchParams.get('symbols') ?? '';
      const quote = frankfurter[`${date}|${base}|${symbol}`];
      if (!quote) return Promise.resolve(fakeResponse(fallbackStatus, {}));
      return Promise.resolve(
        fakeResponse(200, { base, date: quote.date, rates: { [symbol]: quote.rate } }),
      );
    }
    // /api/exchangerates/rates/<table>/<code>/<start>/<end>/
    const [, , , , table, code, , end] = parsed.pathname.split('/');
    const entry = table === 'a' ? nbp[`${code?.toUpperCase()}|${end}`] : undefined;
    if (!entry) return Promise.resolve(fakeResponse(404, {}));
    return Promise.resolve(fakeResponse(200, { table: 'A', code, rates: [entry] }));
  };
  return { fetch, urls };
}

async function user(h: Harness, username: string): Promise<User> {
  const { agent, session } = await signedIn(h.app, { username }, { timeZone: 'UTC' });
  return { agent, csrf: session.csrfToken };
}

function resolve(u: User, fromCurrency: string, toCurrency: string, date: string) {
  return u.agent
    .post('/api/v1/exchange-rates/resolve')
    .set('X-CSRF-Token', u.csrf)
    .send({ fromCurrency, toCurrency, date })
    .expect(200);
}

function manualRate(
  u: User,
  fromCurrency: string,
  toCurrency: string,
  rateDate: string,
  rate: string,
) {
  return u.agent
    .post('/api/v1/exchange-rates')
    .set('X-CSRF-Token', u.csrf)
    .send({ fromCurrency, toCurrency, rateDate, rate });
}

describe('currencies and exchange rates', () => {
  let h: Harness;
  let root: User;
  let alice: User;
  let bob: User;

  beforeAll(async () => {
    h = await createHarness();
    h.clock.set(NOW);
    root = await user(h, 'root'); // first user: ADMIN
    alice = await user(h, 'alice');
    bob = await user(h, 'bob');
  });
  afterAll(() => h.close());

  it('lists currencies including inactive ones', async () => {
    const res = await alice.agent.get('/api/v1/currencies').expect(200);
    const items = res.body.items as { code: string; exponent: number; active: boolean }[];
    expect(items.find((c) => c.code === 'JPY')).toMatchObject({ exponent: 0, active: true });
    expect(items.find((c) => c.code === 'HRK')).toMatchObject({ active: false });
  });

  it('resolves identity without a provider call', async () => {
    const fake = fakeProviders({});
    h.setFetch(fake.fetch);
    const res = await resolve(alice, 'PLN', 'PLN', '2026-11-02');
    expect(res.body).toMatchObject({
      status: 'FOUND',
      source: 'IDENTITY',
      rate: '1.000000000000',
      rateDate: '2026-11-02',
    });
    expect(fake.urls).toHaveLength(0);
  });

  it('fetches a provider rate once, caches it and derives the inverse', async () => {
    const fake = fakeProviders({ '2026-11-02|USD|PLN': { date: '2026-11-02', rate: 3.65 } });
    h.setFetch(fake.fetch);
    const first = await resolve(alice, 'USD', 'PLN', '2026-11-02');
    expect(first.body).toMatchObject({
      status: 'FOUND',
      source: 'PROVIDER',
      providerId: 'frankfurter',
      method: 'DIRECT',
      rate: '3.650000000000',
      rateDate: '2026-11-02',
      publishedOn: '2026-11-02',
      stale: false,
      estimate: false,
    });
    expect(fake.urls).toEqual(['https://api.frankfurter.dev/v1/2026-11-02?base=USD&symbols=PLN']);

    // Cached in the database: shared by every user, no second request.
    const again = await resolve(bob, 'USD', 'PLN', '2026-11-02');
    expect(again.body.rate).toBe('3.650000000000');
    const inverse = await resolve(alice, 'PLN', 'USD', '2026-11-02');
    expect(inverse.body).toMatchObject({ status: 'FOUND', method: 'INVERSE', source: 'PROVIDER' });
    expect(inverse.body.rate).toBe('0.273972602740');
    expect(fake.urls).toHaveLength(1);
  });

  it("prefers the caller's manual rate and upserts it (201, then 200)", async () => {
    const created = await manualRate(alice, 'USD', 'PLN', '2026-11-02', '3.7').expect(201);
    expect(created.body).toMatchObject({
      source: 'MANUAL',
      providerId: null,
      rate: '3.700000000000',
      rateDate: '2026-11-02',
    });
    const updated = await manualRate(alice, 'USD', 'PLN', '2026-11-02', '3.71').expect(200);
    expect(updated.body.id).toBe(created.body.id);
    expect(updated.body.rate).toBe('3.710000000000');

    const res = await resolve(alice, 'USD', 'PLN', '2026-11-02');
    expect(res.body).toMatchObject({ source: 'MANUAL', rate: '3.710000000000', method: 'DIRECT' });
    // bob keeps the provider rate.
    const other = await resolve(bob, 'USD', 'PLN', '2026-11-02');
    expect(other.body).toMatchObject({ source: 'PROVIDER', rate: '3.650000000000' });
  });

  it('rejects invalid manual rates', async () => {
    const same = await manualRate(alice, 'USD', 'USD', '2026-11-02', '1').expect(422);
    expect(same.body.code).toBe('VALIDATION_FAILED');
    const zero = await manualRate(alice, 'USD', 'PLN', '2026-11-02', '0').expect(422);
    expect(zero.body.code).toBe('VALIDATION_FAILED');
    const tooPrecise = await manualRate(alice, 'USD', 'PLN', '2026-11-02', '1.1234567890123');
    expect(tooPrecise.status).toBe(422);
  });

  it('filters GET /exchange-rates and shows own manual rates only', async () => {
    const all = await alice.agent
      .get('/api/v1/exchange-rates')
      .query({ from: 'USD', to: 'PLN', date: '2026-11-02' })
      .expect(200);
    const sources = (all.body.items as { source: string }[]).map((r) => r.source).sort();
    expect(sources).toEqual(['MANUAL', 'PROVIDER']);
    const bobs = await bob.agent
      .get('/api/v1/exchange-rates')
      .query({ from: 'USD', to: 'PLN' })
      .expect(200);
    expect((bobs.body.items as { source: string }[]).every((r) => r.source === 'PROVIDER')).toBe(
      true,
    );
    const none = await alice.agent
      .get('/api/v1/exchange-rates')
      .query({ from: 'USD', to: 'PLN', date: '2026-11-03' })
      .expect(200);
    expect(none.body.items).toEqual([]);
    await alice.agent.get('/api/v1/exchange-rates').query({ limit: 0 }).expect(422);
  });

  it('stores a weekend rate under the requested date with the publication date', async () => {
    const fake = fakeProviders({ '2026-11-08|GBP|PLN': { date: '2026-11-06', rate: 4.8 } });
    h.setFetch(fake.fetch);
    const res = await resolve(alice, 'GBP', 'PLN', '2026-11-08');
    expect(res.body).toMatchObject({
      status: 'FOUND',
      rateDate: '2026-11-08',
      publishedOn: '2026-11-06',
      stale: false,
    });
    const stored = await alice.agent
      .get('/api/v1/exchange-rates')
      .query({ from: 'GBP', to: 'PLN', date: '2026-11-08' })
      .expect(200);
    expect(stored.body.items).toHaveLength(1);
  });

  it('falls back to a stale rate within 7 days when the provider is down', async () => {
    h.setFetch(() => Promise.resolve(fakeResponse(503, {})));
    const stale = await resolve(alice, 'GBP', 'PLN', '2026-11-12');
    expect(stale.body).toMatchObject({
      status: 'FOUND',
      stale: true,
      rateDate: '2026-11-08',
      rate: '4.800000000000',
    });
    // More than 7 days later nothing is usable.
    const missing = await resolve(alice, 'GBP', 'PLN', '2026-11-16');
    expect(missing.body).toMatchObject({ status: 'MISSING', rate: null, source: null });
  });

  it('returns MISSING on provider failure and caches the failure for 5 minutes', async () => {
    let calls = 0;
    h.setFetch(() => {
      calls += 1;
      return Promise.resolve(fakeResponse(503, {}));
    });
    const missing = await resolve(alice, 'CHF', 'SEK', '2026-09-01');
    expect(missing.body.status).toBe('MISSING');
    expect(calls).toBe(1);
    await resolve(alice, 'CHF', 'SEK', '2026-09-01');
    expect(calls).toBe(1);
    h.clock.advance(5 * MINUTE + 1);
    await resolve(alice, 'CHF', 'SEK', '2026-09-01');
    expect(calls).toBe(2);
    h.clock.set(NOW);
    expect(h.logLines().some((line) => line['event'] === 'rates.provider_failed')).toBe(true);
  });

  it('returns MISSING for a network error without failing the request', async () => {
    h.setFetch(() => Promise.reject(new TypeError('fetch failed')));
    const res = await resolve(alice, 'CHF', 'NOK', '2026-09-02');
    expect(res.body.status).toBe('MISSING');
  });

  it('estimates a future date with the latest rate', async () => {
    const fake = fakeProviders({ '2026-11-19|USD|NOK': { date: '2026-11-19', rate: 10.5 } });
    h.setFetch(fake.fetch);
    const res = await resolve(alice, 'USD', 'NOK', '2026-12-01');
    expect(res.body).toMatchObject({
      status: 'FOUND',
      date: '2026-12-01',
      rateDate: '2026-11-19',
      estimate: true,
      stale: false,
    });
    expect(fake.urls).toEqual(['https://api.frankfurter.dev/v1/2026-11-19?base=USD&symbols=NOK']);
  });

  it("keeps today's not-yet-published rate in memory only", async () => {
    const fake = fakeProviders({ '2026-11-19|USD|SEK': { date: '2026-11-18', rate: 9.4 } });
    h.setFetch(fake.fetch);
    const res = await resolve(alice, 'USD', 'SEK', '2026-11-19');
    expect(res.body).toMatchObject({
      status: 'FOUND',
      rateDate: '2026-11-19',
      publishedOn: '2026-11-18',
    });
    const stored = await alice.agent
      .get('/api/v1/exchange-rates')
      .query({ from: 'USD', to: 'SEK' })
      .expect(200);
    expect(stored.body.items).toEqual([]);
    // Served from memory within 30 minutes; asked again afterwards.
    await resolve(alice, 'USD', 'SEK', '2026-11-19');
    expect(fake.urls).toHaveLength(1);
    h.clock.advance(31 * MINUTE);
    await resolve(alice, 'USD', 'SEK', '2026-11-19');
    expect(fake.urls).toHaveLength(2);
    h.clock.set(NOW);
  });

  it('requires the right token permissions', async () => {
    const created = await alice.agent
      .post('/api/v1/me/api-tokens')
      .set('X-CSRF-Token', alice.csrf)
      .send({ name: 'reader', permissions: ['currencies:read'] })
      .expect(201);
    const bearer = `Bearer ${created.body.secret as string}`;
    await request(h.app).get('/api/v1/currencies').set('Authorization', bearer).expect(200);
    await request(h.app).get('/api/v1/exchange-rates').set('Authorization', bearer).expect(200);
    const denied = await request(h.app)
      .post('/api/v1/exchange-rates')
      .set('Authorization', bearer)
      .send({ fromCurrency: 'USD', toCurrency: 'PLN', rateDate: '2026-11-02', rate: '3' })
      .expect(403);
    expect(denied.body.code).toBe('API_TOKEN_PERMISSION_DENIED');
  });

  describe('admin settings', () => {
    it('shows the default provider', async () => {
      const res = await root.agent.get('/api/v1/admin/settings').expect(200);
      expect(res.body).toEqual({
        rates: { provider: { value: 'frankfurter', default: 'frankfurter', lockedByEnv: false } },
      });
    });

    it('is admin-only and session-only', async () => {
      const forbidden = await alice.agent
        .patch('/api/v1/admin/settings')
        .set('X-CSRF-Token', alice.csrf)
        .send({ rates: { provider: 'nbp' } })
        .expect(403);
      expect(forbidden.body.code).toBe('FORBIDDEN');
      const created = await root.agent
        .post('/api/v1/me/api-tokens')
        .set('X-CSRF-Token', root.csrf)
        .send({ name: 'admin', permissions: ['currencies:read'] })
        .expect(201);
      const token = await request(h.app)
        .get('/api/v1/admin/settings')
        .set('Authorization', `Bearer ${created.body.secret as string}`)
        .expect(403);
      expect(token.body.code).toBe('API_TOKEN_NOT_ALLOWED');
    });

    it('switches to NBP, which crosses through PLN', async () => {
      const res = await root.agent
        .patch('/api/v1/admin/settings')
        .set('X-CSRF-Token', root.csrf)
        .send({ rates: { provider: 'nbp' } })
        .expect(200);
      expect(res.body.rates.provider).toMatchObject({ value: 'nbp', lockedByEnv: false });
      expect(
        h
          .logLines()
          .some((line) => line['action'] === 'settings.changed' && line['value'] === 'nbp'),
      ).toBe(true);

      const fake = fakeProviders(
        {},
        {
          'USD|2026-11-03': { effectiveDate: '2026-11-03', mid: 3.6 },
          'EUR|2026-11-03': { effectiveDate: '2026-11-02', mid: 4.25 },
        },
      );
      h.setFetch(fake.fetch);
      const cross = await resolve(alice, 'USD', 'EUR', '2026-11-03');
      // 3.6 × (1 / 4.25) via PLN; the older publication date wins.
      expect(cross.body).toMatchObject({
        status: 'FOUND',
        providerId: 'nbp',
        method: 'CROSS',
        pivot: 'PLN',
        publishedOn: '2026-11-02',
      });
      expect(cross.body.rate).toMatch(/^0\.8470588235\d{2}$/);
      expect(fake.urls.every((url) => url.startsWith('https://api.nbp.pl/api/'))).toBe(true);
      // Both legs were cached: no second fetch.
      const count = fake.urls.length;
      await resolve(bob, 'EUR', 'USD', '2026-11-03');
      expect(fake.urls).toHaveLength(count);

      await root.agent
        .patch('/api/v1/admin/settings')
        .set('X-CSRF-Token', root.csrf)
        .send({ rates: { provider: 'frankfurter' } })
        .expect(200);
    });

    it('validates the body', async () => {
      const res = await root.agent
        .patch('/api/v1/admin/settings')
        .set('X-CSRF-Token', root.csrf)
        .send({ rates: { provider: 'ecb' } })
        .expect(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });
});

describe('rate provider locked by RATE_PROVIDER', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness({ rateProvider: 'nbp' });
  });
  afterAll(() => h.close());

  it('reports the lock and refuses changes', async () => {
    const root = await user(h, 'root');
    const res = await root.agent.get('/api/v1/admin/settings').expect(200);
    expect(res.body.rates.provider).toEqual({
      value: 'nbp',
      default: 'frankfurter',
      lockedByEnv: true,
    });
    const locked = await root.agent
      .patch('/api/v1/admin/settings')
      .set('X-CSRF-Token', root.csrf)
      .send({ rates: { provider: 'frankfurter' } })
      .expect(409);
    expect(locked.body.code).toBe('SETTING_LOCKED_BY_ENV');
  });
});
