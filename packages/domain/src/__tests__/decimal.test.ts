import { describe, expect, it } from 'vitest';
import {
  Decimal,
  DecimalParseError,
  isDecimalString,
  parseDecimal,
  toDecimalString,
} from '../decimal.js';

describe('parseDecimal', () => {
  it.each(['0', '1', '-1', '1234.50', '-0.5', '0.000000000001', '999999999999999.9999'])(
    'accepts %s',
    (input) => {
      expect(parseDecimal(input).toFixed()).toBe(new Decimal(input).toFixed());
    },
  );

  it.each(['', ' 1', '1 ', '+1', '01', '1.', '.5', '1e3', '1,5', 'NaN', 'Infinity', '--1', '0x10'])(
    'rejects %j',
    (input) => {
      expect(() => parseDecimal(input)).toThrow(DecimalParseError);
    },
  );

  it('rejects overly long input', () => {
    expect(isDecimalString('1'.repeat(65))).toBe(false);
    expect(isDecimalString('1'.repeat(64))).toBe(true);
  });

  it('rejects non-strings', () => {
    expect(isDecimalString(12)).toBe(false);
    expect(isDecimalString(null)).toBe(false);
  });
});

describe('Decimal configuration', () => {
  it('keeps 34 significant digits', () => {
    expect(new Decimal(1).dividedBy(3).toFixed()).toBe('0.' + '3'.repeat(34));
  });

  it('never uses exponent notation', () => {
    expect(new Decimal('1e-20').toString()).toBe('0.00000000000000000001');
    expect(new Decimal('1e25').toString()).toBe('10000000000000000000000000');
  });

  it('rounds half up on magnitude', () => {
    expect(new Decimal('2.5').toDecimalPlaces(0).toFixed()).toBe('3');
    expect(new Decimal('-2.5').toDecimalPlaces(0).toFixed()).toBe('-3');
  });
});

describe('toDecimalString', () => {
  it('formats without scale', () => {
    expect(toDecimalString(new Decimal('12.340'))).toBe('12.34');
  });

  it('pads and rounds to a scale', () => {
    expect(toDecimalString(new Decimal('12.3'), 2)).toBe('12.30');
    expect(toDecimalString(new Decimal('12.345'), 2)).toBe('12.35');
  });

  it('normalizes negative zero', () => {
    expect(toDecimalString(new Decimal('-0'))).toBe('0');
    expect(toDecimalString(new Decimal('-0.001'), 2)).toBe('0.00');
  });
});
