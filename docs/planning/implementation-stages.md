# Implementation Stages

Canonical description of stage contents ([docs/README.md](../README.md#canonical-locations)). The overview and dependency graph are in [roadmap.md](roadmap.md).

Rules for every stage:

- A stage starts only after the previous stage it depends on is **accepted by the user** and the open questions listed under its prerequisites are resolved ([open-questions.md](open-questions.md)).
- Each stage ends with: `pnpm validate` passing locally (and `pnpm test:e2e`; no CI platform yet, [ADR-0016](../decisions/ADR-0016-local-validation-ci-deferred.md)), the stage's tests written and passing, docs updated for anything that changed ([contribution-guidelines.md](../development/contribution-guidelines.md#2-definition-of-done-per-change)), a short stage report, and the user's manual acceptance.
- Every stage that adds API routes also adds their API token permissions or lists them as never available to tokens ([api-tokens.md](../architecture/api-tokens.md#4-permission-catalogue)); the permission suite enforces it.
- Features from later stages are not built early. Out-of-scope items are never built ([requirements.md](../product/requirements.md#out-of-scope)).
- Each stage keeps the app deployable: the Docker image builds, migrations apply, and the E2E smoke test passes.

## Stage 0: Discovery, architecture and documentation

**Status:** completed, awaiting final acceptance. OQ-01, OQ-02, OQ-08 closed; OQ-07 deferred. **Deliverables:** `CLAUDE.md` and the complete `docs/` tree, including ADR-0001..0017 and the open questions. No code.

## Stage 1: Foundation

**Status:** completed and **accepted by the user** (explicit acceptance granted 2026-11-18). `pnpm validate` and `pnpm test:e2e` passed locally before acceptance.

- **Objective:** a running, deployable skeleton with every cross-cutting mechanism in place.
- **Prerequisites:** Stage 0 accepted; [OQ-01](open-questions.md#oq-01-product-name), [OQ-02](open-questions.md#oq-02-package-manager-and-repository-layout), [OQ-08](open-questions.md#oq-08-nodejs-and-postgresql-versions) closed; [OQ-07](open-questions.md#oq-07-ci-platform) deferred (does not block).
- **Features and deliverables:**
  - Monorepo (`apps/server`, `apps/web`, `packages/contracts|domain|i18n`, `e2e/`), TypeScript strict, ESLint (including custom rules `no-float-money`, `no-ambient-time`, `no-unscoped-prisma`), Prettier, root scripts ([development-setup.md](../development/development-setup.md#4-root-scripts)).
  - Express app factory, config loading with Zod and `*_FILE` ([configuration.md](../infrastructure/configuration.md)), pino logging with redaction, request IDs, helmet, problem+json error handler, health endpoints, OpenAPI registry with Swagger UI, static web hosting with SPA fallback.
  - Prisma setup with the first migration: `app_settings`, ISO 4217 `currencies` seed. pg-boss started with a no-op job. Graceful shutdown.
  - `@monevo/domain` money type and currency table with tests.
  - Dockerfile, `docker-compose.yml` (app only; external PostgreSQL via `DATABASE_URL`, [postgresql.md](../infrastructure/postgresql.md)), `docker-compose.dev.yml`, `docker-compose.e2e.yml`, `.env.example`, entrypoint with migrations ([docker-compose.md](../infrastructure/docker-compose.md)).
  - Local validation scripts `pnpm validate` and `pnpm test:e2e` ([testing-strategy.md](../development/testing-strategy.md#5-local-validation)) including `docs:check`, OpenAPI snapshot, i18n check. No CI platform configuration.
  - Web shell: Mantine 8 theme (light/dark/system), app layout with navigation placeholders, React Router, i18next with `en`/`pl`, PWA manifest and installable service worker (app shell only).
- **Tests:** domain money unit + property tests; health/readiness integration; config validation; container smoke test; one Playwright test (app loads, theme switch, language switch).
- **Acceptance criteria:** `docker compose up` on a clean host, with `DATABASE_URL` pointing at a supported external PostgreSQL, serves the app over the proxy; `/api/v1/docs` shows the OpenAPI document; `pnpm validate` and `pnpm test:e2e` pass locally; the PWA is installable in Chromium.
- **Requirements:** R-GEN-01, R-GEN-02, R-GEN-05, R-GEN-07, R-API-01, R-INF-01..04, R-CUR-07 (foundation).

## Stage 2: Identity and users

**Status:** completed and **accepted by user** (explicit acceptance granted 2026-11-19; OIDC-only via Account Center, [ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md)). `pnpm validate` and `pnpm test:e2e` passed locally on 2026-11-19 before acceptance.

- **Objective:** users sign in through Account Center (OIDC-only), manage sessions, settings and personal API tokens; admins can manage users; isolation is enforced and tested from the first owned table.
- **Prerequisites:** Stage 1; [OQ-03](open-questions.md#oq-03-smtp-for-authentication-emails), [OQ-06](open-questions.md#oq-06-authentication-implementation), [OQ-22](open-questions.md#oq-22-api-token-permission-catalogue-and-lifecycle) resolved. Scope changed on 2026-11-19 to OIDC-only ([ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md)); OIDC moved here from the removed Stage 14.
- **Features and deliverables:**
  - OIDC login with `openid-client` (Authorization Code + PKCE S256, state, nonce, encrypted state cookie), automatic provisioning keyed by `(issuer, sub)`, deactivated-user rejection, re-authentication with `prompt=login`, IdP revalidation by refresh grant, RP-initiated logout ([authentication.md](../architecture/authentication.md)). Configuration through `OIDC_*` environment variables only ([configuration.md](../infrastructure/configuration.md#oidc)).
  - Account model: `users`, `user_identities`, `sessions` ([authentication.md](../architecture/authentication.md#1-account-model)). Sessions (cookie only), CSRF, rate limits, logout, session list and revocation.
  - Roles: `OIDC_ADMIN_GROUP` mapping or first-user admin; CLI `set-role`, `list-users`, `generate-key`.
  - Admin: users list, activate/deactivate (revokes sessions and tokens), roles, recent-auth requirement, read-only identity provider status ([administration.md](../architecture/administration.md)).
  - `user_settings` and onboarding (language, time zone, base currency selection), settings screen.
  - Personal API tokens ([api-tokens.md](../architecture/api-tokens.md)): `api_tokens` table, token authentication path, permission framework (catalogue in `@monevo/contracts`, `x-monevo-permissions` in OpenAPI, the never-available list), management endpoints and Settings → API tokens screen, `apiToken` security scheme and "Authenticating integrations" API docs. `profile:read` is the first token-enabled permission; each later stage adds the permissions of its own routes.
  - Job `sessions.purge` (old sessions and tokens).
  - Isolation test harness iterating the OpenAPI registry (session and token authentication); admin-route 403 suite; API token permission suite.
  - Mock OpenID Provider for tests (`tools/mock-idp`).
- **Tests:** OIDC flows against the mock IdP (integration: login and provisioning, resolution by `iss` + `sub` and never by email, state/nonce mismatch, wrong signature, key rotation, deactivated login, admin group mapping, first-user admin, re-authentication, revalidation success / `invalid_grant` / IdP down, logout URL), session expiry with an injected clock, CSRF, rate limit, last-admin protection, isolation harness self-test, API token lifecycle (create, use, expire, revoke, deactivation) and permission suite self-test; E2E auth journey through the mock IdP.
- **Acceptance criteria:** signing in through the IdP creates the user on first login and reuses it afterwards; two users on one instance cannot see each other's settings, sessions, or API tokens; a deactivated user is logged out everywhere and their tokens stop working; a session ends after the IdP revokes the grant; a token is shown once, works only within its permissions, and fails immediately after revocation; a token cannot reach admin, auth, session, or token-management endpoints. Verification against a real Account Center instance is a manual acceptance step.
- **Requirements:** R-AUTH-01..09, R-ADM-01, R-ADM-04, R-ADM-05, R-GEN-04, R-GEN-08, R-GEN-09, R-SEC-01..03, R-TOK-01..09 (framework; per-resource permissions follow in later stages).

## Stage 3: Currencies, rates, accounts and categories

**Status:** completed and **accepted by user** (explicit acceptance granted 2026-11-19). `pnpm validate` and `pnpm test:e2e` passed locally on 2026-11-19 before acceptance.

- **Objective:** the reference data every transaction needs.
- **Prerequisites:** Stage 2; [OQ-05](open-questions.md#oq-05-changing-the-base-currency) resolved (closed 2026-11-19).
- **Features and deliverables:**
  - Exchange rate providers Frankfurter (default, ECB, EUR pivot) and NBP (PLN pivot) behind one interface; rate resolution with on-demand fetch, caching in `exchange_rates`, stale fallback and missing result; manual rates (create or replace, no delete); `POST /exchange-rates/resolve`. No automatic background fetching ([multi-currency.md](../architecture/multi-currency.md)).
  - Admin rate provider selection: `GET/PATCH /admin/settings` (`rates.provider`), overridden by `RATE_PROVIDER` ([administration.md](../architecture/administration.md), [configuration.md](../infrastructure/configuration.md)).
  - Accounts CRUD with currency, kind, icon, color, `openingBalance` + `openingDate`, archive and delete rules. No balances yet: a foreign-currency account shows today's rate to the base currency with its source and date ([financial-domain-model.md](../architecture/financial-domain-model.md)).
  - Category tree (income/expense, two levels, icons, colors, ordering, no seed) with archiving: an archived parent hides its subcategories ([features.md](../product/features.md#categories)).
  - Base currency change `POST /me/base-currency-change` (session only, confirmed, `If-Match`). Stage 3 changes only `user_settings.baseCurrency`; recalculation follows in Stage 4 ([OQ-05](open-questions.md#oq-05-changing-the-base-currency)).
  - Token permissions `currencies:read`, `exchange-rates:create`, `accounts:read|create|update|delete`, `categories:read|create|update|delete` ([api-tokens.md](../architecture/api-tokens.md#4-permission-catalogue)).
- **Tests:** rate provider contract tests with recorded fixtures (no network); rate resolution order, inverse, cross, stale and missing behaviour; account delete-vs-archive rules; category type and archiving rules; base currency change; isolation suite covers new routes automatically; E2E accounts, rates (manual only), categories and base currency change.
- **Acceptance criteria:** a user creates PLN and EUR accounts and a category tree; a foreign-currency account shows the rate to the base currency with its source and date (for example `1 EUR = 4.2650 PLN · Frankfurter (ECB) · 19 Nov 2026`); archiving a parent category hides its subcategories; the base currency can be changed after confirmation; another user's accounts, categories and manual rates are never visible.
- **Requirements:** R-ACC-01..03, R-ACC-05, R-CAT-01..02, R-CUR-01, R-CUR-04..07.

## Stage 4: Transactions

- **Objective:** the core ledger with quick and full entry.
- **Prerequisites:** Stage 3 (accepted 2026-11-19); [OQ-10](open-questions.md#oq-10-refunds), [OQ-11](open-questions.md#oq-11-history-retention-for-deleted-transactions), [OQ-12](open-questions.md#oq-12-adjustment-transaction-type), [OQ-24](open-questions.md#oq-24-deleting-an-expense-that-has-refunds) resolved (closed 2026-11-19).
- **Features and deliverables:** transactions and postings (income, expense, transfer, cross-currency transfer, transfer fee, refund, adjustment), rate snapshots, edit and permanent delete, audit history with the minimal `DELETE` record ([OQ-11](open-questions.md#oq-11-history-retention-for-deleted-transactions)), templates, custom fields, search/filter/sort and column selection, quick entry and full entry, a basic home screen with balances and recent transactions ([financial-domain-model.md](../architecture/financial-domain-model.md), [user-experience.md](../product/user-experience.md)). Command pipeline with change log and idempotency records already written (consumed in Stage 5). Carried over from Stage 3: account balances and `GET /accounts/balances`; the base currency change recalculation job with `users.maintenanceState` and `503 MAINTENANCE_USER` ([multi-currency.md](../architecture/multi-currency.md#9-base-currency)); `/exchange-rates/missing*` and the missing-rate retry job; revisit whether `categories:delete` also requires another permission once categories are referenced by transactions; archived categories excluded from entry pickers; category delete with reassign-or-uncategorize (`POST /categories/:id/delete`) and the category type-change restriction; account currency locked once the account has postings, and account deletion blocked by postings ([features.md](../product/features.md#accounts)). Refunds ([financial-domain-model.md](../architecture/financial-domain-model.md#refunds)): `refundOfId`, INV-10 under a row lock, derived `refundedAmount`/`refundableAmount`, refund entry from the expense detail. Adjustments ([financial-domain-model.md](../architecture/financial-domain-model.md#adjustments)): "Reconcile balance" from the account, required reason.
- **Tests:** every formula in [financial-calculations.md](../data/financial-calculations.md) touched by transactions (including net-of-refund expense and category totals); transfer invariants; refund invariants (cap with several partial refunds, concurrent refunds of one expense, currency match, date order, rejected edits of a refunded expense, deleting an expense with refunds rejected with `EXPENSE_HAS_REFUNDS` and nothing deleted implicitly); adjustment validation (zero, foreign currency, missing reason, positive and negative); audit diffs and the minimal `DELETE` record (session and API token actors); idempotent creates; filters; E2E quick entry, a partial refund, and a reconciliation.
- **Acceptance criteria:** balances are exact for mixed-currency data including transfers, fees, refunds, and adjustments; a partial and then a full refund reduce the expense category's total and never appear as income, and a further refund is rejected; an adjustment changes the balance and appears in no income, expense, or category total; history shows old and new values; deleting is permanent and leaves only a minimal audit record naming the time and the actor (including "via API token *name*").
- **Requirements:** R-TX-01..14, R-CUR-02, R-CUR-03, R-ACC-04, R-API-02, R-API-03.

## Stage 5: Offline and synchronization

- **Objective:** the app works offline and syncs safely across devices.
- **Prerequisites:** Stage 4; [OQ-21](open-questions.md#oq-21-local-database-library) resolved.
- **Features and deliverables:** sync pull/push endpoints, change log and tombstones, Dexie local database, outbox, sync engine with leader tab, field-level three-way merge, conflict UI, sync status indicator, Socket.IO pokes, service worker caching of the app shell, re-bootstrap on `410` ([offline-and-synchronization.md](../architecture/offline-and-synchronization.md)).
- **Tests:** sync engine with `fake-indexeddb`; server merge rules per entity; concurrent edits from two clients; offline E2E (create/edit/delete offline, reconnect); no silent data loss scenarios from the doc.
- **Acceptance criteria:** with two browsers, offline edits on both reconcile; conflicting financial edits are shown for resolution, never dropped.
- **Requirements:** R-OFF-01..06.

## Stage 6: Attachments and storage

- **Objective:** files on transactions with quotas and both storage drivers.
- **Prerequisites:** Stage 5; [OQ-09](open-questions.md#oq-09-offline-attachment-uploads) confirmed as deferred.
- **Features and deliverables:** `StorageDriver` (local, S3), streaming upload with limits and MIME sniffing, quota reservation, preview/download rules, delayed deletion outbox, orphan sweep, admin storage view and quota settings ([file-storage.md](../architecture/file-storage.md)).
- **Tests:** shared driver contract suite (local + MinIO); size limit abort; concurrent quota; served content types; deletion grace with an injected clock.
- **Acceptance criteria:** a user attaches a receipt photo and a PDF, previews them, and cannot exceed the quota; another user gets 404 for the file.
- **Requirements:** R-ATT-01..05, R-ADM-03.

## Stage 7: Scheduling, jobs and calendar

- **Objective:** recurring and planned transactions, reminders, and the financial calendar.
- **Prerequisites:** Stage 6 (or Stage 5 if attachments slip); [OQ-20](open-questions.md#oq-20-default-execution-mode) resolved.
- **Features and deliverables:** scheduled transactions (recurring and one-off), amount changes, occurrence skip/modify/confirm, AUTO generation job, CONFIRM flow, reminders skeleton (in-app notification rows), calendar month/week/day with actual and planned items ([scheduling-and-calendar.md](../architecture/scheduling-and-calendar.md)).
- **Tests:** recurrence property tests (month-end clamping, DST); idempotent generation under concurrent job runs and restarts; reminder timing in user time zones; calendar aggregation.
- **Acceptance criteria:** a monthly rent on the 31st generates correctly across February; restarting the server during generation creates no duplicates.
- **Requirements:** R-REC-01..05, R-CAL-01..02, R-GEN-09.

## Stage 8: Budgets, savings pots and goals

- **Objective:** spending control and savings tracking.
- **Prerequisites:** Stage 7.
- **Features and deliverables:** budgets (period types, manual and history-based limits, rollover, category/account scope), budget progress; pots with allocations and release; goals from pots or accounts with progress and planned contributions in the calendar ([financial-domain-model.md](../architecture/financial-domain-model.md), [financial-calculations.md](../data/financial-calculations.md)).
- **Tests:** budget period math and limits from history; rollover caps; pot balance never negative under concurrency; goal progress and required contribution.
- **Acceptance criteria:** budget numbers match the documented formulas for the worked examples; pots never change net worth.
- **Requirements:** R-BUD-01..02, R-SAV-01..02, R-CAL-02 (goal events).

## Stage 9: Notifications, push, alerts and insights

- **Objective:** the notification center, Web Push, alert rules, and suggestions.
- **Prerequisites:** Stage 8.
- **Features and deliverables:** notification center and preferences, VAPID and push subscriptions, server-rendered localized push text, alert rules (budget threshold, balance below, category spending above) with dedup and re-arming, insights (duplicates, unusual expense, budget overrun, missing recurring, balance discrepancy) ([notifications.md](../architecture/notifications.md)).
- **Tests:** dedup per period, re-arm, push endpoint cleanup on 410, insight detection thresholds, notifications for deactivated users suppressed.
- **Acceptance criteria:** crossing 80% of a budget yields exactly one notification (in-app and push); insights never change data.
- **Requirements:** R-NOT-01..05, R-BUD-03, R-REC-05.

## Stage 10: Reports

- **Objective:** backend-aggregated reports with comparisons and export.
- **Prerequisites:** Stage 8; [OQ-15](open-questions.md#oq-15-pdf-export) confirmed.
- **Features and deliverables:** report endpoints (income/expense, category breakdown, trends, net worth, month-over-month and year-over-year), saved report definitions, CSV/JSON report export, chart PNG, offline cached results ([reporting-and-dashboard.md](../architecture/reporting-and-dashboard.md)).
- **Tests:** SQL aggregates equal domain calculations on generated data; missing-rate exclusion counts; export formats.
- **Acceptance criteria:** reports match the transaction list totals for the same filters.
- **Requirements:** R-REP-01..06.

## Stage 11: Forecasting

- **Objective:** projected balances clearly separated from actuals.
- **Prerequisites:** Stage 7 and Stage 8; [OQ-19](open-questions.md#oq-19-spending-estimate-method) resolved.
- **Features and deliverables:** forecast engine in `@monevo/domain`, forecast endpoint, forecast screen with scenarios, calendar integration of projected balances ([forecasting.md](../architecture/forecasting.md)).
- **Tests:** deterministic projection fixtures; assumptions reporting; never writes to transaction tables.
- **Acceptance criteria:** the forecast for a known schedule set equals a hand-computed result; projected values are visually distinct everywhere.
- **Requirements:** R-FC-01..03, R-CAL-03.

## Stage 12: Configurable dashboard

- **Objective:** the per-user widget dashboard.
- **Prerequisites:** Stages 9–11 (widgets reuse their data); [OQ-18](open-questions.md#oq-18-mobile-dashboard-layout) resolved.
- **Features and deliverables:** dashboard layout storage and sync, widget catalogue, add/remove/reorder/resize/hide with @dnd-kit, responsive grid ([reporting-and-dashboard.md](../architecture/reporting-and-dashboard.md#dashboard)).
- **Tests:** layout validation limits, unknown widget types ignored, keyboard reordering (accessibility), E2E customization.
- **Acceptance criteria:** the layout persists across devices and works offline.
- **Requirements:** R-DASH-01.

## Stage 13: User export and import

- **Objective:** lossless per-user export and validated import.
- **Prerequisites:** Stage 8 (all exported entity types exist); [OQ-13](open-questions.md#oq-13-csv-re-import) resolved.
- **Features and deliverables:** JSON and CSV export jobs, download and expiry, import upload → validation report → dry-run → apply, ID remapping, duplicate prevention ([import-export.md](../architecture/import-export.md)).
- **Tests:** round-trip export → import into an empty user equals the original; re-importing the same file is refused; invalid files give field-level errors; a failed apply leaves no partial data.
- **Acceptance criteria:** a user moves their data to another Monevo instance.
- **Requirements:** R-EXP-01..03, R-REP-04 (data part).

## Stage 14: OIDC

**Removed** (2026-11-19, [ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md)): OIDC moved into [Stage 2](#stage-2-identity-and-users) as the only authentication method. The heading stays so that stage numbers and links do not change.

## Stage 15: Backups, restore and admin operations

- **Objective:** consistent backups and tested restore; complete the admin panel.
- **Prerequisites:** Stage 6; [OQ-04](open-questions.md#oq-04-admin-backup-access-vs-financial-privacy), [OQ-14](open-questions.md#oq-14-backup-encryption) resolved.
- **Features and deliverables:** backup job, retention, optional S3 target and encryption, download, restore (UI and CLI), pre-upgrade backup, maintenance mode, admin System tab completion, branding ([backups-and-restoration.md](../infrastructure/backups-and-restoration.md), [administration.md](../architecture/administration.md)).
- **Tests:** backup/restore round-trip (local and MinIO); attachment deleted after the dump still restored; newer-version backup refused; sessions invalidated after restore; pre-upgrade hook.
- **Acceptance criteria:** a **restore drill** on a fresh host from a downloaded archive brings back all users, data, and files.
- **Requirements:** R-BAK-01..02, R-ADM-02, R-ADM-06, R-GEN-06.

## Stage 16: Hardening and v1.0

- **Objective:** release quality.
- **Prerequisites:** Stages 1–15 (Stage 14 removed); [OQ-16](open-questions.md#oq-16-user-account-deletion), [OQ-17](open-questions.md#oq-17-license) resolved.
- **Features and deliverables:** security review against [security.md](../architecture/security.md), accessibility audit (axe, keyboard, screen reader spot checks), performance pass (list virtualization, query plans for 50k transactions), full E2E journey set ([testing-strategy.md](../development/testing-strategy.md#e2e-journeys-minimum-set-for-v10)), operator README, release notes, multi-arch images.
- **Tests:** full suite; dependency and image scans; upgrade test from the previous release.
- **Acceptance criteria:** all journeys pass; no high-severity findings open; the user accepts v1.0.
- **Requirements:** R-SEC-02, R-GEN-01..03, all remaining.
