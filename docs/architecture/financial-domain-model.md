# Financial Domain Model

**[Accepted]**, see [ADR-0008](../decisions/ADR-0008-transaction-and-transfer-model.md) (extended by [ADR-0021](../decisions/ADR-0021-refund-and-adjustment-transaction-types.md)) and [ADR-0014](../decisions/ADR-0014-virtual-savings-pots.md). Money representation and rate rules are in [multi-currency.md](multi-currency.md). Exact formulas are in [financial-calculations.md](../data/financial-calculations.md). Column-level schema is in [data-model.md](../data/data-model.md).

## Core invariants

These rules hold at all times. Code that could violate them must be covered by tests.

1. **INV-1: Ownership.** Every financial row has a non-null `userId`. All rows referenced by a row belong to the same `userId` (enforced by composite foreign keys; see [database-architecture.md](database-architecture.md#composite-ownership-foreign-keys)).
2. **INV-2: Actual only.** The `transactions`/`postings` tables contain only completed operations. Planned, recurring, and forecast values never live there.
3. **INV-3: Balance derivation.** `balance(account, asOf) = openingBalance + Σ postings.amount for that account where occurredOn ≤ asOf`. Nothing else changes a balance. There is no stored mutable balance that could drift (a cache, if ever added, must be rebuildable and verified by tests).
4. **INV-4: Posting shape per type.**
   | Type | Postings | Sign | Category | Link |
   |---|---|---|---|---|
   | `INCOME` | exactly 1 | amount > 0 | null or an INCOME category | |
   | `EXPENSE` | exactly 1 | amount < 0 | null or an EXPENSE category | |
   | `TRANSFER` | exactly 2, different accounts | one < 0 (source), one > 0 (destination) | null | |
   | `REFUND` | exactly 1 | amount > 0 | null (reported under the original expense's category) | `refundOfId` → an `EXPENSE`, required |
   | `ADJUSTMENT` | exactly 1 | ≠ 0, no currency conversion | null | |
5. **INV-5: Currency consistency.** `posting.accountCurrency = account.currency`. `posting.amount` is rounded to that currency's exponent.
6. **INV-6: Snapshots are immutable.** `rateToAccount`, `baseAmount`, and `rateToBase` are set when a transaction is created or edited. They are never recalculated because exchange rate data changed, except when filling a *missing* base conversion (see [multi-currency.md](multi-currency.md#missing-rates)) or through the explicit base currency change operation.
7. **INV-7: Transfers and adjustments are neutral.** Transfers and adjustments never appear in income or expense totals, budgets, or category reports. Refunds never appear in income; they only reduce expense ([§ Refunds](#refunds)).
8. **INV-8: Pots are virtual.** Pot allocations never create postings and never change any balance or net worth.
9. **INV-9: Idempotent automation.** At most one transaction exists per `(scheduledTransactionId, occurrenceDate)` (unique index).
10. **INV-10: Refunds never exceed the expense.** For every expense `e`: `Σ r.posting.originalAmount over refunds r with r.refundOfId = e.id ≤ e.posting.originalAmount`, and every such refund has `originalCurrency = e.posting.originalCurrency`. Enforced by the service under a row lock on `e` for every write that touches a refund or `e` ([§ Refunds](#refunds)).

## Transaction aggregate

A **Transaction** is the aggregate root. Its **Postings** are child rows created, changed, and deleted only together with the transaction (API and sync treat the transaction plus its postings as one unit).

```
Transaction
  id (UUIDv7, may be client-generated)
  userId
  type: INCOME | EXPENSE | TRANSFER | REFUND | ADJUSTMENT
  occurredOn: LocalDate          ← authoritative calendar date (user-local) for all grouping
  occurredAt?: Instant           ← optional exact time (UTC), shown in user tz
  description?, notes?           ← description required for ADJUSTMENT (the reason)
  categoryId?                    ← income/expense only
  refundOfId?                    ← REFUND only (required): the original EXPENSE; immutable
  customFields: { [definitionId]: value }
  source: MANUAL | TEMPLATE | SCHEDULE_AUTO | SCHEDULE_CONFIRMED | IMPORT
  templateId?                    ← provenance only, no behaviour
  scheduledTransactionId?, occurrenceDate?   ← link to the occurrence it fulfils (unique pair)
  transferFeeOfId?               ← for a fee expense linked to a transfer
  version, createdAt, updatedAt
  postings: Posting[]

Posting
  id, userId, transactionId, accountId
  amount: Decimal (signed, account currency)
  accountCurrency
  originalAmount: Decimal (unsigned, > 0)      ← what the user entered
  originalCurrency
  rateToAccount: Decimal                       ← originalCurrency → accountCurrency
  rateToAccountSource: IDENTITY | PROVIDER | MANUAL | DERIVED
  baseCurrency                                 ← user's base currency at recording time
  baseAmount?: Decimal (signed)                ← null only if conversion is missing
  rateToBase?: Decimal                         ← accountCurrency → baseCurrency
  rateToBaseSource?, rateToBaseDate?
```

### Why postings instead of columns on the transaction

A transfer touches two accounts with two currencies and two amounts. With postings, **every** balance is simply `Σ postings.amount` per account, one query shape for every account type and transaction type, and the cross-currency details sit on the leg they describe. The alternative (`accountId`, `toAccountId`, `toAmount` columns) forces every balance query and report to special-case transfers. Split transactions and other multi-posting features are **not** in scope. The posting model just doesn't preclude them. See [ADR-0008](../decisions/ADR-0008-transaction-and-transfer-model.md) for the alternatives.

## Income and expense

- The user enters the amount, currency (defaults to the account currency), account, category, and date.
- If `originalCurrency = accountCurrency`: `rateToAccount = 1`, source `IDENTITY`, `amount = ±originalAmount`.
- If they differ (for example a 20.00 EUR purchase on a PLN card), the user may:
  - enter the account amount actually charged (preferred, matches the bank statement) → `rateToAccount = accountAmount / originalAmount` (source `DERIVED`), or
  - accept a provider rate for `occurredOn` (source `PROVIDER`), or
  - type a rate (source `MANUAL`).
- The base conversion is resolved separately from the account currency to the base currency ([multi-currency.md](multi-currency.md)).

## Transfers

A transfer is **one transaction with two postings**:

| Field | Source posting | Destination posting |
|---|---|---|
| `accountId` | source account | destination account |
| `amount` | `−sourceAmount` (source currency) | `+destinationAmount` (destination currency) |
| `originalAmount`/`originalCurrency` | `sourceAmount` / source currency | `sourceAmount` / source currency |
| `rateToAccount` | 1 (`IDENTITY`) | transfer rate (`destinationAmount / sourceAmount`, or the user-entered rate) |
| `baseAmount` | source amount → base | destination amount → base |

Rules:
- Source ≠ destination. Both accounts are active (not archived) when the transfer is created.
- Same currency: `destinationAmount = sourceAmount`, rate 1.
- Cross-currency: the user supplies the **rate** or the **destination amount** (or both, in which case they must be consistent after rounding; the destination amount wins and the rate is stored as derived). The rate is always stored explicitly (R-TX-03). A provider rate may be suggested but must be visible to the user before saving.
- **Base currency effect:** the two legs' `baseAmount`s may differ slightly (spread, rounding, rate differences). This difference is an **exchange difference**. It is not income or expense, it naturally shows up in net worth, and reports may display it as a separate "exchange differences" line (see [financial-calculations.md](../data/financial-calculations.md#exchange-differences)).

### Transfer fees
**[Proposed]** The transfer form has an optional **fee** field. A fee creates a separate `EXPENSE` transaction on the source account (category chosen by the user, or uncategorized), linked through `transferFeeOfId`. The fee is a real expense and counts in expense totals. Deleting the transfer asks whether to also delete the fee. Rationale: the transfer stays a pure, neutral movement while the cost is reported correctly.

## Refunds

**[Accepted]** ([OQ-10](../planning/open-questions.md#oq-10-refunds), [ADR-0021](../decisions/ADR-0021-refund-and-adjustment-transaction-types.md)). A refund is money returned for an earlier expense. It is a **separate transaction** of type `REFUND`, linked to the original expense by `refundOfId`. It is not an edit of the expense and not ordinary income. There is no "Refunds" income category.

- **Shape:** one posting with `amount > 0` on the account that receives the money (any of the user's active accounts; the form defaults to the expense's account). `categoryId` is null: the refund is always reported under the original expense's current category, and follows it if that category changes.
- **Link:** `refundOfId` must reference an `EXPENSE` of the same user (composite FK). It is set at creation and never changes; to move a refund to another expense, delete it and record a new one. A refund cannot refund another refund, an income, a transfer, or an adjustment.
- **Partial and multiple refunds:** any number of refunds per expense, each with `originalAmount > 0`, as long as their total stays within the expense (INV-10). A full refund is simply refunds totalling the expense's `originalAmount`.
- **Amount and currency:** the refund is entered in the expense's original currency (`originalCurrency = expense.originalCurrency`), so the cap is checked exactly, without conversion. The amount credited to the receiving account follows the normal income/expense conversion rules with the refund's own date and rate ([multi-currency.md](multi-currency.md#refunds-and-adjustments)).
- **Date:** `refund.occurredOn ≥ expense.occurredOn`. Refunds are grouped by their own date in every report and budget period (the expense stays in its own period).
- **Effect:** the refund increases the receiving account's balance like any positive posting (INV-3), and **reduces** expense totals, category spending, and budget spending in the original expense's category; it never counts as income ([financial-calculations.md](../data/financial-calculations.md#income-and-expense-totals)).
- **History is preserved:** the original expense, its postings, rate snapshots, and audit history are never modified by recording, editing, or deleting a refund.
- **Derived read-only fields** on an expense: `refundedAmount` (Σ refund `originalAmount`), `refundableAmount` (`originalAmount − refundedAmount`), and the refund count, all in the expense's original currency.
- **Edits that would break the link are rejected:** an expense with refunds cannot change type (`EXPENSE_HAS_REFUNDS`), cannot change its `originalCurrency` (`REFUND_CURRENCY_MISMATCH`), cannot lower its `originalAmount` below `refundedAmount` (`REFUND_EXCEEDS_EXPENSE`), and cannot move its date after its earliest refund (`REFUND_BEFORE_EXPENSE`). Its category, account, description, and other fields stay editable. A refund cannot change type, and no transaction can change type into `REFUND`.
- **Deleting:** deleting a refund removes its effect; the expense is untouched. Deleting an expense that still has refunds is rejected with `422 EXPENSE_HAS_REFUNDS` until the user has deleted each of its refunds ([OQ-24](../planning/open-questions.md#oq-24-deleting-an-expense-that-has-refunds)). The delete confirmation lists the linked refunds with links to their details. Deleting a transaction never deletes another transaction or any other financial record implicitly.
- Refunds are entered from the original expense ("Refund" action in the transaction detail). They are not available in templates or scheduled transactions, because each one needs a specific original expense.

## Adjustments

**[Accepted]** ([OQ-12](../planning/open-questions.md#oq-12-adjustment-transaction-type), [ADR-0021](../decisions/ADR-0021-refund-and-adjustment-transaction-types.md)). A single-posting transaction of type `ADJUSTMENT` that reconciles an account's recorded balance with its actual balance ("my bank says 1 234.56").

- **Shape:** exactly one posting on an active account, `amount ≠ 0`, positive (balance too low) or negative (balance too high). It is always in the account currency: `originalCurrency = accountCurrency`, `originalAmount = |amount|`, `rateToAccount = 1` (`IDENTITY`). The base conversion is resolved for `occurredOn` like any posting. `categoryId` is null.
- **Reason:** `description` is **required** (non-blank after trimming, max 500 characters) and holds the reason for the adjustment.
- **Validation:** zero is rejected; the amount must fit the currency's exponent and the general amount bounds; the account must be active; a foreign currency is rejected (`ADJUSTMENT_FOREIGN_CURRENCY`). Edits keep the same rules (for example, moving it to an account in another currency is rejected).
- **Entry:** the UI asks for the target balance and computes `delta = target − balance(account, occurredOn)` ([financial-calculations.md](../data/financial-calculations.md#account-balances)); if the delta is zero, nothing is saved. The API takes the signed `amount` (the delta), so the server never depends on a client's view of the balance.
- **Effect:** counts in the account balance and net worth. It is not income or expense, it is excluded from budgets and category reports (INV-7), and it is shown in the transaction list (type filter `ADJUSTMENT`, distinct icon) and in transaction history like any transaction.
- Not available in templates or scheduled transactions. A type change to or from `ADJUSTMENT` is allowed only when the result satisfies the target type's rules.
- Opening balances use `account.openingBalance` instead of an adjustment, so new accounts don't create artificial transactions.

## Accounts

```
Account: id, userId, name, currency, kind (BANK|CASH|SAVINGS|CREDIT_CARD|E_WALLET|OTHER|CUSTOM),
         customKindLabel?, icon, color, openingBalance (Decimal), openingDate (LocalDate),
         includeInNetWorthWidget (bool), sortOrder, archivedAt?, version
```
- `openingBalance` is in the account currency. Postings dated before `openingDate` are allowed (back-dated history) and the balance formula still holds. The UI warns because that usually means the opening balance should be adjusted.
- Credit cards are simply accounts that typically have negative balances. There is no credit-limit logic in v1.
- See [features.md](../product/features.md#accounts) for archive and delete policy.
- Stage 3 delivers accounts without balances (there are no postings yet); balances and `GET /accounts/balances` arrive in Stage 4 ([implementation-stages.md](../planning/implementation-stages.md#stage-4-transactions)).

## Categories

```
Category: id, userId, name, type (INCOME|EXPENSE), parentId?, icon, color, sortOrder, archivedAt?, version
```
- Depth ≤ 2 (enforced in the service, plus a trigger that checks the parent has no parent).
- A subcategory's type equals its parent's.
- A category is effectively hidden when it or its parent is archived. Archived categories cannot be picked for new entries; existing references keep working. Archive rules: [features.md](../product/features.md#categories).
- A transaction references a leaf **or** a parent category. Reports roll subcategories up into parents.

## Savings pots

See [ADR-0014](../decisions/ADR-0014-virtual-savings-pots.md).

```
SavingsPot:    id, userId, accountId, name, icon, color, archivedAt?, version
PotAllocation: id, userId, potId, amount (signed Decimal, account currency), occurredOn, note?, createdAt
```
- A pot lives inside exactly one account and uses the account's currency.
- `potBalance = Σ allocations.amount`. It is append-only: correcting a mistake means adding a reverse allocation. Allocations are synced as creates only, so they always merge.
- `allocated(account) = Σ potBalance over the account's non-archived pots`. `available(account) = balance(account) − allocated(account)`.
- **No double counting:** net worth and account balances ignore pots entirely. Pots only split the existing balance into "earmarked" and "available".
- **Spending from a pot:** an expense is recorded on the account (as always). The user may optionally release the same amount from the pot ("pay from pot" in the expense form creates the expense and a negative allocation in one command). Pot balances never go negative: releasing more than the pot balance is rejected.
- **Over-allocation:** if the account balance drops below the allocated amount (spending without releasing), `available` becomes negative. That is reported as a warning and a "balance discrepancy" insight, never blocked, because the actual spend is reality.
- Archiving a pot requires its balance to be 0 (release first). Archiving an account requires its pots to be released or archived.

## Savings goals

```
SavingsGoal: id, userId, name, icon, color, targetAmount, targetCurrency,
             deadline?, source: POT | ACCOUNT, potId? | accountId?,
             status: ACTIVE | PAUSED | COMPLETED | ARCHIVED, version
```
- **POT source:** progress = pot balance. Contribution history = the pot's allocations.
- **ACCOUNT source (dedicated savings account):** progress = account balance. Contribution history = postings into that account (transfers in and incomes; withdrawals are shown as negative contributions).
- `targetCurrency` must equal the pot or account currency (keeps progress exact without conversion). The UI also shows the base currency equivalent.
- At most one active goal per pot or account (avoids double counting progress).
- Required pace: `(target − progress) / remaining periods until deadline` (see [financial-calculations.md](../data/financial-calculations.md#savings-goals)).
- Goals feed the calendar (deadline event, planned contributions from scheduled transactions targeting the goal's account) and the forecast (projected progress).

## Scheduled transactions

Defined in [scheduling-and-calendar.md](scheduling-and-calendar.md). These are templates for future occurrences. A *completed* occurrence becomes a normal Transaction linked by `(scheduledTransactionId, occurrenceDate)`.

## Transaction history (audit)

```
TransactionAudit: id, userId, transactionId (no FK – survives deletion), action: CREATE | UPDATE | DELETE,
                  at (Instant), actorType: USER | SYSTEM_SCHEDULE | IMPORT, actorUserId?,
                  credentialType?: SESSION | API_TOKEN, sessionId?, apiTokenId?, apiTokenName?,
                  deviceLabel?, clientChangedAt?, changes (JSONB)
```
- Changes made with a personal API token have `actorType = USER`, `credentialType = API_TOKEN`, the token's ID, and a copy of its name, so the history clearly shows "via API token *name*" ([api-tokens.md](api-tokens.md#6-audit-and-logging)).
- `CREATE`: `changes` holds a compact summary `{type, occurredOn, amount, currency, accountId(s)}` (plus `refundOfId` for a refund), not the full record.
- `UPDATE`: `changes = { field: { old, new } }` for changed fields only. Postings are flattened into stable keys (`source.amount`, `destination.accountId`, …). Custom fields appear as `customFields.<definitionId>`. Attachment add or remove is recorded as `attachments: {added: [filename], removed: [filename]}`.
- `DELETE` **[Accepted]** ([OQ-11](../planning/open-questions.md#oq-11-history-retention-for-deleted-transactions)): a minimal record that only establishes **that** the transaction was deleted, **when**, and **who or what** initiated it: `transactionId`, `action = DELETE`, `at`, and the actor columns (`actorType`, `actorUserId`, `credentialType`, `sessionId` or `apiTokenId` + `apiTokenName`, `deviceLabel`, `clientChangedAt`). `changes` is empty (`{}`): no amounts, accounts, category, description, notes, custom fields, or attachment data are copied. The transaction row, postings, and attachments are physically deleted.
- Earlier `CREATE` and `UPDATE` records of a deleted transaction are **retained** for the lifetime of the user account (they are its history, and they let "Recent changes" show what the deleted item was). Nothing else about a deleted transaction is kept.
- A deletion through a personal API token records `actorType = USER`, `credentialType = API_TOKEN`, `apiTokenId`, and the token name copied at write time, so the record stays meaningful after the token is revoked or purged.
- A deleted transaction no longer affects balances, reports, budgets, or refund totals, because its postings are gone; no derived total is stored that would need correcting.
- History is written in the same DB transaction as the change. It is user-owned and deleted only with the user.
- History is **not** synced to IndexedDB. It is fetched online on demand (`GET /transactions/:id/history`, `GET /transaction-history`).

## Templates and custom fields

```
TransactionTemplate: id, userId, name, type, accountId?, destinationAccountId?, categoryId?,
                     amount?, currency?, description?, notes?, customFields, sortOrder, version
CustomFieldDefinition: id, userId, name, fieldType: TEXT|NUMBER|DATE|BOOLEAN|SELECT,
                       options? (for SELECT: [{id, label}]), appliesTo: TransactionType[], sortOrder,
                       archivedAt?, version
```
- Custom field values are stored in `transactions.customFields` (JSONB) keyed by definition ID and validated server-side against the definition (type, option membership). NUMBER values are decimal strings.
- Deleting a definition is not allowed while values exist. Archive it instead (hidden from forms, existing values kept and shown read-only).
- References from templates to archived or deleted accounts or categories are nulled with a warning when the template is used.

## Consistency rules for edits and deletes

| Operation | Rule |
|---|---|
| Edit transaction type | Allowed. Postings are rebuilt in the same command. Category cleared if incompatible. Audit records the change. Exceptions: nothing changes into or out of `REFUND`; an expense with refunds keeps its type; a change into `ADJUSTMENT` must satisfy the adjustment rules ([§ Refunds](#refunds), [§ Adjustments](#adjustments)). |
| Edit account of a posting | Target account must be active and owned. Currency differences re-resolve `rateToAccount` (unless manual). An adjustment can only move to an account in the same currency. |
| Edit an expense that has refunds | Allowed except changes that would break INV-10 or the link (type, original currency, amount below `refundedAmount`, date after the earliest refund). |
| Delete transaction | Deletes postings and attachments (storage deletion via a delayed outbox; see [file-storage.md](file-storage.md#deletion)). Writes the minimal `DELETE` audit record. If linked to an occurrence, that occurrence returns to "due/overdue" status unless the user marks it skipped (the UI asks). An expense with refunds: rejected with `422 EXPENSE_HAS_REFUNDS` until the user deletes the refunds ([OQ-24](../planning/open-questions.md#oq-24-deleting-an-expense-that-has-refunds)). |
| Delete account | Only when unused (see features). |
| Delete category | Reassign or uncategorize (see features). Executed as one command that updates the affected transactions (each gets a history `UPDATE` entry with actor USER). |
| Archive account | No new postings or allocations. Existing data unchanged. |
