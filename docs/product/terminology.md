# Terminology

These terms are used precisely across code, API, UI copy (via translation keys), and documentation. When writing code, use the **code name** column for identifiers.

## Identity and access

| Term | Code name | Definition |
|---|---|---|
| User | `User` | A person with a login. Every user owns exactly one private financial workspace. |
| Workspace | n/a | The set of all financial data owned by one user. It is **not** a separate entity: the workspace is implicitly identified by `userId`. There are no shared or multiple workspaces. |
| Administrator | `role = ADMIN` | A user with access to the admin panel (operational settings, user activation). Admin rights grant **no** access to other users' financial data. An admin also has their own private workspace. |
| Local account | n/a | A user with a password credential. |
| Identity | `UserIdentity` | A link between a user and an external OIDC subject (`issuer` + `subject`). |
| Session | `Session` | A server-side record that represents one logged-in device or client. It is identified to the client by an opaque random token. |
| Device | n/a | A human-readable description of a session's client (browser, OS, app), derived from the User-Agent and an optional user-provided name. |

## Money and currency

| Term | Code name | Definition |
|---|---|---|
| Money | `Money` | An amount (decimal) together with an ISO 4217 currency code. Never a bare number. |
| Minor unit / exponent | `exponent` | The number of decimal places of a currency per ISO 4217 (PLN 2, JPY 0, KWD 3). Stored amounts are rounded to it. |
| Base currency | `baseCurrency` | The single currency chosen by a user, used for aggregations, budgets, reports, and forecasts. |
| Account currency | `account.currency` | The currency an account holds. It is fixed once the account has postings. |
| Original amount / currency | `originalAmount`, `originalCurrency` | The amount as the user actually paid or received it (for example 20.00 EUR paid from a PLN account). |
| Account amount | `posting.amount` | The amount in the account currency that changes the account balance. |
| Base amount | `posting.baseAmount` | The posting amount converted to the user's base currency **at the time of recording**, stored as a snapshot. |
| Exchange rate | `ExchangeRate` | The number of units of the *quote* currency equal to one unit of the *base-side* currency on a given date (`1 EUR = 4.3215 PLN`, where pair EUR→PLN has rate 4.3215). |
| Rate snapshot | `rateToAccount`, `rateToBase` | The exact rate stored on a posting when it was recorded. Later rate updates do not change it. |
| Rate source | `RateSource` | Where a rate came from: `IDENTITY` (same currency), `PROVIDER`, `MANUAL`, or `DERIVED` (computed from two amounts the user entered). |
| Rate provider | `RateProvider` | A pluggable external source of exchange rates (for example Frankfurter/ECB or NBP). |

## Financial records

