# ADR-0007: Money and multi-currency

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Precise decimal arithmetic is required (R-CUR-07). Original amounts must be preserved (R-CUR-02) and historical results must not change when rates are updated (R-CUR-03). Users have a base currency for totals (R-CUR-01). Rate providers must be abstracted (R-CUR-06).

## Decision

- `NUMERIC(19,4)` amounts and `NUMERIC(24,12)` rates in PostgreSQL; decimal.js (precision 34) in code via `@monevo/domain`; **decimal strings** in JSON; `ROUND_HALF_UP` to the ISO 4217 exponent.
- Each posting stores its original amount and currency plus a **`baseAmount` and rate snapshot** at creation. Flows (income, expense, budgets, reports) use the snapshots; stocks (balances, net worth) use the rate on the requested date.
- A missing rate gives `baseAmount = null`; such items are excluded from totals and counted (`missingRateCount`).
- Providers: Frankfurter (default) and NBP behind an interface; manual rates allowed.

Details: [multi-currency.md](../architecture/multi-currency.md).

## Alternatives considered

- **Integer minor units:** awkward for rates and for currencies with different exponents; still needs decimals for conversion.
- **Floating point:** forbidden.
- **Converting at read time only:** historical results would change when rates are corrected.

## Consequences

- Lint rules and reviews must prevent `number` arithmetic on money.
- Changing the base currency requires a recompute job ([OQ-05](../planning/open-questions.md#oq-05-changing-the-base-currency)).

## Status

Accepted.
