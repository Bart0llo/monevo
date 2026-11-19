import { toCurrencyCode } from './currencies.js';
import { Decimal, parseDecimal, toDecimalString } from './decimal.js';
import { type Money, money, roundToCurrency } from './money.js';

/**
 * Exchange rate math (multi-currency.md#3-exchange-rate-semantics). A rate for (from, to) means
 * 1 unit of `from` = `rate` units of `to`. Rates are stored as NUMERIC(24,12): 12 decimal places
 * and at most 12 integer digits. Derived rates (inverse, cross) are computed at full precision and
 * then rounded to 12 dp, ROUND_HALF_UP.
 */
export const RATE_SCALE = 12;

/** NUMERIC(24,12) allows at most 12 integer digits: rate < 10^12. */
export const MAX_RATE_EXCLUSIVE = new Decimal('1e12');

export type RateErrorCode = 'RATE_NOT_POSITIVE' | 'RATE_OUT_OF_RANGE';

export class RateError extends Error {
  constructor(
    readonly code: RateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RateError';
  }
}

function toDecimal(value: string | Decimal): Decimal {
  return typeof value === 'string' ? parseDecimal(value) : value;
}

/** Rounds a rate to 12 dp ROUND_HALF_UP and checks it is storable (> 0 and < 10^12). */
export function roundRate(value: string | Decimal): Decimal {
  const rounded = toDecimal(value).toDecimalPlaces(RATE_SCALE, Decimal.ROUND_HALF_UP);
  if (rounded.lte(0)) throw new RateError('RATE_NOT_POSITIVE', 'A rate must be greater than zero');
  if (rounded.gte(MAX_RATE_EXCLUSIVE)) {
    throw new RateError('RATE_OUT_OF_RANGE', 'A rate must be less than 10^12');
  }
  return rounded;
}

/** Whether a decimal string is a storable rate (positive, ≤ 12 dp, < 10^12), without rounding. */
export function isValidRateString(value: string): boolean {
  try {
    const rate = parseDecimal(value);
    return rate.gt(0) && rate.decimalPlaces() <= RATE_SCALE && rate.lt(MAX_RATE_EXCLUSIVE);
  } catch {
    return false;
  }
}

/** rate(to → from) = 1 / rate(from → to), rounded to 12 dp. */
export function invertRate(rate: string | Decimal): Decimal {
  const value = toDecimal(rate);
  if (value.lte(0)) throw new RateError('RATE_NOT_POSITIVE', 'A rate must be greater than zero');
  return roundRate(new Decimal(1).div(value));
}

/** rate(A → B) = rate(A → P) × rate(P → B), rounded to 12 dp (triangulation via pivot P). */
export function crossRate(fromToPivot: string | Decimal, pivotToTarget: string | Decimal): Decimal {
  return roundRate(toDecimal(fromToPivot).times(toDecimal(pivotToTarget)));
}

/** convert(amount, from → to, rate) = roundToCurrency(amount × rate, to). */
export function convertAmount(amount: Money, rate: string | Decimal, toCurrency: string): Money {
  const code = toCurrencyCode(toCurrency);
  return money(roundToCurrency(amount.amount.times(toDecimal(rate)), code), code);
}

/** The JSON form of a rate: a decimal string with exactly 12 fraction digits. */
export function rateToDecimalString(rate: Decimal): string {
  return toDecimalString(rate, RATE_SCALE);
}
