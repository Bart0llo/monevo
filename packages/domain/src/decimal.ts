import { Decimal as DecimalJs } from 'decimal.js';

/**
 * The only Decimal constructor used for money and rates. Configuration is canonical in
 * multi-currency.md#2-precision-and-rounding: precision 34, ROUND_HALF_UP, and no exponent
 * notation in string output.
 */
export const Decimal = DecimalJs.clone({
  precision: 34,
  rounding: DecimalJs.ROUND_HALF_UP,
  toExpNeg: -9e15,
  toExpPos: 9e15,
});

export type Decimal = DecimalJs;

/** A plain decimal string: optional minus, digits, optional fraction, no exponent, no `+`. */
const DECIMAL_STRING = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

/** Upper bound on accepted input length, to keep parsing cheap on hostile input. */
const MAX_DECIMAL_STRING_LENGTH = 64;

export class DecimalParseError extends Error {
  constructor(readonly input: unknown) {
    super('Invalid decimal string');
    this.name = 'DecimalParseError';
  }
}

export function isDecimalString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_DECIMAL_STRING_LENGTH &&
    DECIMAL_STRING.test(value)
  );
}

/** Parses a strict decimal string (`"1234.50"`, `"-0.5"`). Never accepts numbers or exponents. */
export function parseDecimal(value: string): Decimal {
  if (!isDecimalString(value)) {
    throw new DecimalParseError(value);
  }
  return new Decimal(value);
}

/**
 * Formats a Decimal as a plain decimal string without exponent notation. With `scale`, the value
 * is rounded ROUND_HALF_UP and padded to exactly that many fraction digits. Negative zero is
 * normalized to zero.
 */
export function toDecimalString(value: Decimal, scale?: number): string {
  const rounded = scale === undefined ? value : value.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
  const normalized = rounded.isZero() ? new Decimal(0) : rounded;
  return scale === undefined ? normalized.toFixed() : normalized.toFixed(scale);
}
