# Requirements

This is the **canonical scope list**. Each requirement has a stable ID, which is referenced by the [implementation stages](../planning/implementation-stages.md) and tests. Status markers are defined in [docs/README.md](../README.md#status-markers). All requirements below are **[Accepted]** unless marked otherwise. Interpretations made during Stage 0 are labelled *(interpretation)* and listed in [open-questions.md](../planning/open-questions.md) where confirmation is useful.

## Platform and general

| ID | Requirement |
|---|---|
| R-GEN-01 | Web application usable in desktop and mobile browsers, with a responsive layout. |
| R-GEN-02 | Installable as a PWA. |
| R-GEN-03 | The backend API is independent of the web frontend and suitable for a future native Android client and external integrations. |
| R-GEN-04 | Multiple independent users. Each user has exactly one private workspace. No shared or multiple workspaces. |
| R-GEN-05 | Light and dark themes. |
| R-GEN-06 | Custom application branding (own name and visual identity, inspired by Cashew but not a copy). *(Interpretation: the operator can also set the instance display name, logo, and accent color.)* |
| R-GEN-07 | Polish and English at first release. The architecture allows more languages. All UI strings use translation keys. |
| R-GEN-08 | Localized dates, times, numbers, currency formatting, decimal separators, and week start. Language is independent of base currency. The browser language is the initial suggestion, and the user can change it manually. |
| R-GEN-09 | Per-user time zone, used for all date-sensitive features (recurring, reminders, calendar, notifications, scheduled operations). |

## Authentication, sessions, administration

| ID | Requirement |
|---|---|
| R-AUTH-01 | Users sign in only through OpenID Connect with the operator's identity provider (Account Center), using standard OIDC and an established, certified library. *(Replaced 2026-11-19, [ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md): previously local registration and email/password login.)* |
| R-AUTH-02 | On the first successful sign-in, a Monevo user is provisioned automatically, keyed by the identity provider's issuer and subject (`iss` + `sub`), never by email address. *(Replaced 2026-11-19: previously password reset. Monevo has no local passwords, so there is no password reset.)* |
| R-AUTH-03 | Monevo stores no credentials and sends no email: no local passwords, no password reset, no email verification. The email address and display name shown are informational; credentials and email are managed in the identity provider. *(Replaced 2026-11-19: previously email address management with verification.)* |
| R-AUTH-04 | Account activation and deactivation (by an admin). A deactivated user cannot sign in, and their sessions and personal API tokens are revoked. |
| R-AUTH-05 | Exactly one identity provider, configured by the operator through environment variables. *(Amended 2026-11-19: previously configured by the admin in the panel.)* |
| R-AUTH-06 | No account linking: one Monevo user corresponds to exactly one identity at the configured provider. *(Replaced 2026-11-19: previously linking a local account with an OIDC identity.)* |
| R-AUTH-07 | MFA, password policy, and account recovery are delegated to the identity provider. |
| R-AUTH-08 | Users can view active sessions with device information and last activity, and revoke selected sessions. |
| R-AUTH-09 | A secure session strategy with expiry, revocation, and renewal. |
| R-ADM-01 | Admin panel: user list, activate/deactivate accounts. |
| R-ADM-02 | Admin: basic application configuration, application version, system health/status. |
| R-ADM-03 | Admin: storage configuration and per-user storage quota. |
| R-ADM-04 | Admin: read-only view of the identity provider status. The provider itself is configured through environment variables. *(Amended 2026-11-19, [ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md).)* |
| R-ADM-05 | Admin privileges never grant access to users' financial data. |
| R-ADM-06 | Technical logs exist and are useful for troubleshooting. |

## Accounts

| ID | Requirement |
|---|---|
| R-ACC-01 | Users create, name, and edit their own accounts. There is no fixed list of account types: suggested kinds plus custom types are allowed. |
| R-ACC-02 | Each account has its own currency. |
| R-ACC-03 | Accounts can be archived according to a defined data policy (see [features.md](features.md#accounts)). |
| R-ACC-04 | Balances are calculated consistently from the account's financial operations. |
| R-ACC-05 | No asset or investment portfolio module. |

## Transactions

| ID | Requirement |
|---|---|
| R-TX-01 | Transaction types: income, expense, transfer between the user's own accounts. *(Amended 2026-11-19: plus `REFUND` (R-TX-13, [OQ-10](../planning/open-questions.md#oq-10-refunds)) and balance `ADJUSTMENT` (R-TX-14, [OQ-12](../planning/open-questions.md#oq-12-adjustment-transaction-type)). Opening balances remain an account field, not an adjustment.)* |
| R-TX-02 | A transfer decreases the source balance, increases the destination balance, and counts as neither income nor expense. |
| R-TX-03 | Cross-currency transfers preserve the original amount and currency, the exchange rate, and the converted amount. |
| R-TX-04 | Quick entry mode (minimal) and full entry mode (all fields). |
| R-TX-05 | Fields: amount, currency, account, category/subcategory, date and optional time, description, attachments, template, recurring configuration, exchange rate info, user-defined custom fields. |
| R-TX-06 | No tags or labels. |
| R-TX-07 | User-defined transaction templates (default account, category, description, other fields). The amount is entered when the template is used, and all values stay adjustable. |
| R-TX-08 | Transactions can be edited and permanently deleted. There is no recycle bin. |
| R-TX-09 | Transaction change history: old and new values on edit, timestamp, responsible actor, and deletion records. Deletion removes the active record. A minimal audit record remains, not a full copy. *(Decided 2026-11-19, [OQ-11](../planning/open-questions.md#oq-11-history-retention-for-deleted-transactions): the deletion record holds only the fact of deletion, its time, and the initiating actor and credential (including the personal API token, if one was used); earlier creation and update history is kept for the lifetime of the user account; a deleted transaction no longer affects balances, reports, or budgets.)* |
| R-TX-10 | Advanced filtering by amount or range, date range, account, category/subcategory, and description. No saved filter views. |
| R-TX-11 | Transaction list sorting and visible column selection. No saved layout system. |
| R-TX-12 | Transactions are created manually. No bank sync, Open Banking, OCR, or CSV/Excel statement import. |
| R-TX-13 | Refunds are a dedicated `REFUND` transaction type linked to the original expense. Partial, full, and multiple partial refunds are supported; their total never exceeds the original expense. A refund increases the receiving account's balance, reduces reported expenses in the original expense's category, and is never ordinary income. The original expense and its history are preserved; a refund is a separate financial operation. Currency and exchange-rate behaviour is defined and historical rates are preserved. There is no default "Refunds" income category. An expense that still has refunds cannot be deleted until its refunds are deleted; nothing is deleted implicitly. *(Added 2026-11-19, [OQ-10](../planning/open-questions.md#oq-10-refunds), [OQ-24](../planning/open-questions.md#oq-24-deleting-an-expense-that-has-refunds); design: [financial-domain-model.md](../architecture/financial-domain-model.md#refunds).)* |
| R-TX-14 | Balance adjustments are an `ADJUSTMENT` transaction type with a single posting, used to reconcile an account's recorded balance with its actual balance. They affect the account balance, are neither income nor expense, do not affect budgets, require a reason, and appear in transaction and audit history. *(Added 2026-11-19, [OQ-12](../planning/open-questions.md#oq-12-adjustment-transaction-type); design: [financial-domain-model.md](../architecture/financial-domain-model.md#adjustments).)* |

## Multi-currency

| ID | Requirement |
|---|---|
| R-CUR-01 | Each user selects one base currency, used for aggregated balances, budgets, reports, summaries, and forecasts. It can be changed later through an explicit, confirmed operation ([multi-currency.md](../architecture/multi-currency.md#9-base-currency)). |
| R-CUR-02 | Original transaction amounts are always preserved. |
| R-CUR-03 | Historical results do not change when exchange rates are updated later. |
| R-CUR-04 | Exchange rates come from an external API on demand, from manual entry, or from per-transaction overrides. Historical rates are stored. Cross-currency transfers use explicit rates. |
| R-CUR-05 | No automatic background rate fetching is required. |
| R-CUR-06 | Rate providers sit behind an abstraction. No provider is assumed to support all currencies or history. |
| R-CUR-07 | Precise decimal arithmetic. No floating-point math on financial values. |

## Categories and budgets

| ID | Requirement |
|---|---|
| R-CAT-01 | Categories start empty (no seed list). Users create categories and subcategories with names, icons, and colors, and can edit, archive, delete, and reorganize them. An archived parent hides its subcategories ([features.md](features.md#categories)). |
| R-CAT-02 | Income and expense categories are distinguishable. |
| R-BUD-01 | Any number of budgets. Monthly, weekly, or custom date ranges. Assigned to categories or groups of categories. |
| R-BUD-02 | Manual limits or automatic limits based on history. Individual rule configuration. No forced methodology. |
| R-BUD-03 | User-defined alerts: budget % used, account balance below an amount, category spending above a threshold. Not an automation engine. |

## Savings

| ID | Requirement |
|---|---|
| R-SAV-01 | Savings goals: target amount, optional deadline, progress, several at once, contribution history. |
| R-SAV-02 | Virtual savings pots associated with accounts. They represent an allocation of existing money, never increase total balance, and cannot be double-counted. |

## Recurring and planned

| ID | Requirement |
|---|---|
| R-REC-01 | Recurring transactions in automatic generation mode or reminder + manual confirmation mode. |
| R-REC-02 | Intervals: daily, weekly, monthly, yearly, custom. Start date, optional end date. |
| R-REC-03 | Skip an occurrence. Change the amount without rebuilding the schedule. |
| R-REC-04 | Generation is idempotent: no duplicates from retries, restarts, or multiple workers. |
| R-REC-05 | Configurable reminders for upcoming payments, N days in advance. |

## Calendar and forecasting

| ID | Requirement |
|---|---|
| R-CAL-01 | Financial calendar with month, week, and day views. |
| R-CAL-02 | Shows completed transactions, planned transactions, recurring payments, expected income, bills and deadlines, and savings goal events. Completed and planned items are clearly distinguished. |
| R-CAL-03 | Integrates with forecasting. No separate planned-expenses module. |
| R-FC-01 | Forecasts consider planned income, recurring transactions, upcoming bills, obligations, planned larger expenses, and savings goals. |
| R-FC-02 | Estimates future account balances, total projected balance, and expected income and expenses for a period. |
| R-FC-03 | Forecast values are always separated from actual balances and never presented as guaranteed. |

## Reports

| ID | Requirement |
|---|---|
| R-REP-01 | Custom date ranges, filters by accounts and categories. |
| R-REP-02 | Month-over-month and year-over-year comparisons. Income, expense, and savings analysis. Review of recurring expenses. |
| R-REP-03 | Custom report configurations and comparisons. *(Interpretation: the user can save named report configurations.)* |
| R-REP-04 | Export of reports and data. |
| R-REP-05 | Recharts visualizations. Financial aggregation on the backend where it involves aggregation and isolation. |
| R-REP-06 | No AI analysis in v1. Do not block adding it later. |

## Notifications and insights

| ID | Requirement |
|---|---|
| R-NOT-01 | In-app notification center. |
| R-NOT-02 | Browser/PWA push notifications on supported devices. |
| R-NOT-03 | User-configurable notification types: payment reminders, budget thresholds, custom thresholds. |
| R-NOT-04 | Suggestions: possible duplicates, unusually high expenses, budget overruns, missing expected recurring payments, balance discrepancies. They are suggestions only and never modify data. |
| R-NOT-05 | No email notifications. Monevo sends no email at all: authentication is delegated to the identity provider ([OQ-03](../planning/open-questions.md#oq-03-smtp-for-authentication-emails), closed as obsolete). |

## Attachments

| ID | Requirement |
|---|---|
| R-ATT-01 | Several attachments per transaction, any file type. Upload, download, delete, and preview supported formats. |
| R-ATT-02 | Per-user storage quotas, configured by the admin and enforced by the backend. |
| R-ATT-03 | Storage backends: local Docker volume or S3-compatible storage, behind an abstraction. Files are never stored in PostgreSQL. |
| R-ATT-04 | Upload validation, size limits, MIME sniffing, authorized downloads, path traversal protection. |
| R-ATT-05 | Attachments belong only to transactions. |

## Offline and sync

| ID | Requirement |
|---|---|
| R-OFF-01 | The app remains usable offline. It shows previously synced data and allows supported operations. |
| R-OFF-02 | Local changes are queued durably (IndexedDB) and synced automatically on reconnect. Manual sync is possible. |
| R-OFF-03 | Visible sync status, understandable errors, conflict resolution UI. |
| R-OFF-04 | Realtime change notifications via Socket.IO, but sync does not depend on WebSocket availability. |
| R-OFF-05 | Durable server-side change tracking, versioning, and cursors. Idempotent mutations. Conflict detection. Retries. |
| R-OFF-06 | Financial data never silently disappears due to concurrent edits. Last-write-wins is not used for financial fields. |

## Dashboard

| ID | Requirement |
|---|---|
| R-DASH-01 | Per-user configurable dashboard: add, remove, reorder (drag and drop), resize, and show/hide widgets, and choose chart types and data. Saved per user. |

## Import, export, backup

| ID | Requirement |
|---|---|
| R-EXP-01 | User export as JSON and CSV. Selected accounts, categories, transactions, budgets. |
| R-EXP-02 | Import of previously exported data with validation, meaningful errors, and duplicate import prevention. |
| R-EXP-03 | No generic CSV/Excel bank statement import. |
| R-BAK-01 | Automatic backups with configurable schedule and retention. Manual backups. Downloading and restoring selected backups. Status and failure reporting. |
| R-BAK-02 | Backups include the database and attachment files, and they are consistent. |

## API

| ID | Requirement |
|---|---|
| R-API-01 | Documented REST API under `/api/v1`, with OpenAPI and Swagger UI. |
| R-API-02 | Documented auth, authorization, validation, error format, pagination, filtering, sorting, idempotency, versioning policy, rate limiting, realtime. |
| R-API-03 | DTOs are separate from Prisma models. |

## Personal API tokens

Design: [api-tokens.md](../architecture/api-tokens.md).

| ID | Requirement |
|---|---|
| R-TOK-01 | Users create multiple personal API tokens, each with a custom name, so separate integrations and use cases get separate tokens. |
| R-TOK-02 | Each token has granular permissions that the user selects from a predefined permission catalogue, per resource type. Read, create, update, and delete operations are granted independently, and each resource offers only the operations it actually supports. |
| R-TOK-03 | A token can have an optional expiration date. |
| R-TOK-04 | Users see their tokens with name, creation date, expiration date, last-used timestamp, and status, and can revoke any token at any time. Revocation immediately prevents further use. |
| R-TOK-05 | Tokens are generated with a cryptographically secure, standard method. The complete token is shown only once, after creation. Only a secure hash is stored, and stored hashes are never exposed through the API. |
| R-TOK-06 | Every token belongs to exactly one user. Its permissions never exceed the owner's, are enforced on the backend, and strict user data isolation applies to every token-authenticated request. |
| R-TOK-07 | Tokens never grant access to administrative functionality, interactive sessions, credential management, or session management. |
| R-TOK-08 | Token usage metadata (at least the last-used timestamp) is recorded. Operations authenticated by a token are clearly identified in transaction change history and relevant audit records. |
| R-TOK-09 | Tokens are an additional authentication method for the versioned REST API and do not replace interactive sign-in through the identity provider (OIDC). The API documentation explains the mechanism, the token format, and how integrations authenticate. Token management is available in the user interface and, with an interactive session, through the API. |

## Security

| ID | Requirement |
|---|---|
| R-SEC-01 | Every financial record belongs to one user. Every backend operation enforces ownership using the authenticated identity, never a client-supplied user ID. |
| R-SEC-02 | Coverage of session security, OIDC validation, CSRF, XSS, secure cookies, CORS, rate limiting, input validation, upload security, secrets, Docker, and backup security. |
| R-SEC-03 | No custom cryptographic, JWT, OIDC, or authentication primitives. |

## Infrastructure

| ID | Requirement |
|---|---|
| R-INF-01 | Docker Compose deployment: **one application image** (Express serves the built frontend, the API, and Socket.IO). PostgreSQL is a separate, **externally hosted** database reached through `DATABASE_URL`; the Compose stack does not require a PostgreSQL container (amended by [ADR-0015](../decisions/ADR-0015-external-postgresql.md)). |
| R-INF-02 | Only the application port is exposed. PostgreSQL is not public: the operator restricts database access to the Monevo host and uses TLS off-host ([postgresql.md](../infrastructure/postgresql.md)). |
| R-INF-03 | Suitable for a VPS, a homelab, and typical Docker Compose environments. Manual updates via Compose. |
| R-INF-04 | The relevant automated tests run through local validation scripts (`pnpm validate`, `pnpm test:e2e`); running them in CI is **[Deferred]** until a CI platform is chosen (amended by [ADR-0016](../decisions/ADR-0016-local-validation-ci-deferred.md), [OQ-07](../planning/open-questions.md#oq-07-ci-platform)). |

## Out of scope

**[Out of scope]** for the initial version. Do not implement these and do not add them to stages:

- Automatic bank synchronization or Open Banking
- CSV/Excel bank statement imports
- Receipt scanning or OCR
- Investment, cryptocurrency, or physical asset management
- Shared workspaces, multiple workspaces per user, joint or family finances
- Tags or labels
- A general-purpose automation or rule engine
- Email notifications
- Local authentication: local passwords, registration, password reset, email verification, and SMTP ([ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md))
- MFA inside Monevo (delegated to the identity provider)
- Multiple identity providers, simultaneously or as alternatives, and account linking
- Extensive admin analytics, an admin audit log dashboard, a log management platform
- Automatic application updates from the admin panel
- AI-powered financial analysis
- Saved transaction filter views and saved list layouts
- Seeded predefined categories

## Deferred (possible later, design must not block)

**[Deferred]**: native Android client, additional rate and storage providers, optional AI-assisted analysis, offline attachment upload queue, PDF report export, PostgreSQL row-level security as defense in depth, user self-service account deletion.
