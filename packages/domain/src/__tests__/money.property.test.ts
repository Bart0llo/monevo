import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CURRENCIES } from '../currencies.js';
import { Decimal, parseDecimal, toDecimalString } from '../decimal.js';
import {
  addMoney,
  compareMoney,
  money,
  moneyToDecimalString,
  negateMoney,
  roundToCurrency,
  subtractMoney,
  sumMoney,
} from '../money.js';

const currencyArb = fc.constantFrom(...CURRENCIES.map((c) => c));

/** A valid money decimal string for a currency, well within NUMERIC(19,4). */
function amountArb(exponent: number): fc.Arbitrary<string> {
  return fc
    .bigInt({ min: -(10n ** 13n), max: 10n ** 13n })
    .map((minor) => toDecimalString(new Decimal(minor.toString()).dividedBy(10 ** exponent)));
}

const moneyPairArb = currencyArb.chain((c) =>
  fc.tuple(amountArb(c.exponent), amountArb(c.exponent)).map(([a, b]) => ({
    a: money(a, c.code),
    b: money(b, c.code),
  })),
);

describe('money properties', () => {
  it('decimal strings round-trip through parseDecimal', () => {
    fc.assert(
      fc.property(currencyArb, (c) =>
        fc.assert(
          fc.property(amountArb(c.exponent), (s) => {
            expect(toDecimalString(parseDecimal(s))).toBe(s);
          }),
          { numRuns: 20 },
        ),
      ),
      { numRuns: 20 },
    );
  });

  it('addition is commutative and subtraction inverts it', () => {
    fc.assert(
      fc.property(moneyPairArb, ({ a, b }) => {
        expect(compareMoney(addMoney(a, b), addMoney(b, a))).toBe(0);
        expect(compareMoney(subtractMoney(addMoney(a, b), b), a)).toBe(0);
      }),
    );
  });

  it('negation is an involution and a + (-a) = 0', () => {
    fc.assert(
      fc.property(moneyPairArb, ({ a }) => {
        expect(compareMoney(negateMoney(negateMoney(a)), a)).toBe(0);
        expect(addMoney(a, negateMoney(a)).amount.isZero()).toBe(true);
      }),
    );
  });

  it('sumMoney equals repeated addition', () => {
    fc.assert(
      fc.property(
        currencyArb.chain((c) =>
          fc.array(amountArb(c.exponent), { maxLength: 30 }).map((xs) => ({
            code: c.code,
            items: xs.map((x) => money(x, c.code)),
          })),
        ),
        ({ code, items }) => {
          const folded = items.reduce((acc, m) => addMoney(acc, m), money('0', code));
          expect(compareMoney(sumMoney(items, code), folded)).toBe(0);
        },
      ),
    );
  });

  it('rounding stays within half a minor unit and is idempotent', () => {
    fc.assert(
      fc.property(currencyArb, fc.bigInt({ min: -(10n ** 18n), max: 10n ** 18n }), (c, raw) => {
        const value = new Decimal(raw.toString()).dividedBy(10_000);
        const rounded = roundToCurrency(value, c.code);
        const halfUnit = new Decimal(1).dividedBy(10 ** c.exponent).dividedBy(2);
        expect(rounded.minus(value).abs().lte(halfUnit)).toBe(true);
        expect(roundToCurrency(rounded, c.code).eq(rounded)).toBe(true);
        expect(rounded.decimalPlaces()).toBeLessThanOrEqual(c.exponent);
      }),
    );
  });

  it('the JSON form always has exactly the currency exponent as fraction digits', () => {
    fc.assert(
      fc.property(moneyPairArb, ({ a }) => {
        const s = moneyToDecimalString(a);
        const exponent = CURRENCIES.find((c) => c.code === a.currency)!.exponent;
        const fraction = s.split('.')[1] ?? '';
        expect(fraction.length).toBe(exponent);
      }),
    );
  });
});
