# Data Model (Logical Schema)

**[Accepted]** entity set and ownership model. **[Proposed]** exact column lists, to be finalized in `schema.prisma` during the stage that introduces each table (see [implementation-stages.md](../planning/implementation-stages.md)). Relationships and deletion rules are in [entity-relationships.md](entity-relationships.md). Conventions (naming, keys, money types, enums vs. `TEXT + CHECK`, indexes, migrations) are in [database-architecture.md](../architecture/database-architecture.md).

This document consolidates the entity sketches from the architecture documents into one column-level list. Behaviour and invariants stay canonical in the linked documents. If a column here disagrees with a domain document, the domain document wins and this file must be fixed in the same change.

## Reading this document

- Column names are written in **camelCase** (Prisma field names). The database column is the `snake_case` equivalent (`occurredOn` → `occurred_on`). Tables are `snake_case` plural.
- Types are logical: `uuid`, `text`, `citext`, `bool`, `int`, `bigint`, `date` (LocalDate), `timestamptz` (instant), `money` = `NUMERIC(19,4)`, `rate` = `NUMERIC(24,12)`, `ccy` = `CHAR(3)` FK → `currencies.code`, `jsonb`, `bytea`.
- `?` after a type means nullable. Everything else is `NOT NULL`.
- **Owned** tables carry `userId uuid NOT NULL → users ON DELETE CASCADE` and `UNIQUE (id, userId)` so children can use composite ownership FKs ([database-architecture.md](../architecture/database-architecture.md#2-composite-ownership-foreign-keys)). The `userId` column is not repeated in every table below; the **Owned** column of the summary says where it exists.
- **Synced** tables carry `version int DEFAULT 1` and are replicated to IndexedDB ([offline-and-synchronization.md](../architecture/offline-and-synchronization.md#3-synced-entities)).
- Unless stated otherwise, every table has `id uuid` (UUIDv7) as primary key and `createdAt`, `updatedAt timestamptz`. Append-only tables have only `createdAt`.

## Summary

| Table | Module | Owned | Synced | Defined in |
|---|---|---|---|---|
| `users` | users / auth | (root) | no | [authentication.md](../architecture/authentication.md#1-account-model) |
| `user_settings` | users | yes (PK = userId) | yes | this document |
| `user_identities` | auth | yes | no | [authentication.md](../architecture/authentication.md#1-account-model) |
| `auth_tokens` | auth | yes | no | [authentication.md](../architecture/authentication.md#1-account-model) |
| `sessions` | auth | yes | no | [authentication.md](../architecture/authentication.md#4-sessions) |
| `api_tokens` | auth | yes | no | [api-tokens.md](../architecture/api-tokens.md#1-token-model) |
| `app_settings` | system / admin | no (instance) | no | [configuration.md](../infrastructure/configuration.md#runtime-settings-app_settings) |
| `currencies` | currencies | no (reference) | static mirror in `@monevo/domain` | [multi-currency.md](../architecture/multi-currency.md#currency-reference-data) |
| `exchange_rates` | currencies | optional (`userId` null = provider) | yes (subset) | [multi-currency.md](../architecture/multi-currency.md#4-rate-storage) |
| `accounts` | accounts | yes | yes | [financial-domain-model.md](../architecture/financial-domain-model.md#accounts) |
| `categories` | categories | yes | yes | [financial-domain-model.md](../architecture/financial-domain-model.md#categories) |
| `transactions` | transactions | yes | yes (aggregate) | [financial-domain-model.md](../architecture/financial-domain-model.md#transaction-aggregate) |
| `postings` | transactions | yes | yes (inside transaction) | same |
| `transaction_audit` | transactions | yes | no | [financial-domain-model.md](../architecture/financial-domain-model.md#transaction-history-audit) |
| `transaction_templates` | transactions | yes | yes | [financial-domain-model.md](../architecture/financial-domain-model.md#templates-and-custom-fields) |
| `custom_field_definitions` | transactions | yes | yes | same |
| `attachments` | attachments | yes | yes (metadata, read-only) | [file-storage.md](../architecture/file-storage.md#3-keys-and-metadata) |
| `storage_deletions` | storage | no (outbox) | no | [file-storage.md](../architecture/file-storage.md#deletion) |
| `scheduled_transactions` | scheduling | yes | yes | [scheduling-and-calendar.md](../architecture/scheduling-and-calendar.md#1-one-concept-for-all-future-items) |
| `scheduled_amount_changes` | scheduling | yes | yes (inside schedule) | same |
| `scheduled_occurrences` | scheduling | yes | yes | same |
| `budgets` | budgets | yes | yes | [financial-calculations.md](financial-calculations.md#budgets) |
| `budget_categories` | budgets | yes | yes (inside budget) | same |
| `budget_accounts` | budgets | yes | yes (inside budget) | same |
| `savings_pots` | savings | yes | yes | [financial-domain-model.md](../architecture/financial-domain-model.md#savings-pots) |
| `pot_allocations` | savings | yes | yes (create only) | same |
| `savings_goals` | savings | yes | yes | [financial-domain-model.md](../architecture/financial-domain-model.md#savings-goals) |
| `alert_rules` | alerts | yes | yes | [notifications.md](../architecture/notifications.md#4-alert-rules) |
| `notifications` | notifications | yes | yes | [notifications.md](../architecture/notifications.md#1-data-model) |
| `notification_preferences` | notifications | yes | no (via `/notification-preferences`) | same |
| `push_subscriptions` | notifications | yes | no | same |
| `insights` | insights | yes | no | [notifications.md](../architecture/notifications.md#5-insights) |
| `report_definitions` | reports | yes | no | [reporting-and-dashboard.md](../architecture/reporting-and-dashboard.md#4-saved-report-configurations) |
| `dashboard_layouts` | dashboard | yes (PK = userId) | yes | [reporting-and-dashboard.md](../architecture/reporting-and-dashboard.md#layout-model) |
| `user_sync_state` | sync | yes (PK = userId) | no | [offline-and-synchronization.md](../architecture/offline-and-synchronization.md#5-server-side-change-tracking) |
| `change_log` | sync | yes | no (it *is* the sync index) | same |
| `idempotency_records` | sync | yes | no | [offline-and-synchronization.md](../architecture/offline-and-synchronization.md#7-push-protocol) |
| `exports` | exportimport | yes | no | [import-export.md](../architecture/import-export.md#generation) |
| `imports` | exportimport | yes | no | [import-export.md](../architecture/import-export.md#import-record) |
| `backups` | backups | no (instance) | no | [backups-and-restoration.md](../infrastructure/backups-and-restoration.md) |

pg-boss keeps its own tables in the `pgboss` schema. They are not part of the application model and are not described here.

## Identity and settings

### users
| Column | Type | Notes |
|---|---|---|
| email | citext | unique |
| emailVerifiedAt | timestamptz? | |
| displayName | text | 1–100 chars |
| role | enum `USER`, `ADMIN` | |
| status | enum `ACTIVE`, `DEACTIVATED` | |
| passwordHash | text? | argon2id encoded string; null = no local credential |
| passwordChangedAt | timestamptz? | |
| storageQuotaBytes | bigint? | null = instance default ([file-storage.md](../architecture/file-storage.md#5-quotas)) |
| storageUsedBytes | bigint | default 0; maintained under a row lock |
| maintenanceState | text? | `BASE_CURRENCY_CHANGE` while that job runs (→ `503 MAINTENANCE_USER`); null otherwise |
| lastLoginAt | timestamptz? | |

### user_settings
One row per user, created at registration or onboarding. Synced (merge groups in [offline-and-synchronization.md](../architecture/offline-and-synchronization.md#8-field-level-three-way-merge)).

| Column | Type | Notes |
|---|---|---|
| userId | uuid | PK, FK → users |
| locale | text | BCP 47, `en` or `pl` initially |
| timeZone | text | IANA name, validated against the runtime tz database |
| baseCurrency | ccy | changed only by the base currency change operation |
| weekStart | enum `MONDAY` … `SUNDAY` | default from locale |
| dateFormat | text | `LOCALE` (default) or an explicit pattern from an allowlist |
| theme | enum `LIGHT`, `DARK`, `SYSTEM` | default `SYSTEM` |
| reminderTime | time | default `09:00` (local) |
| pushContent | enum `FULL`, `GENERIC` | default `FULL` ([notifications.md](../architecture/notifications.md#3-web-push)) |
| transactionListColumns | jsonb | visible column keys and order (not a saved view) |
| onboardingCompletedAt | timestamptz? | |
| version | int | |

### user_identities
| Column | Type | Notes |
|---|---|---|
| issuer | text | OIDC issuer URL |
| subject | text | `sub` claim |
| emailAtLink | citext? | |
| linkedAt, lastUsedAt | timestamptz | |

Unique `(issuer, subject)` and `(userId, issuer)`.

### auth_tokens
| Column | Type | Notes |
|---|---|---|
| purpose | enum `EMAIL_VERIFY`, `PASSWORD_RESET`, `EMAIL_CHANGE`, `OIDC_LINK` | |
| tokenHash | bytea | SHA-256 of the random token, unique |
| payload | jsonb? | for example the new email address |
| expiresAt | timestamptz | |
| usedAt | timestamptz? | single use; purged 7 days after expiry or use |

### sessions
| Column | Type | Notes |
|---|---|---|
| tokenHash | bytea | SHA-256, unique |
| clientType | enum `WEB`, `NATIVE` | |
| authMethod | enum `PASSWORD`, `OIDC` | |
| lastSeenAt, idleExpiresAt, absoluteExpiresAt | timestamptz | lifetimes in [authentication.md](../architecture/authentication.md#4-sessions) |
| userAgent | text? | |
| deviceLabel | text? | parsed or user-renamed |
| ipLast | inet? | display can be disabled by an instance setting |
| csrfSecret | bytea? | WEB only |
| revokedAt | timestamptz? | |
| revokedReason | text? | `LOGOUT`, `USER_REVOKED`, `PASSWORD_CHANGED`, `DEACTIVATED`, `RESTORE`, `EVICTED` |

### api_tokens
| Column | Type | Notes |
|---|---|---|
| name | text | 1–100 characters, user-chosen, renamable |
| tokenHash | bytea | SHA-256 of the full token, unique; never returned by the API |
| displayPrefix | text | `mnv_pat_` + first 6 random characters, for recognition in the list |
| permissions | text[] | catalogue values from [api-tokens.md](../architecture/api-tokens.md#4-permission-catalogue), validated on create, immutable |
| expiresAt | timestamptz? | null = no expiration |
| lastUsedAt | timestamptz? | throttled write (5 min) |
| lastUsedIp | inet? | display can be disabled by an instance setting |
| revokedAt | timestamptz? | |
| revokedReason | text? | `USER_REVOKED`, `DEACTIVATED`, `RESTORE` |

`updatedAt` changes only on rename; no `version` (not synced). Status (`ACTIVE`, `EXPIRED`, `REVOKED`) is derived. Index `(userId, createdAt)`. Revoked and expired rows are purged 90 days after revocation or expiry.

### app_settings
Instance-wide runtime settings, one row per key. The key list and defaults are canonical in [configuration.md](../infrastructure/configuration.md#runtime-settings-app_settings).

| Column | Type | Notes |
|---|---|---|
| key | text | PK |
| value | jsonb | validated by the key's Zod schema; secrets stored as AES-256-GCM ciphertext envelopes |
| updatedAt | timestamptz | |
| updatedByUserId | uuid? | no FK (survives user deletion) |

## Currencies and rates

### currencies
| Column | Type | Notes |
|---|---|---|
| code | char(3) | PK, ISO 4217 |
| exponent | smallint | 0–4 |
| name | text | English reference name |
| active | bool | inactive codes are hidden in pickers but stay valid for history |

Seeded by migration; no `id`, no timestamps.

### exchange_rates
| Column | Type | Notes |
|---|---|---|
| userId | uuid? | null = provider (global) rate; set = user manual rate |
| fromCurrency, toCurrency | ccy | CHECK `fromCurrency <> toCurrency` |
| rateDate | date | |
| rate | rate | CHECK `> 0` |
| source | enum `PROVIDER`, `MANUAL` | |
| providerId | text? | `frankfurter`, `nbp`, … |
| metadata | jsonb? | `publishedDate`, pivot currency |
| fetchedAt | timestamptz? | |

Unique expression index over `(COALESCE(userId, nil), source, COALESCE(providerId, ''), fromCurrency, toCurrency, rateDate)`. Not owned in the composite-FK sense (no children reference it), but manual rates are user-scoped by every query.

## Ledger

### accounts
| Column | Type | Notes |
|---|---|---|
| name | text | 1–100 chars |
| currency | ccy | immutable once postings exist |
| kind | enum `BANK`, `CASH`, `SAVINGS`, `CREDIT_CARD`, `E_WALLET`, `OTHER`, `CUSTOM` | |
| customKindLabel | text? | required when `kind = CUSTOM` (CHECK) |
| icon, color | text | icon key from the bundled set, color token or hex |
| openingBalance | money | account currency |
| openingDate | date | |
| includeInNetWorthWidget | bool | default true; display only |
| sortOrder | int | |
| archivedAt | timestamptz? | |
| version | int | |

### categories
| Column | Type | Notes |
|---|---|---|
| name | text | |
| type | enum `INCOME`, `EXPENSE` | equals the parent's type |
| parentId | uuid? | composite FK `(parentId, userId)` → categories; depth ≤ 2 (trigger) |
| icon, color | text | |
| sortOrder | int | |
| version | int | |

### transactions
| Column | Type | Notes |
|---|---|---|
| type | enum `INCOME`, `EXPENSE`, `TRANSFER`, `ADJUSTMENT` | |
| occurredOn | date | authoritative user-local date |
| occurredAt | timestamptz? | optional exact time |
| description | text? | max 500; trigram index |
| notes | text? | max 5 000 |
| categoryId | uuid? | composite FK; income/expense only |
| customFields | jsonb | `{ [definitionId]: value }`, default `{}` |
| source | enum `MANUAL`, `TEMPLATE`, `SCHEDULE_AUTO`, `SCHEDULE_CONFIRMED`, `IMPORT` | |
| templateId | uuid? | provenance only, **no FK** (templates can be deleted freely) |
| scheduledTransactionId | uuid? | composite FK → scheduled_transactions |
| occurrenceDate | date? | set together with `scheduledTransactionId` (CHECK); partial unique pair (INV-9) |
| transferFeeOfId | uuid? | composite FK → transactions (`ON DELETE SET NULL` on the column only, see ER doc) |
| version | int | |

### postings
| Column | Type | Notes |
|---|---|---|
| transactionId | uuid | composite FK → transactions |
| accountId | uuid | composite FK → accounts |
| amount | money | signed, account currency, `<> 0` |
| accountCurrency | ccy | equals `accounts.currency` (INV-5) |
| originalAmount | money | `> 0` |
| originalCurrency | ccy | |
| rateToAccount | rate | `> 0` |
| rateToAccountSource | enum `IDENTITY`, `PROVIDER`, `MANUAL`, `DERIVED` | |
| baseCurrency | ccy | user's base currency at recording time |
| baseAmount | money? | null = missing conversion |
| rateToBase | rate? | `> 0` when set |
| rateToBaseSource | enum `IDENTITY`, `PROVIDER`, `MANUAL`? | |
| rateToBaseDate | date? | the rate date actually used (stale rates differ from `occurredOn`) |
| leg | enum `SINGLE`, `SOURCE`, `DESTINATION` | stable key for audit diffs and DTO mapping |

No `version` and no timestamps of their own: postings are always written with their transaction, which carries the version.

### transaction_audit
| Column | Type | Notes |
|---|---|---|
| transactionId | uuid | **no FK** (survives deletion) |
| action | enum `CREATE`, `UPDATE`, `DELETE` | |
| at | timestamptz | |
| actorType | enum `USER`, `SYSTEM_SCHEDULE`, `IMPORT` | |
| actorUserId | uuid? | |
| credentialType | enum? `SESSION`, `API_TOKEN` | null for `SYSTEM_SCHEDULE` and `IMPORT` |
| sessionId | uuid? | no FK (sessions are purged) |
| apiTokenId | uuid? | no FK (tokens are purged); set when `credentialType = API_TOKEN` |
| apiTokenName | text? | copied at write time |
| deviceLabel | text? | copied at write time |
| clientChangedAt | timestamptz? | from the sync mutation |
| changes | jsonb | shape per action in [financial-domain-model.md](../architecture/financial-domain-model.md#transaction-history-audit) |

Append-only. Indexes `(userId, transactionId, at)` and `(userId, at DESC)`.

### transaction_templates
| Column | Type | Notes |
|---|---|---|
| name | text | |
| type | enum `INCOME`, `EXPENSE`, `TRANSFER` | |
| accountId, destinationAccountId | uuid? | composite FKs, `SET NULL` semantics handled by the service (see ER doc) |
| categoryId | uuid? | composite FK |
| amount | money? | |
| currency | ccy? | |
| description, notes | text? | |
| customFields | jsonb | |
| sortOrder | int | |
| version | int | |

### custom_field_definitions
| Column | Type | Notes |
|---|---|---|
| name | text | |
| fieldType | enum `TEXT`, `NUMBER`, `DATE`, `BOOLEAN`, `SELECT` | immutable once values exist |
| options | jsonb? | `SELECT` only: `[{ id, label }]` |
| appliesTo | enum[] of transaction types | empty = all |
| sortOrder | int | |
| archivedAt | timestamptz? | |
| version | int | |

## Attachments and storage

### attachments
| Column | Type | Notes |
|---|---|---|
| transactionId | uuid | composite FK → transactions |
| storageKey | text | internal, never in DTOs; unique |
| originalFilename | text | sanitized display name |
| sizeBytes | bigint | |
| declaredMime | text | |
| detectedMime | text? | |
| sha256 | bytea | |
| status | enum `PENDING`, `READY` | |
| version | int | synced as read-only metadata |

### storage_deletions
Not owned (rows outlive their attachments and may outlive the user).

| Column | Type | Notes |
|---|---|---|
| storageKey | text | |
| sizeBytes | bigint | |
| requestedAt | timestamptz | |
| notBefore | timestamptz | `requestedAt + max(7 days, backup interval)` |
| attempts | int | |
| lastError | text? | |
| doneAt | timestamptz? | done rows purged after 30 days |

## Scheduling

### scheduled_transactions
| Column | Type | Notes |
|---|---|---|
| name | text? | |
| type | enum `INCOME`, `EXPENSE`, `TRANSFER` | |
| accountId | uuid | composite FK |
| destinationAccountId | uuid? | composite FK; TRANSFER only |
| categoryId | uuid? | composite FK |
| description, notes | text? | |
| customFields | jsonb | |
| amount | money | `> 0`, original currency |
| currency | ccy | |
| destinationAmount | money? | cross-currency transfer |
| transferRate | rate? | cross-currency transfer |
| recurrenceFreq | enum `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`? | null = one-off |
| recurrenceInterval | int? | `≥ 1` |
| recurrenceByWeekday | enum[]? | WEEKLY |
| recurrenceMonthDay | smallint? | 1..31 or −1 (MONTHLY) |
| startDate | date | |
| endDate | date? | `≥ startDate` |
| maxOccurrences | int? | |
| includePastOccurrences | bool | default false; set at creation only |
| mode | enum `AUTO`, `CONFIRM` | default: [OQ-20](../planning/open-questions.md#oq-20-default-execution-mode) |
| isBill | bool | |
| reminderDaysBefore | int? | `≥ 0` |
| savingsGoalId | uuid? | composite FK → savings_goals |
| status | enum `ACTIVE`, `PAUSED`, `ENDED` | |
| version | int | |

The recurrence is stored as flat columns (not JSONB) so CHECK constraints can validate it.

### scheduled_amount_changes
| Column | Type | Notes |
|---|---|---|
| scheduledTransactionId | uuid | composite FK |
| effectiveFrom | date | unique per schedule |
| amount | money | |
| destinationAmount | money? | |

### scheduled_occurrences
| Column | Type | Notes |
|---|---|---|
| scheduledTransactionId | uuid | composite FK |
| occurrenceDate | date | unique per schedule |
| state | enum `SKIPPED`, `MODIFIED`, `COMPLETED` | |
| override | jsonb? | date, amount, accountId, categoryId, description, … |
| transactionId | uuid? | composite FK → transactions; cleared by the delete command |
| transactionDeletedAt | timestamptz? | blocks AUTO regeneration |
| completedAt | timestamptz? | |
| version | int | |

## Budgets

### budgets
| Column | Type | Notes |
|---|---|---|
| name | text | |
| icon, color | text | |
| periodType | enum `WEEKLY`, `MONTHLY`, `YEARLY`, `CUSTOM` | |
| monthStartDay | smallint? | 1–28, MONTHLY |
| yearStartMonth | smallint? | 1–12, YEARLY |
| customStartDate | date? | CUSTOM (one-off start or repeating anchor) |
| customEndDate | date? | CUSTOM one-off |
| customRepeatDays | int? | CUSTOM repeating (`N`) |
| limitMode | enum `MANUAL`, `AUTO` | |
| limitAmount | money? | base currency; required for MANUAL, fallback for AUTO |
| lookbackPeriods | smallint | default 3 |
| adjustmentPct | numeric(6,2) | default 0 |
| historyStartDate | date? | AUTO: earliest period to consider |
| rollover | bool | |
| maxRolloverPeriods | smallint? | null = unlimited |
| sortOrder | int | |
| version | int | |

CHECKs enforce which period columns are set per `periodType`. Threshold alerts are separate `alert_rules`.

### budget_categories / budget_accounts
Join tables with composite PK `(budgetId, categoryId)` / `(budgetId, accountId)` plus `userId`, composite FKs to both sides. `budget_categories` must reference `EXPENSE` categories (service check).

## Savings

### savings_pots
| Column | Type | Notes |
|---|---|---|
| accountId | uuid | composite FK; currency = account currency |
| name, icon, color | text | |
| sortOrder | int | |
| archivedAt | timestamptz? | only when the balance is 0 |
| version | int | |

### pot_allocations
Append-only, no `updatedAt`, no `version`.

| Column | Type | Notes |
|---|---|---|
| potId | uuid | composite FK |
| amount | money | signed, account currency, `<> 0` |
| occurredOn | date | |
| note | text? | |
| transactionId | uuid? | composite FK; set by "pay from pot", `SET NULL` semantics if the expense is deleted |

### savings_goals
| Column | Type | Notes |
|---|---|---|
| name, icon, color | text | |
| targetAmount | money | `> 0` |
| targetCurrency | ccy | equals the source currency |
| deadline | date? | |
| source | enum `POT`, `ACCOUNT` | |
| potId | uuid? | composite FK; set iff `source = POT` |
| accountId | uuid? | composite FK; set iff `source = ACCOUNT` |
| status | enum `ACTIVE`, `PAUSED`, `COMPLETED`, `ARCHIVED` | partial unique: one ACTIVE/PAUSED goal per source |
| version | int | |

## Notifications, alerts, insights

### alert_rules
| Column | Type | Notes |
|---|---|---|
| type | text + CHECK `BUDGET_THRESHOLD`, `ACCOUNT_BALANCE_BELOW`, `CATEGORY_SPENDING_ABOVE` | open set |
| enabled | bool | |
| config | jsonb | per type ([notifications.md](../architecture/notifications.md#4-alert-rules)); referenced IDs validated by the service |
| state | jsonb | server-owned (`armed`, `lastCrossingAt`, crossing counter), never accepted from clients |
| disabledReason | text? | `REFERENCE_DELETED` when auto-disabled |
| version | int | |

`config` references (budget, account, category) are JSONB, so they have no FK. The service disables the rule when a referenced entity is deleted.

### notifications
| Column | Type | Notes |
|---|---|---|
| type | text + CHECK | open set ([notifications.md](../architecture/notifications.md#notification-types-initial-set-open-enum)) |
| params | jsonb | |
| link | text? | in-app route only |
| dedupKey | text | unique per user |
| readAt | timestamptz? | |
| version | int | |

### notification_preferences
PK `(userId, type)`; columns `inApp bool`, `push bool`, `version int`. A missing row means the type's defaults.

### push_subscriptions
| Column | Type | Notes |
|---|---|---|
| sessionId | uuid? | FK → sessions `ON DELETE SET NULL`; the subscription is deleted on revocation by the service |
| endpoint | text | unique |
| p256dh, auth | text | browser keys |
| userAgent, deviceLabel | text? | |
| lastSuccessAt | timestamptz? | |
| failureCount | int | removed at 10 consecutive failures |

### insights
| Column | Type | Notes |
|---|---|---|
| type | text + CHECK `DUPLICATE`, `UNUSUAL_EXPENSE`, `BUDGET_OVERRUN`, `MISSING_RECURRING`, `BALANCE_DISCREPANCY` | open set |
| fingerprint | text | unique per user |
| params | jsonb | |
| link | text? | |
| detectedAt | timestamptz | |
| dismissedAt, resolvedAt | timestamptz? | |

## Reports and dashboard

### report_definitions
| Column | Type | Notes |
|---|---|---|
| name | text | |
| reportType | text + CHECK | open set matching the report catalogue |
| config | jsonb | per-type Zod schema with its own `schemaVersion` |
| sortOrder | int | |
| version | int | |

### dashboard_layouts
PK `userId`; columns `layout jsonb` (max 40 widgets, 32 KB), `version int`, `updatedAt`. Layout shape in [reporting-and-dashboard.md](../architecture/reporting-and-dashboard.md#layout-model).

## Synchronization

### user_sync_state
| Column | Type | Notes |
|---|---|---|
| userId | uuid | PK |
| lastSeq | bigint | default 0; row-locked per write |
| minValidCursor | bigint | default 0; raised by the tombstone purge |

### change_log
PK `(userId, entityType, entityId)`; columns `seq bigint`, `op text CHECK IN ('UPSERT','DELETE')`, `version int?`, `changedAt timestamptz`. Index `(userId, seq)`. No `id`.

### idempotency_records
PK `(userId, key)`; columns `requestHash bytea`, `responseStatus int`, `response jsonb`, `createdAt`. Retained 30 days.

## Export, import, backups

### exports
| Column | Type | Notes |
|---|---|---|
| format | enum `JSON`, `CSV` | |
| options | jsonb | scope, selected entities, `includeHistory`, `includeAttachments` |
| status | enum `QUEUED`, `RUNNING`, `READY`, `FAILED`, `EXPIRED` | |
| filePath | text? | under `/data/backups/exports/<userId>/`, internal |
| sizeBytes | bigint? | |
| error | text? | |
| expiresAt | timestamptz? | `readyAt + 24 h` |

### imports
| Column | Type | Notes |
|---|---|---|
| exportId | uuid? | from the uploaded document |
| contentSha256 | bytea | |
| schemaVersion | int | |
| status | enum `UPLOADED`, `VALIDATED`, `INVALID`, `APPLYING`, `APPLIED`, `FAILED` | |
| report | jsonb | errors, warnings, counts |
| filePath | text? | temporary upload, deleted after 24 h |
| appliedAt | timestamptz? | |

Duplicate detection: an `APPLIED` row for the same user with the same `exportId` or `contentSha256`.

### backups
Instance-level record of each backup run (the archive itself lives in `BACKUP_PATH` and optionally S3).

| Column | Type | Notes |
|---|---|---|
| trigger | enum `SCHEDULED`, `MANUAL`, `PRE_UPGRADE`, `CLI` | |
| status | enum `RUNNING`, `SUCCEEDED`, `FAILED` | |
| startedAt, finishedAt | timestamptz | `finishedAt` nullable |
| fileName | text? | archive name in `BACKUP_PATH` |
| sizeBytes | bigint? | |
| encrypted | bool | |
| remoteStatus | enum `NONE`, `UPLOADED`, `FAILED` | optional S3 target |
| manifest | jsonb? | copy of `manifest.json` |
| error | text? | |
| requestedByUserId | uuid? | no FK |

A restore replaces this table with the restored dump's contents. The backup service re-scans `BACKUP_PATH` afterwards and re-adds rows for archives found on disk ([backups-and-restoration.md](../infrastructure/backups-and-restoration.md#restore)).
