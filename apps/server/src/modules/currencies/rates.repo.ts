import { uuidv7 } from 'uuidv7';
import { Decimal, type LocalDate, rateToDecimalString } from '@monevo/domain';
import type { Prisma } from '../../generated/prisma/client.js';
import { fromDbDate, toDbDate } from '../../infra/db-dates.js';
import type { Db } from '../../infra/prisma.js';

// Currencies and exchange rates (data-model.md#currencies-and-rates). Provider rates are global
// (user_id null); manual rates are always reached by the authenticated `userId`.

export interface CurrencyRecord {
  readonly code: string;
  readonly exponent: number;
  readonly name: string;
  readonly active: boolean;
}

export async function listCurrencies(db: Db): Promise<CurrencyRecord[]> {
  return db.currency.findMany({ orderBy: { code: 'asc' } });
}

export async function findCurrency(db: Db, code: string): Promise<CurrencyRecord | null> {
  return db.currency.findUnique({ where: { code } });
}

export interface RateRecord {
  readonly id: string;
  readonly userId: string | null;
  readonly fromCurrency: string;
  readonly toCurrency: string;
  readonly rateDate: LocalDate;
  readonly rate: Decimal;
  readonly source: 'PROVIDER' | 'MANUAL';
  readonly providerId: string | null;
  readonly publishedOn: LocalDate | null;
  readonly fetchedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const RATE_SELECT = {
  id: true,
  userId: true,
  fromCurrency: true,
  toCurrency: true,
  rateDate: true,
  rate: true,
  source: true,
  providerId: true,
  publishedOn: true,
  fetchedAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ExchangeRateSelect;

type RateRow = Prisma.ExchangeRateGetPayload<{ select: typeof RATE_SELECT }>;

function toRecord(row: RateRow): RateRecord {
  return {
    ...row,
    rateDate: fromDbDate(row.rateDate),
    rate: new Decimal(row.rate.toString()),
    publishedOn: row.publishedOn ? fromDbDate(row.publishedOn) : null,
  };
}

/** Rows visible to `userId`: their manual rates and every provider rate. */
function visibleTo(userId: string): Prisma.ExchangeRateWhereInput {
  return { OR: [{ source: 'MANUAL', userId }, { source: 'PROVIDER' }] };
}

export interface RateCandidateQuery {
  readonly userId: string;
  readonly providerId: string;
  readonly currencies: readonly string[];
  readonly fromDate: LocalDate;
  readonly toDate: LocalDate;
}

/** Manual rates of the user and rates of the active provider among `currencies` in the window. */
export async function findRateCandidates(db: Db, query: RateCandidateQuery): Promise<RateRecord[]> {
  const rows = await db.exchangeRate.findMany({
    where: {
      fromCurrency: { in: [...query.currencies] },
      toCurrency: { in: [...query.currencies] },
      rateDate: { gte: toDbDate(query.fromDate), lte: toDbDate(query.toDate) },
      OR: [
        { source: 'MANUAL', userId: query.userId },
        { source: 'PROVIDER', providerId: query.providerId },
      ],
    },
    select: RATE_SELECT,
  });
  return rows.map(toRecord);
}

export interface NewProviderRate {
  readonly providerId: string;
  readonly fromCurrency: string;
  readonly toCurrency: string;
  readonly rateDate: LocalDate;
  readonly rate: Decimal;
  readonly publishedOn: LocalDate;
  readonly pivot: string;
  readonly fetchedAt: Date;
}

/** Caches provider rates; an existing row for the same key wins (ON CONFLICT DO NOTHING). */
export async function insertProviderRates(
  db: Db,
  rates: readonly NewProviderRate[],
): Promise<void> {
  if (rates.length === 0) return;
  await db.exchangeRate.createMany({
    data: rates.map((rate) => ({
      id: uuidv7(),
      userId: null,
      fromCurrency: rate.fromCurrency,
      toCurrency: rate.toCurrency,
      rateDate: toDbDate(rate.rateDate),
      rate: rateToDecimalString(rate.rate),
      source: 'PROVIDER' as const,
      providerId: rate.providerId,
      publishedOn: toDbDate(rate.publishedOn),
      metadata: { pivot: rate.pivot },
      fetchedAt: rate.fetchedAt,
    })),
    skipDuplicates: true,
  });
}

export interface ManualRateInput {
  readonly userId: string;
  readonly fromCurrency: string;
  readonly toCurrency: string;
  readonly rateDate: LocalDate;
  readonly rate: Decimal;
}

/** Creates or replaces the user's manual rate for (pair, date). */
export async function upsertManualRate(
  db: Db,
  input: ManualRateInput,
): Promise<{ record: RateRecord; created: boolean }> {
  const rows = await db.$queryRaw<{ id: string; inserted: boolean }[]>`
    INSERT INTO "exchange_rates"
      ("id", "user_id", "from_currency", "to_currency", "rate_date", "rate", "source", "updated_at")
    VALUES (
      ${uuidv7()}::uuid, ${input.userId}::uuid, ${input.fromCurrency}, ${input.toCurrency},
      ${input.rateDate}::date, ${rateToDecimalString(input.rate)}::numeric, 'MANUAL'::"RateSource", now()
    )
    ON CONFLICT (
      COALESCE("user_id", '00000000-0000-0000-0000-000000000000'::uuid),
      "source", COALESCE("provider_id", ''), "from_currency", "to_currency", "rate_date"
    )
    DO UPDATE SET "rate" = EXCLUDED."rate", "updated_at" = now()
    RETURNING "id"::text AS "id", (xmax = 0) AS "inserted"`;
  const row = rows[0];
  if (!row) throw new Error('manual rate upsert returned no row');
  const stored = await db.exchangeRate.findFirst({
    where: { id: row.id, userId: input.userId },
    select: RATE_SELECT,
  });
  if (!stored) throw new Error('manual rate disappeared after upsert');
  return { record: toRecord(stored), created: row.inserted };
}

export interface RateListQuery {
  readonly userId: string;
  readonly from: string | undefined;
  readonly to: string | undefined;
  readonly date: LocalDate | undefined;
  readonly limit: number;
}

export async function listRates(db: Db, query: RateListQuery): Promise<RateRecord[]> {
  const rows = await db.exchangeRate.findMany({
    where: {
      ...visibleTo(query.userId),
      ...(query.from ? { fromCurrency: query.from } : {}),
      ...(query.to ? { toCurrency: query.to } : {}),
      ...(query.date ? { rateDate: toDbDate(query.date) } : {}),
    },
    orderBy: [{ rateDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit,
    select: RATE_SELECT,
  });
  return rows.map(toRecord);
}
