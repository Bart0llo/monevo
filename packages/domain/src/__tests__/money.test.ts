import { describe, expect, it } from 'vitest';
import { UnknownCurrencyError } from '../currencies.js';
import { Decimal, DecimalParseError } from '../decimal.js';
import {
  MoneyError,
  addMoney,
  compareMoney,
  isNegativeMoney,
  isZeroMoney,
  money,
  moneyToDecimalString,
  negateMoney,
  roundToCurrency,
  roundedMoney,
  subtractMoney,
  sumMoney,
  zeroMoney,
} from '../money.js';

const pln = (amount: string) => money(amount, 'PLN');

function expectMoneyError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(MoneyError);
    expect((error as MoneyError).code).toBe(code);
    return;
  }
  throw new Error('expected a MoneyError');
}

describe('money', () => {
  it('creates money from a decimal string or Decimal', () => {
    expect(moneyToDecimalString(pln('12.5'))).toBe('12.50');
    expect(moneyToDecimalString(money(new Decimal('3'), 'JPY'))).toBe('3');
  });

  it('rejects amounts more precise than the currency exponent', () => {
    expectMoneyError(() => pln('0.001'), 'AMOUNT_PRECISION');
    expectMoneyError(() => money('1.5', 'JPY'), 'AMOUNT_PRECISION');
    expect(moneyToDecimalString(money('1.234', 'KWD'))).toBe('1.234');
  });

  it('rejects amounts outside NUMERIC(19,4)', () => {
    expectMoneyError(() => pln('1000000000000000'), 'AMOUNT_OUT_OF_RANGE');
    expectMoneyError(() => pln('-1000000000000000'), 'AMOUNT_OUT_OF_RANGE');
    expect(moneyToDecimalString(pln('999999999999999.99'))).toBe('999999999999999.99');
  });

  it('rejects invalid input', () => {
    expect(() => pln('1e3')).toThrow(DecimalParseError);
    expect(() => money('1', 'ABC')).toThrow(UnknownCurrencyError);
  });

  it('normalizes negative zero', () => {
    expect(moneyToDecimalString(pln('-0'))).toBe('0.00');
    expect(isNegativeMoney(pln('-0'))).toBe(false);
  });

  it('is immutable', () => {
    expect(Object.isFrozen(pln('1'))).toBe(true);
  });
});

describe('roundToCurrency', () => {
  it.each([
    ['1.005', 'PLN', '1.01'],
    ['1.004', 'PLN', '1'],
    ['-1.005', 'PLN', '-1.01'],
    ['2.5', 'JPY', '3'],
    ['-2.5', 'JPY', '-3'],
    ['1.2345', 'KWD', '1.235'],
    ['-0.004', 'PLN', '0'],
  ])('rounds %s %s half up to %s', (input, currency, expected) => {
    expect(roundToCurrency(new Decimal(input), currency).toFixed()).toBe(expected);
  });

  it('builds rounded money', () => {
    expect(moneyToDecimalString(roundedMoney('10.125', 'EUR'))).toBe('10.13');
    expect(moneyToDecimalString(roundedMoney(new Decimal(1).dividedBy(3), 'USD'))).toBe('0.33');
  });
});

describe('arithmetic', () => {
  it('adds and subtracts without float error', () => {
    expect(moneyToDecimalString(addMoney(pln('0.1'), pln('0.2')))).toBe('0.30');
    expect(moneyToDecimalString(subtractMoney(pln('0.3'), pln('0.1')))).toBe('0.20');
  });

  it('negates', () => {
    expect(moneyToDecimalString(negateMoney(pln('5.25')))).toBe('-5.25');
    expect(isNegativeMoney(negateMoney(pln('5.25')))).toBe(true);
  });

  it('compares', () => {
    expect(compareMoney(pln('1'), pln('2'))).toBe(-1);
    expect(compareMoney(pln('2'), pln('2.00'))).toBe(0);
    expect(compareMoney(pln('3'), pln('2'))).toBe(1);
  });

  it('detects zero', () => {
    expect(isZeroMoney(zeroMoney('EUR'))).toBe(true);
    expect(isZeroMoney(pln('0.01'))).toBe(false);
  });

  it('refuses to mix currencies', () => {
    const eur = money('1', 'EUR');
    expectMoneyError(() => addMoney(pln('1'), eur), 'CURRENCY_MISMATCH');
    expectMoneyError(() => subtractMoney(pln('1'), eur), 'CURRENCY_MISMATCH');
    expectMoneyError(() => compareMoney(pln('1'), eur), 'CURRENCY_MISMATCH');
  });

  it('enforces the range on results', () => {
    expectMoneyError(() => addMoney(pln('999999999999999.99'), pln('0.01')), 'AMOUNT_OUT_OF_RANGE');
  });
});

describe('sumMoney', () => {
  it('sums a list', () => {
    expect(moneyToDecimalString(sumMoney([pln('1.10'), pln('2.20'), pln('-0.30')], 'PLN'))).toBe(
      '3.00',
    );
  });

  it('returns zero for an empty list', () => {
    expect(moneyToDecimalString(sumMoney([], 'JPY'))).toBe('0');
  });

  it('enforces one currency', () => {
    expectMoneyError(() => sumMoney([pln('1'), money('1', 'EUR')], 'PLN'), 'CURRENCY_MISMATCH');
    expectMoneyError(() => sumMoney([pln('1')], 'EUR'), 'CURRENCY_MISMATCH');
  });
});
