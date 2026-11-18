import { describe, expect, it } from 'vitest';
import {
  CURRENCIES,
  UnknownCurrencyError,
  currencyExponent,
  getCurrency,
  isCurrencyCode,
  toCurrencyCode,
} from '../currencies.js';

describe('currency table', () => {
  it('has unique, sorted, uppercase three-letter codes', () => {
    const codes = CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes].sort()).toEqual(codes);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('uses exponents between 0 and 4', () => {
    for (const c of CURRENCIES) {
      expect(c.exponent).toBeGreaterThanOrEqual(0);
      expect(c.exponent).toBeLessThanOrEqual(4);
    }
  });

  it('knows well-known exponents', () => {
    expect(currencyExponent('PLN')).toBe(2);
    expect(currencyExponent('EUR')).toBe(2);
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('KWD')).toBe(3);
  });

  it('marks replaced currencies inactive', () => {
    for (const code of ['ANG', 'BGN', 'HRK', 'SLL', 'ZWL', 'CUC']) {
      expect(getCurrency(code).active).toBe(false);
    }
    expect(getCurrency('XCG').active).toBe(true);
  });

  it('excludes fund, metal, and testing codes', () => {
    for (const code of ['XAU', 'XAG', 'XPT', 'XPD', 'XDR', 'XTS', 'XXX', 'CLF', 'BOV', 'USN']) {
      expect(isCurrencyCode(code)).toBe(false);
    }
  });

  it('rejects unknown and lowercase codes', () => {
    expect(isCurrencyCode('pln')).toBe(false);
    expect(isCurrencyCode(42)).toBe(false);
    expect(() => getCurrency('ABC')).toThrow(UnknownCurrencyError);
    expect(() => toCurrencyCode('usd')).toThrow(UnknownCurrencyError);
    expect(toCurrencyCode('USD')).toBe('USD');
  });

  it('is immutable', () => {
    expect(Object.isFrozen(CURRENCIES)).toBe(true);
    expect(Object.isFrozen(CURRENCIES[0])).toBe(true);
  });
});