| Term | Code name | Definition |
|---|---|---|
| Account | `Account` | A user-defined container of money in one currency (a bank account, cash, Revolut, a savings account…). |
| Account kind | `account.kind` | A suggested account type (`BANK`, `CASH`, `SAVINGS`, `CREDIT_CARD`, `E_WALLET`, `OTHER`) or `CUSTOM` with a free-text label. Purely descriptive; it has no effect on calculations. |
| Transaction | `Transaction` | A **completed** (actual) financial operation that already happened. Types: `INCOME`, `EXPENSE`, `TRANSFER`, `ADJUSTMENT`. |
| Posting | `Posting` | One balance-affecting line of a transaction against one account, with a signed amount. Income and expense have 1 posting, a transfer has 2, and an adjustment has 1. Postings are never edited independently of their transaction. |
| Transfer | `type = TRANSFER` | A movement between two accounts of the same user. It is neither income nor expense. Cross-currency transfers carry an explicit transfer rate. |
| Adjustment | `type = ADJUSTMENT` | A balance correction (reconciliation) that is neither income nor expense. See [financial-domain-model.md](../architecture/financial-domain-model.md#adjustments). |
| Opening balance | `account.openingBalance` | The balance of an account at its `openingDate`, before any postings. |
| Balance | n/a | The actual balance of an account: opening balance plus the sum of its postings. Never includes projections. |
| Category | `Category` | A user-defined classifier of type `INCOME` or `EXPENSE`, with at most one level of subcategories. |
| Subcategory | `Category` with `parentId` | A child category. It has the same type as its parent. |
| Uncategorized | `categoryId = null` | Income or expense without a category. Shown as "Uncategorized" in reports. |
| Template | `TransactionTemplate` | A saved set of default transaction fields used to pre-fill entry forms. |
| Custom field | `CustomFieldDefinition` | A user-defined extra transaction field (text, number, date, boolean, or single-select). **Not** a tag or label. |
| Attachment | `Attachment` | A file attached to a transaction. Its metadata lives in PostgreSQL; its content lives in the storage backend. |
| Transaction history | `TransactionAudit` | An append-only change record for a transaction (create, update with old and new values, delete). |

## Planning and forecasting

| Term | Code name | Definition |
|---|---|---|
| Scheduled transaction | `ScheduledTransaction` | A definition of an expected future transaction: either **recurring** (with a recurrence rule) or **one-off planned** (single date). It never affects balances by itself. |
| Execution mode | `mode` | `AUTO` (the system creates the transaction on the due date) or `CONFIRM` (the system reminds the user, who confirms manually). |
| Occurrence | n/a | One concrete due date of a scheduled transaction, identified by `(scheduledTransactionId, occurrenceDate)`. Occurrences are computed, not stored, unless something happened to them. |
| Occurrence record | `ScheduledOccurrence` | A stored record of an occurrence's state: `SKIPPED`, `MODIFIED` (one-time override), or `COMPLETED` (linked to the created transaction). |
| Due / overdue | n/a | An occurrence whose date is today or past and that is not completed or skipped. |
| Planned item | n/a | UI term for a future occurrence (recurring or one-off) shown in the calendar and used in forecasts. |
| Forecast | `Forecast` | A computed projection of future balances and flows. It is always labelled as an estimate and never stored as actual data. |
| Scenario | n/a | A forecast variant: **Scheduled only** (planned items only) or **With estimated spending** (also includes a statistical estimate of unplanned spending). |

## Budgeting and savings

| Term | Code name | Definition |
|---|---|---|
| Budget | `Budget` | A spending limit in the base currency over a period, for a set of expense categories. |
| Budget period | n/a | One concrete date range of a budget (for example 2026-11-01..2026-11-30). |
| Limit mode | `limitMode` | `MANUAL` (fixed amount) or `AUTO` (derived from the historical average). |
| Rollover | `rollover` | Whether unused (or overspent) amounts carry into the next period. |
| Alert rule | `AlertRule` | A user-defined threshold rule (budget percent used, account balance below, category spending above). Not a general automation engine. |
| Savings pot | `SavingsPot` | A **virtual** earmark of money inside one account. It does not change balances or net worth. |
| Pot allocation | `PotAllocation` | An append-only entry that moves money into (+) or out of (−) a pot. |
| Allocated amount | n/a | The sum of pot balances of an account. |
| Available balance | n/a | Account balance minus allocated amount. |
| Savings goal | `SavingsGoal` | A target amount with an optional deadline. Its progress is measured from one linked pot **or** one linked (dedicated savings) account. |
| Net worth / total balance | n/a | The sum of all account balances (including archived accounts) converted to the base currency. Pots never add to it. |

## Notifications

| Term | Code name | Definition |
|---|---|---|
| Notification | `Notification` | An in-app message to the user, optionally also delivered as a push notification. |
| Push subscription | `PushSubscription` | A Web Push endpoint registered by a browser or PWA. |
| Insight | `Insight` | A non-binding suggestion from anomaly detection (possible duplicate, unusual expense…). Insights never modify data. |

## Synchronization

| Term | Code name | Definition |
|---|---|---|
| Synced entity | n/a | An entity type that is replicated to the client's IndexedDB and editable offline. |
| Mutation | `SyncMutation` | A client-originated change command with a unique `mutationId`, queued offline and pushed to the server. |
| Change log | `ChangeLog` | A server-side per-user table recording the latest change sequence per entity, used for incremental pulls. |
| Sequence / cursor | `seq`, `cursor` | A per-user monotonically increasing number. The client stores the highest `seq` it has applied. |
| Tombstone | n/a | A change log entry indicating that an entity was deleted (`id`, type, and seq only). |
| Version | `version` | A per-entity integer, incremented on each server-side update. Used for optimistic concurrency. |
| Conflict | n/a | A mutation that cannot be applied automatically. It is kept on the client for user resolution. |

## Operations

| Term | Code name | Definition |
|---|---|---|
| Backup | `Backup` | A full-instance archive: a PostgreSQL dump, attachment files, and a manifest. It is an operator concern, different from a user export. |
| User export | n/a | A per-user JSON/CSV extract of that user's own data. It can be re-imported. |
| Storage driver | `StorageDriver` | The implementation behind attachment storage: `local` (Docker volume) or `s3` (S3-compatible). |
| Quota | `storageQuotaBytes` | The per-user maximum total attachment size, enforced by the backend. |
