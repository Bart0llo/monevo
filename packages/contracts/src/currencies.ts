import { InstantSchema, UuidSchema } from './auth.js';
import { CurrencyCodeSchema, LocalDateSchema, RateStringSchema } from './common.js';
import { z } from './zod.js';

// Currencies and exchange rates (multi-currency.md, data-model.md#currencies-and-rates).

/** Rate providers an admin can select (multi-currency.md#8-rate-providers). */
export const RATE_PROVIDERS = ['frankfurter', 'nbp'] as const;
export const RateProviderIdSchema = z.enum(RATE_PROVIDERS).openapi('RateProviderId');
export type RateProviderId = z.infer<typeof RateProviderIdSchema>;
export const DEFAULT_RATE_PROVIDER: RateProviderId = 'frankfurter';

export const CurrencySchema = z
  .object({
    code: z.string(),
    exponent: z.number().int().min(0).max(4),
    /** English reference name; clients localize with `Intl.DisplayNames`. */
    name: z.string(),
    /** Inactive codes are hidden in pickers but stay valid for history. */
    active: z.boolean(),
  })
  .openapi('Currency');

export const CurrencyListResponseSchema = z
  .object({ items: z.array(CurrencySchema) })
  .openapi('CurrencyListResponse');

export const RATE_SOURCES = ['PROVIDER', 'MANUAL'] as const;
export const RateSourceSchema = z.enum(RATE_SOURCES).openapi('RateSource');
export type RateSource = z.infer<typeof RateSourceSchema>;

export const ExchangeRateSchema = z
  .object({
    id: UuidSchema,
    fromCurrency: z.string(),
    toCurrency: z.string(),
    rateDate: LocalDateSchema,
    /** 1 `fromCurrency` = `rate` `toCurrency`; 12 fraction digits. */
    rate: z.string(),
    source: RateSourceSchema,
    /** Set for provider rates. */
    providerId: z.string().nullable(),
    /** The provider's actual publication date (may precede `rateDate` on non-business days). */
    publishedOn: LocalDateSchema.nullable(),
    fetchedAt: InstantSchema.nullable(),
    createdAt: InstantSchema,
    updatedAt: InstantSchema,
  })
  .openapi('ExchangeRate');

export const EXCHANGE_RATE_LIST_LIMIT_DEFAULT = 50;
export const EXCHANGE_RATE_LIST_LIMIT_MAX = 200;

/** Own manual rates plus provider rates, newest `rateDate` first. */
export const ExchangeRateListQuerySchema = z.strictObject({
  from: CurrencyCodeSchema.optional(),
  to: CurrencyCodeSchema.optional(),
  date: LocalDateSchema.optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(EXCHANGE_RATE_LIST_LIMIT_MAX)
    .default(EXCHANGE_RATE_LIST_LIMIT_DEFAULT),
});

export const ExchangeRateListResponseSchema = z
  .object({ items: z.array(ExchangeRateSchema) })
  .openapi('ExchangeRateListResponse');

const differentCurrencies = (value: { fromCurrency: string; toCurrency: string }) =>
  value.fromCurrency !== value.toCurrency;
const DIFFERENT_CURRENCIES = {
  message: 'fromCurrency and toCurrency must differ',
  path: ['toCurrency'],
};

/** Creates or replaces the caller's manual rate for (pair, date): 201 created, 200 updated. */
export const ExchangeRateCreateSchema = z
  .strictObject({
    fromCurrency: CurrencyCodeSchema,
    toCurrency: CurrencyCodeSchema,
    rateDate: LocalDateSchema,
    rate: RateStringSchema,
  })
  .refine(differentCurrencies, DIFFERENT_CURRENCIES)
  .openapi('ExchangeRateCreate');

export const ExchangeRateResolveRequestSchema = z
  .strictObject({
    fromCurrency: CurrencyCodeSchema,
    toCurrency: CurrencyCodeSchema,
    date: LocalDateSchema,
  })
  .openapi('ExchangeRateResolveRequest');

export const RESOLVED_RATE_STATUSES = ['FOUND', 'MISSING'] as const;
export const RESOLVED_RATE_SOURCES = ['IDENTITY', 'MANUAL', 'PROVIDER'] as const;
export const RESOLVED_RATE_METHODS = ['DIRECT', 'INVERSE', 'CROSS'] as const;

/** Result of `resolveRate` (multi-currency.md#5-rate-resolution-algorithm). Never an error. */
export const ResolvedRateSchema = z
  .object({
    status: z.enum(RESOLVED_RATE_STATUSES),
    fromCurrency: z.string(),
    toCurrency: z.string(),
    /** The requested date. */
    date: LocalDateSchema,
    rate: z.string().nullable(),
    source: z.enum(RESOLVED_RATE_SOURCES).nullable(),
    providerId: z.string().nullable(),
    /** Date of the stored rate used (differs from `date` when stale or estimated). */
    rateDate: LocalDateSchema.nullable(),
    publishedOn: LocalDateSchema.nullable(),
    method: z.enum(RESOLVED_RATE_METHODS).nullable(),
    /** Pivot currency of a cross rate. */
    pivot: z.string().nullable(),
    /** A rate from an earlier date (within 7 days) was used. */
    stale: z.boolean(),
    /** `date` is in the future: the latest available rate was used. */
    estimate: z.boolean(),
  })
  .openapi('ResolvedRate');

export type Currency = z.infer<typeof CurrencySchema>;
export type CurrencyListResponse = z.infer<typeof CurrencyListResponseSchema>;
export type ExchangeRate = z.infer<typeof ExchangeRateSchema>;
export type ExchangeRateListQuery = z.infer<typeof ExchangeRateListQuerySchema>;
export type ExchangeRateListResponse = z.infer<typeof ExchangeRateListResponseSchema>;
export type ExchangeRateCreate = z.infer<typeof ExchangeRateCreateSchema>;
export type ExchangeRateResolveRequest = z.infer<typeof ExchangeRateResolveRequestSchema>;
export type ResolvedRate = z.infer<typeof ResolvedRateSchema>;
