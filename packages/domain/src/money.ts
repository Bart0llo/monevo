import { type CurrencyCode, currencyExponent, toCurrencyCode } from './currencies.js';
import { Decimal, parseDecimal, toDecimalString } from './decimal.js';

/** Money as in multi-currency.md#1-representing-money. Amounts never become JS numbers. */
export interface Money {
  readonly amount: Decimal;
  readonly currency: CurrencyCode;
}

/**
 * Stored amounts are NUMERIC(19,4): at most 15 integer digits, so |amount| < 10^15.
 * (database-architecture.md, data-model.md type `money`.)
 */
export const MAX_ABS_AMOUNT_EXCLUSIVE = new Decimal('1e15');

export type MoneyErrorCode = 'AMOUNT_PRECISION' | 'AMOUNT_OUT_OF_RANGE' | 'CURRENCY_MISMATCH';

export class MoneyError extends Error {
  constructor(
    readonly code: MoneyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MoneyError';
  }
}

function toDecimal(value: string | Decimal): Decimal {
  return typeof value === 'string' ? parseDecimal(value) : value;
}

function assertInRange(amount: Decimal): void {
  if (amount.abs().gte(MAX_ABS_AMOUNT_EXCLUSIVE)) {
    throw new MoneyError('AMOUNT_OUT_OF_RANGE', 'Amount exceeds the supported range');
  }
}

/**
 * Creates a Money value. The amount must already fit the currency's ISO exponent: rounding is
 * only allowed at the points listed in multi-currency.md#2-precision-and-rounding, through
 * {@link roundToCurrency} or {@link roundedMoney}.
 */
export function money(amount: string | Decimal, currency: string): Money {
  const code = toCurrencyCode(currency);
  const value = toDecimal(amount);
  if (value.decimalPlaces() > currencyExponent(code)) {
    throw new MoneyError('AMOUNT_PRECISION', `Too many decimal places for ${code}`);
  }
  assertInRange(value);
  return Object.freeze({ amount: value.isZero() ? new Decimal(0) : value, currency: code });
}

/** Rounds ROUND_HALF_UP to the currency's ISO exponent (the single rounding rule). */
export function roundToCurrency(amount: Decimal, currency: string): Decimal {
  const rounded = amount.toDecimalPlaces(currencyExponent(currency), Decimal.ROUND_HALF_UP);
  return rounded.isZero() ? new Decimal(0) : rounded;
}

/** Creates Money from an unrounded amount by rounding it to the currency first. */
export function roundedMoney(amount: string | Decimal, currency: string): Money {
  return money(roundToCurrency(toDecimal(amount), currency), currency);
}

export function zeroMoney(currency: string): Money {
  return money(new Decimal(0), currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError('CURRENCY_MISMATCH', `Cannot combine ${a.currency} with ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount.plus(b.amount), a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount.minus(b.amount), a.currency);
}

export function negateMoney(a: Money): Money {
  return money(a.amount.negated(), a.currency);
}

/** Returns -1, 0, or 1. Both values must have the same currency. */
export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  return a.amount.comparedTo(b.amount) as -1 | 0 | 1;
}

export function isZeroMoney(a: Money): boolean {
  return a.amount.isZero();
}

export function isNegativeMoney(a: Money): boolean {
  return a.amount.isNegative() && !a.amount.isZero();
}

/** Sums amounts of one currency; an empty list sums to zero in `currency`. */
export function sumMoney(items: readonly Money[], currency: string): Money {
  const code = toCurrencyCode(currency);
  let total = new Decimal(0);
  for (const item of items) {
    if (item.currency !== code) {
      throw new MoneyError('CURRENCY_MISMATCH', `Cannot sum ${item.currency} into ${code}`);
    }
    total = total.plus(item.amount);
  }
  return money(total, code);
}

/** The JSON form: a decimal string padded to the currency's exponent (`"12.50"`, `"1000"`). */
export function moneyToDecimalString(a: Money): string {
  return toDecimalString(a.amount, currencyExponent(a.currency));
}
