# ADR-0008: Transaction and transfer model

- **Status:** Accepted (extended by [ADR-0021](ADR-0021-refund-and-adjustment-transaction-types.md))
- **Date:** 2026-11-18

## Context

Transactions are income, expense, or transfers between the user's own accounts (R-TX-01, R-TX-02). Cross-currency transfers must keep both sides' amounts (R-TX-03). Balances must be computed consistently (R-ACC-04).

## Decision

A **transaction header** with **postings**: INCOME and EXPENSE have one posting, TRANSFER has two (source and destination, each in its account's currency), ADJUSTMENT has one, and REFUND has one linked to the original expense (added by [ADR-0021](ADR-0021-refund-and-adjustment-transaction-types.md)). `occurredOn` (a local date) is authoritative. Transfer fees are a separate linked EXPENSE. The opening balance is an account field. Account balance = opening balance + sum of its postings. Edits write `transaction_audit` diffs. Details: [financial-domain-model.md](../architecture/financial-domain-model.md).

## Alternatives considered

- **One row per transaction with `fromAccount`/`toAccount`:** awkward for cross-currency transfers and balance queries.
- **Full double-entry with category accounts:** more rigorous but heavier than a personal app needs, and harder to explain in the UI.
- **Two independent transactions for a transfer:** they can drift apart and are double counted in reports.

## Consequences

- Reports exclude transfers from income and expense by type.
- Every write path must keep the posting invariants (enforced by CHECK constraints and domain tests).

## Status

Accepted.
