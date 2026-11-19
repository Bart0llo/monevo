import type { RateProviderId, ResolvedRate } from '@monevo/contracts';
import {
  addDays,
  crossRate,
  Decimal,
  invertRate,
  type LocalDate,
  localDateInZone,
  rateToDecimalString,
} from '@monevo/domain';
import { effectiveRateProvider } from '../../infra/app-settings.js';
import type { Clock } from '../../infra/clock.js';
import type { Logger } from '../../infra/logger.js';
import type { PrismaClient } from '../../infra/prisma.js';
import type { ProviderQuote, RateProvider } from './providers.js';
import { findRateCandidates, insertProviderRates } from './rates.repo.js';

// resolveRate (multi-currency.md#5-rate-resolution-algorithm): identity → manual exact → provider
// exact (direct, inverse, cross via the provider pivot) → on-demand provider fetch, cached → stale
// (up to 7 days back) → missing. A provider outage never becomes an error.

export const ALLOW_STALE_DAYS = 7;
/** Rates for today that may still be republished are kept in memory only. */
export const PROVISIONAL_TTL_MS = 30 * 60 * 1000;
/** Failed or empty provider lookups are not repeated for this long. */
export const NEGATIVE_TTL_MS = 5 * 60 * 1000;

export interface RateServiceDeps {
  readonly prisma: PrismaClient;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly providers: Readonly<Record<RateProviderId, RateProvider>>;
  /** `RATE_PROVIDER`; overrides the admin setting. */
  readonly rateProviderEnv: RateProviderId | undefined;
}

export interface ResolveInput {
  readonly userId: string;
  readonly timeZone: string;
  readonly fromCurrency: string;
  readonly toCurrency: string;
  readonly date: LocalDate;
}

export interface RateService {
  resolve(input: ResolveInput): Promise<ResolvedRate>;
}

interface Candidate {
  readonly source: 'MANUAL' | 'PROVIDER';
  readonly providerId: string | null;
  readonly from: string;
  readonly to: string;
  readonly rateDate: LocalDate;
  readonly rate: Decimal;
  readonly publishedOn: LocalDate | null;
}

interface Pick {
  readonly source: 'MANUAL' | 'PROVIDER';
  readonly providerId: string | null;
  readonly rate: Decimal;
  readonly rateDate: LocalDate;
  readonly publishedOn: LocalDate | null;
  readonly method: 'DIRECT' | 'INVERSE' | 'CROSS';
  readonly pivot: string | null;
}

/** `from → to` on `date` from one source: direct, else inverse. */
function directOrInverse(
  rows: readonly Candidate[],
  from: string,
  to: string,
): { rate: Decimal; row: Candidate; method: 'DIRECT' | 'INVERSE' } | undefined {
  const direct = rows.find((row) => row.from === from && row.to === to);
  if (direct) return { rate: direct.rate, row: direct, method: 'DIRECT' };
  const inverse = rows.find((row) => row.from === to && row.to === from);
  if (inverse) return { rate: invertRate(inverse.rate), row: inverse, method: 'INVERSE' };
  return undefined;
}

function olderOf(a: LocalDate | null, b: LocalDate | null): LocalDate | null {
  if (a === null || b === null) return a ?? b;
  return a < b ? a : b;
}

function pickOn(
  candidates: readonly Candidate[],
  date: LocalDate,
  from: string,
  to: string,
  pivot: string,
): Pick | undefined {
  const onDate = candidates.filter((row) => row.rateDate === date);
  const manual = directOrInverse(
    onDate.filter((row) => row.source === 'MANUAL'),
    from,
    to,
  );
  if (manual) {
    return {
      source: 'MANUAL',
      providerId: null,
      rate: manual.rate,
      rateDate: date,
      publishedOn: null,
      method: manual.method,
      pivot: null,
    };
  }
  const provider = onDate.filter((row) => row.source === 'PROVIDER');
  const exact = directOrInverse(provider, from, to);
  if (exact) {
    return {
      source: 'PROVIDER',
      providerId: exact.row.providerId,
      rate: exact.rate,
      rateDate: date,
      publishedOn: exact.row.publishedOn,
      method: exact.method,
      pivot: null,
    };
  }
  if (from === pivot || to === pivot) return undefined;
  const first = directOrInverse(provider, from, pivot);
  const second = directOrInverse(provider, pivot, to);
  if (!first || !second) return undefined;
  return {
    source: 'PROVIDER',
    providerId: first.row.providerId,
    rate: crossRate(first.rate, second.rate),
    rateDate: date,
    publishedOn: olderOf(first.row.publishedOn, second.row.publishedOn),
    method: 'CROSS',
    pivot,
  };
}

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

