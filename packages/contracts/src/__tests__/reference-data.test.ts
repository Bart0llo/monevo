import { describe, expect, it } from 'vitest';
import {
  API_TOKEN_PERMISSIONS,
  API_TOKEN_PERMISSION_REQUIRES,
  AccountCreateSchema,
  AccountUpdateSchema,
  AdminSettingsUpdateSchema,
  BaseCurrencyChangeSchema,
  CategoryCreateSchema,
  CategoryReorderSchema,
  CategoryUpdateSchema,
  ColorSchema,
  ExchangeRateCreateSchema,
  ExchangeRateListQuerySchema,
  FIELD_ERROR_CODES,
  ICON_KEYS,
  IconKeySchema,
  LocalDateSchema,
  RateStringSchema,
} from '../index.js';

const UUID = '0b6f8d5e-4a8c-4e4f-9d61-6b7d3c2a1f00';

describe('Stage 3 scalars', () => {
  it('validates local dates', () => {
    expect(LocalDateSchema.safeParse('2026-11-19').success).toBe(true);
    expect(LocalDateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(LocalDateSchema.safeParse('2026-11-19T00:00:00Z').success).toBe(false);
  });

  it('validates rate strings', () => {
    expect(RateStringSchema.safeParse('4.265').success).toBe(true);
    expect(RateStringSchema.safeParse('0.000000000001').success).toBe(true);
    expect(RateStringSchema.safeParse('0.0000000000001').success).toBe(false);
    expect(RateStringSchema.safeParse('0').success).toBe(false);
    expect(RateStringSchema.safeParse('-1').success).toBe(false);
    expect(RateStringSchema.safeParse('1000000000000').success).toBe(false);
    expect(RateStringSchema.safeParse(4.2).success).toBe(false);
  });

  it('validates colors and icons', () => {
    expect(ColorSchema.safeParse('teal').success).toBe(true);
    expect(ColorSchema.safeParse('#1A2b3c').success).toBe(true);
    expect(ColorSchema.safeParse('#123').success).toBe(false);
    expect(ColorSchema.safeParse('magenta').success).toBe(false);
    expect(IconKeySchema.safeParse('wallet').success).toBe(true);
    expect(IconKeySchema.safeParse('IconWallet').success).toBe(false);
    for (const key of ICON_KEYS) expect(key).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
});

describe('accounts', () => {
  const base = {
    name: '  Main  ',
    currency: 'PLN',
    kind: 'BANK',
    icon: 'bank',
    color: 'blue',
    openingDate: '2026-11-01',
  };

  it('applies defaults and trims the name', () => {
    const parsed = AccountCreateSchema.parse(base);
    expect(parsed.name).toBe('Main');
    expect(parsed.openingBalance).toBe('0');
    expect(parsed.includeInNetWorthWidget).toBe(true);
  });

  it('requires customKindLabel exactly for CUSTOM', () => {
    expect(AccountCreateSchema.safeParse({ ...base, kind: 'CUSTOM' }).success).toBe(false);
    expect(
      AccountCreateSchema.safeParse({ ...base, kind: 'CUSTOM', customKindLabel: 'Broker' }).success,
    ).toBe(true);
    expect(AccountCreateSchema.safeParse({ ...base, customKindLabel: 'Broker' }).success).toBe(
      false,
    );
  });

  it('rejects unknown fields, float amounts and bad names', () => {
    expect(AccountCreateSchema.safeParse({ ...base, balance: '1' }).success).toBe(false);
    // eslint-disable-next-line monevo/no-float-money -- the float is the input under test
    expect(AccountCreateSchema.safeParse({ ...base, openingBalance: 12.5 }).success).toBe(false);
    expect(AccountCreateSchema.safeParse({ ...base, name: '   ' }).success).toBe(false);
    expect(AccountCreateSchema.safeParse({ ...base, name: 'x'.repeat(101) }).success).toBe(false);
  });

  it('accepts partial updates', () => {
    expect(AccountUpdateSchema.safeParse({ name: 'New', version: 2 }).success).toBe(true);
    expect(AccountUpdateSchema.safeParse({ archivedAt: null }).success).toBe(false);
  });
});

describe('categories', () => {
  it('validates create, update and reorder', () => {
    const create = { name: 'Food', type: 'EXPENSE', icon: 'shopping-cart', color: 'orange' };
    expect(CategoryCreateSchema.safeParse(create).success).toBe(true);
    expect(CategoryCreateSchema.safeParse({ ...create, type: 'TRANSFER' }).success).toBe(false);
    expect(CategoryUpdateSchema.safeParse({ parentId: null }).success).toBe(true);
    expect(CategoryReorderSchema.safeParse({ ids: [UUID] }).success).toBe(true);
    expect(CategoryReorderSchema.safeParse({ ids: [UUID, UUID] }).success).toBe(false);
    expect(CategoryReorderSchema.safeParse({ ids: [] }).success).toBe(false);
  });
});

describe('exchange rates', () => {
  it('rejects identical currencies for manual rates', () => {
    const rate = { fromCurrency: 'EUR', toCurrency: 'PLN', rateDate: '2026-11-19', rate: '4.265' };
    expect(ExchangeRateCreateSchema.safeParse(rate).success).toBe(true);
    expect(ExchangeRateCreateSchema.safeParse({ ...rate, toCurrency: 'EUR' }).success).toBe(false);
  });

  it('coerces and bounds the list limit', () => {
    expect(ExchangeRateListQuerySchema.parse({}).limit).toBe(50);
    expect(ExchangeRateListQuerySchema.parse({ limit: '200' }).limit).toBe(200);
    expect(ExchangeRateListQuerySchema.safeParse({ limit: '201' }).success).toBe(false);
  });
});

describe('settings', () => {
  it('requires an explicit confirmation for a base currency change', () => {
    expect(BaseCurrencyChangeSchema.safeParse({ baseCurrency: 'PLN', confirm: true }).success).toBe(
      true,
    );
    expect(
      BaseCurrencyChangeSchema.safeParse({ baseCurrency: 'PLN', confirm: false }).success,
    ).toBe(false);
    expect(BaseCurrencyChangeSchema.safeParse({ baseCurrency: 'PLN' }).success).toBe(false);
  });

  it('accepts only known rate providers', () => {
    expect(AdminSettingsUpdateSchema.safeParse({ rates: { provider: 'nbp' } }).success).toBe(true);
    expect(AdminSettingsUpdateSchema.safeParse({ rates: { provider: 'ecb' } }).success).toBe(false);
    expect(
      AdminSettingsUpdateSchema.safeParse({ rates: { provider: 'nbp', other: 1 } }).success,
    ).toBe(false);
  });

  it('lists the Stage 3 field error codes', () => {
    expect(FIELD_ERROR_CODES).toEqual(
      expect.arrayContaining(['AMOUNT_PRECISION', 'BASE_CURRENCY_UNCHANGED', 'CURRENCY_INACTIVE']),
    );
  });
});

describe('token permissions', () => {
  it('has an "also requires" entry for every permission', () => {
    for (const permission of API_TOKEN_PERMISSIONS) {
      expect(API_TOKEN_PERMISSION_REQUIRES[permission]).toBeDefined();
    }
    expect(API_TOKEN_PERMISSIONS).toContain('exchange-rates:create');
    expect(API_TOKEN_PERMISSIONS).toContain('categories:delete');
  });
});
