# ADR-0021: Refund and adjustment transaction types

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

[ADR-0008](ADR-0008-transaction-and-transfer-model.md) defines the ledger as a transaction header with postings, with INCOME, EXPENSE, and TRANSFER types and a proposed ADJUSTMENT type. Two decisions remained open before Stage 4:

- **Refunds** ([OQ-10](../planning/open-questions.md#oq-10-refunds)). The earlier recommendation was to enter refunds as INCOME. The user rejected it: a refund is not ordinary income, and recording it as income inflates both income and expense totals and leaves category spending overstated.
- **Balance adjustments** ([OQ-12](../planning/open-questions.md#oq-12-adjustment-transaction-type)). Reconciliation needs a way to correct a balance without inventing income or expense.

## Decision

Two transaction types are added to the posting model. Both have exactly one posting. Full rules: [financial-domain-model.md](../architecture/financial-domain-model.md#refunds), currency rules: [multi-currency.md](../architecture/multi-currency.md#refunds-and-adjustments), formulas: [financial-calculations.md](../data/financial-calculations.md#income-and-expense-totals).

**`REFUND`**
- A separate transaction linked to the original `EXPENSE` through `transactions.refundOfId` (composite, same-user foreign key; required for refunds, forbidden otherwise; immutable).
- One posting with a positive amount on the receiving account, so it increases that account's balance.
- No category of its own. It reduces expense, category spending, and budget spending in the original expense's category, in the period of its own date. It never counts as income. There is no "Refunds" income category.
- Partial, full, and multiple partial refunds are allowed. The refunds' total `originalAmount` never exceeds the expense's `originalAmount` (INV-10); refunds are entered in the expense's original currency, so the check is exact.
- The refund keeps its own rate snapshots for its own date. Neither the refund nor the expense ever changes the other's amounts, rates, or history.

**`ADJUSTMENT`**
- One posting with a non-zero signed amount in the account currency (no conversion), on an active account.
- A required reason (`description`).
- Counts in balances and net worth; never in income, expense, budgets, or category reports. Shown in the transaction list and in audit history like any transaction.

## Alternatives considered

- **Refund as INCOME** (the earlier recommendation): simplest, but it double-counts (income and expense both inflated) and does not reduce category spending or budgets. Rejected by the user.
- **Refund as a negative EXPENSE** (an expense with a positive posting): no new type, but breaks INV-4's sign rule for expenses, makes "expense" ambiguous in every query, and has no link to the original purchase or cap on the refunded amount.
- **Editing the original expense** (lowering its amount): loses the history of what was actually paid and when the money came back; rejected by the user's requirement that the expense and its history are preserved.
- **Valuing the refund at the original expense's rate** in base currency reports, so a full refund always nets to exactly zero: rejected in favour of the refund's own snapshot, which keeps one rule for every flow (stored `baseAmount` snapshots, [multi-currency.md](../architecture/multi-currency.md#7-converting-stock-values-balances)) and preserves the real historical rate on each date.
- **Adjustment as INCOME/EXPENSE in an "Adjustments" category:** distorts income, expense, and budgets.

## Consequences

- The transaction type enum, the INV-4 table, the `transactions` columns and CHECK constraints, and the report and budget queries all handle `REFUND`; category queries join refunds to their original expense.
- Every write touching a refund or an expense with refunds locks the expense row and re-checks INV-10. Offline mutations that would break it are rejected at push time (Stage 5).
- Some edits of an expense with refunds are rejected (type, original currency, amount below the refunded total, date after the earliest refund).
- Deleting an expense that still has refunds is rejected with `422 EXPENSE_HAS_REFUNDS`; the user deletes the refunds first, and nothing is deleted implicitly ([OQ-24](../planning/open-questions.md#oq-24-deleting-an-expense-that-has-refunds)).
- A refunded foreign-currency expense can leave a base-currency difference when rates moved; it is not corrected artificially.
- Category spending and the expense total for a period can be negative when refunds outweigh purchases in that period.
- Templates and scheduled transactions do not support either type.

## Status

Accepted on 2026-11-19 (the user's decisions on OQ-10, OQ-12, and [OQ-24](../planning/open-questions.md#oq-24-deleting-an-expense-that-has-refunds)).
