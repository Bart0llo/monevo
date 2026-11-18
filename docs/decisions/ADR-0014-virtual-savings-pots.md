# ADR-0014: Virtual savings pots

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Savings pots are associated with accounts and represent an allocation of money already in an account, not a separate balance (R-SAV-02). Goals can track progress from a pot or an account (R-SAV-01).

## Decision

Pots are **allocations, not transactions**: an append-only `pot_allocations` log (allocate/release) linked to an account, in the account's currency. Pots **never affect net worth or account balances**. A pot's balance cannot go negative; allocating more than the account's unallocated balance is allowed with a warning. A goal's source is one pot or one account. Details: [financial-domain-model.md](../architecture/financial-domain-model.md).

## Alternatives considered

- **Pots as sub-accounts with transfers:** would double count money and pollute income/expense reports.
- **A single mutable pot balance:** loses history and is harder to sync safely.

## Consequences

- Reports and balances ignore pots by construction.
- Over-allocation is surfaced as an insight (`BALANCE_DISCREPANCY`).

## Status

Accepted.
