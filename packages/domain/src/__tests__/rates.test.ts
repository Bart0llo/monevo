import { describe, expect, it } from 'vitest';
import { Decimal } from '../decimal.js';
import { money, moneyToDecimalString } from '../money.js';
import {
  RateError,
  RATE_SCALE,
  convertAmount,
  crossRate,
  invertRate,
  isValidRateString,
  rateToDecimalString,
  roundRate,
} from '../rates.js';

function expectRateError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(RateError);
    expect((error as RateError).code).toBe(code);
    return;
  }
  throw new Error('expected a RateError');
}

describe('roundRate', () => {
  it('rounds to 12 dp ROUND_HALF_UP', () => {
    expect(rateToDecimalString(roundRate('1.0000000000005'))).toBe('1.000000000001');
    expect(rateToDecimalString(roundRate('1.0000000000004'))).toBe('1.000000000000');
    expect(rateToDecimalString(roundRate(new Decimal('4.265')))).toBe('4.265000000000');
    expect(RATE_SCALE).toBe(12);
  });

  it('rejects zero, negative and too-large rates', () => {
    expectRateError(() => roundRate('0'), 'RATE_NOT_POSITIVE');
    expectRateError(() => roundRate('-1'), 'RATE_NOT_POSITIVE');
    expectRateError(() => roundRate('0.0000000000001'), 'RATE_NOT_POSITIVE');
    expectRateError(() => roundRate('1000000000000'), 'RATE_OUT_OF_RANGE');
    expect(roundRate('999999999999.999999999999').toFixed()).toBe('999999999999.999999999999');
  });
});

describe('isValidRateString', () => {
  it('accepts storable rates only', () => {
    expect(isValidRateString('4.2650')).toBe(true);
    expect(isValidRateString('0.000000000001')).toBe(true);
    expect(isValidRateString('0.0000000000001')).toBe(false);
    expect(isValidRateString('0')).toBe(false);
    expect(isValidRateString('-2')).toBe(false);
    expect(isValidRateString('1000000000000')).toBe(false);
    expect(isValidRateString('1e3')).toBe(false);
    expect(isValidRateString('abc')).toBe(false);
  });
});

describe('invertRate', () => {
  it('computes 1/rate at full precision, then rounds to 12 dp', () => {
    expect(rateToDecimalString(invertRate('4'))).toBe('0.250000000000');
    expect(rateToDecimalString(invertRate('3'))).toBe('0.333333333333');
    expect(rateToDecimalString(invertRate('4.2650'))).toBe('0.234466588511');
    expect(rateToDecimalString(invertRate(new Decimal('0.234466588511')))).toBe('4.265000000002');
  });

  it('rejects non-positive rates', () => {
    expectRateError(() => invertRate('0'), 'RATE_NOT_POSITIVE');
    expectRateError(() => invertRate('-4'), 'RATE_NOT_POSITIVE');
  });
});

describe('crossRate', () => {
  it('multiplies via the pivot and rounds to 12 dp', () => {
    // EUR→PLN 4.2650, PLN→USD 0.25 → EUR→USD 1.06625
    expect(rateToDecimalString(crossRate('4.2650', '0.25'))).toBe('1.066250000000');
    expect(rateToDecimalString(crossRate('0.333333333333', '3'))).toBe('0.999999999999');
  });
});

describe('convertAmount', () => {
  it('rounds the product to the target currency exponent (ROUND_HALF_UP)', () => {
    expect(moneyToDecimalString(convertAmount(money('100.00', 'EUR'), '4.2650', 'PLN'))).toBe(
      '426.50',
    );
    expect(moneyToDecimalString(convertAmount(money('0.01', 'EUR'), '0.5', 'PLN'))).toBe('0.01');
    expect(moneyToDecimalString(convertAmount(money('-0.01', 'EUR'), '0.5', 'PLN'))).toBe('-0.01');
    expect(moneyToDecimalString(convertAmount(money('10.00', 'USD'), '151.235', 'JPY'))).toBe(
      '1512',
    );
    expect(moneyToDecimalString(convertAmount(money('1.000', 'KWD'), '3.25', 'USD'))).toBe('3.25');
  });

  it('accepts a Decimal rate and rejects unknown currencies', () => {
    expect(moneyToDecimalString(convertAmount(money('2', 'JPY'), new Decimal('0.5'), 'EUR'))).toBe(
      '1.00',
    );
    expect(() => convertAmount(money('2', 'JPY'), '1', 'XXX')).toThrow();
  });
});