export function createRateService(deps: RateServiceDeps): RateService {
  const { prisma, clock, logger, providers } = deps;
  const provisional = new Map<string, CacheEntry<readonly ProviderQuote[]>>();
  const negative = new Map<string, CacheEntry<true>>();

  function cached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= clock.now().getTime()) {
      cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  function toCandidates(
    quotes: readonly ProviderQuote[],
    providerId: string,
    rateDate: LocalDate,
  ): Candidate[] {
    return quotes.map((quote) => ({
      source: 'PROVIDER',
      providerId,
      from: quote.from,
      to: quote.to,
      rateDate,
      rate: quote.rate,
      publishedOn: quote.publishedOn,
    }));
  }

  /** Asks the provider for `date` and caches the result; returns the new candidates. */
  async function fetchFromProvider(
    provider: RateProvider,
    from: string,
    to: string,
    date: LocalDate,
    today: LocalDate,
  ): Promise<Candidate[]> {
    const key = `${provider.id}|${from}|${to}|${date}`;
    const memo = cached(provisional, key);
    if (memo) return toCandidates(memo, provider.id, date);
    if (cached(negative, key)) return [];
    const now = clock.now();
    let quotes: ProviderQuote[];
    try {
      quotes = await provider.fetchQuotes(from, to, date);
    } catch (error) {
      logger.warn(
        {
          event: 'rates.provider_failed',
          providerId: provider.id,
          from,
          to,
          date,
          reason: error instanceof Error ? error.message : 'unknown',
        },
        'rate provider request failed',
      );
      negative.set(key, { value: true, expiresAt: now.getTime() + NEGATIVE_TTL_MS });
      return [];
    }
    if (quotes.length === 0) {
      negative.set(key, { value: true, expiresAt: now.getTime() + NEGATIVE_TTL_MS });
      return [];
    }
    // Today's rate may still be published later: keep a fallback quote in memory only.
    const final = quotes.filter((quote) => !(date >= today && quote.publishedOn < date));
    const pending = quotes.filter((quote) => date >= today && quote.publishedOn < date);
    await insertProviderRates(
      prisma,
      final.map((quote) => ({
        providerId: provider.id,
        fromCurrency: quote.from,
        toCurrency: quote.to,
        rateDate: date,
        rate: quote.rate,
        publishedOn: quote.publishedOn,
        pivot: provider.pivot,
        fetchedAt: now,
      })),
    );
    if (pending.length > 0) {
      provisional.set(key, { value: quotes, expiresAt: now.getTime() + PROVISIONAL_TTL_MS });
    }
    return toCandidates(quotes, provider.id, date);
  }

  return {
    async resolve(input) {
      const { userId, fromCurrency: from, toCurrency: to } = input;
      const today = localDateInZone(clock.now(), input.timeZone);
      const estimate = input.date > today;
      const date = estimate ? today : input.date;
      const base: ResolvedRate = {
        status: 'MISSING',
        fromCurrency: from,
        toCurrency: to,
        date: input.date,
        rate: null,
        source: null,
        providerId: null,
        rateDate: null,
        publishedOn: null,
        method: null,
        pivot: null,
        stale: false,
        estimate,
      };
      if (from === to) {
        return {
          ...base,
          status: 'FOUND',
          rate: rateToDecimalString(new Decimal(1)),
          source: 'IDENTITY',
          rateDate: input.date,
        };
      }

      const providerId = await effectiveRateProvider(prisma, deps.rateProviderEnv);
      const provider = providers[providerId];
      const pivot = provider.pivot;
      const candidates: Candidate[] = (
        await findRateCandidates(prisma, {
          userId,
          providerId,
          currencies: [...new Set([from, to, pivot])],
          fromDate: addDays(date, -ALLOW_STALE_DAYS),
          toDate: date,
        })
      ).map((row) => ({
        source: row.source,
        providerId: row.providerId,
        from: row.fromCurrency,
        to: row.toCurrency,
        rateDate: row.rateDate,
        rate: row.rate,
        publishedOn: row.publishedOn,
      }));

      const found = (pick: Pick, stale: boolean): ResolvedRate => ({
        ...base,
        status: 'FOUND',
        rate: rateToDecimalString(pick.rate),
        source: pick.source,
        providerId: pick.providerId,
        rateDate: pick.rateDate,
        publishedOn: pick.publishedOn,
        method: pick.method,
        pivot: pick.pivot,
        stale,
      });

      const exact = pickOn(candidates, date, from, to, pivot);
      if (exact) return found(exact, false);

      candidates.push(...(await fetchFromProvider(provider, from, to, date, today)));
      const fetched = pickOn(candidates, date, from, to, pivot);
      if (fetched) return found(fetched, false);

      for (let back = 1; back <= ALLOW_STALE_DAYS; back += 1) {
        const stale = pickOn(candidates, addDays(date, -back), from, to, pivot);
        if (stale) return found(stale, true);
      }
      return base;
    },
  };
}
