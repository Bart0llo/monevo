# Open Questions

Unresolved decisions and assumptions. Each entry has a recommendation, which the documentation already follows as **[Proposed]**, and a deadline: the stage that must not start before the question is answered. Statuses: **Open** (unanswered), **Closed** (answered; the decision is recorded under the question), **Deferred** (consciously postponed; does not block the stage named). When a question is closed, record the answer under it, change its status to **Closed**, and update the affected documents (and the ADR, if one exists) in the same change ([contribution-guidelines.md](../development/contribution-guidelines.md#3-documentation-maintenance)).

## Summary

| ID | Question | Recommendation | Confirm before | Status |
|---|---|---|---|---|
| [OQ-01](#oq-01-product-name) | Product name | **Decided:** Monevo | Stage 1 | Closed |
| [OQ-02](#oq-02-package-manager-and-repository-layout) | Package manager and repository layout | **Decided:** pnpm workspaces monorepo | Stage 1 | Closed |
| [OQ-03](#oq-03-smtp-for-authentication-emails) | SMTP for authentication emails | **Obsolete:** OIDC-only, Monevo sends no email ([ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md)) | Stage 2 | Closed |
| [OQ-04](#oq-04-admin-backup-access-vs-financial-privacy) | Admin backup access vs financial privacy | Accept operator trust + optional encryption | Stage 15 | Open |
| [OQ-05](#oq-05-changing-the-base-currency) | Changing the base currency | **Decided:** allowed, confirmed, session only; Stage 3 changes the setting, Stage 4 adds the recalculation job | Stage 3 | Closed |
| [OQ-06](#oq-06-authentication-implementation) | Authentication implementation | **Decided:** OIDC-only with Account Center via `openid-client` + own session layer ([ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md)) | Stage 2 | Closed |
| [OQ-07](#oq-07-ci-platform) | CI platform | **Decided:** none for now; local validation ([ADR-0016](../decisions/ADR-0016-local-validation-ci-deferred.md)) | Later (does not block) | Deferred |
| [OQ-08](#oq-08-nodejs-and-postgresql-versions) | Node.js and PostgreSQL versions | **Decided:** Node.js 24; external PostgreSQL via `DATABASE_URL`, maintained majors, minimum 16 ([ADR-0018](../decisions/ADR-0018-postgresql-16-minimum.md)) | Stage 1 | Closed |
| [OQ-09](#oq-09-offline-attachment-uploads) | Offline attachment uploads | Online-only in v1 (deferred) | Stage 6 | Open |
| [OQ-10](#oq-10-refunds) | Refunds | **Decided:** dedicated `REFUND` type linked to the original expense; reduces expense, never income ([ADR-0021](../decisions/ADR-0021-refund-and-adjustment-transaction-types.md)) | Stage 4 | Closed |
| [OQ-11](#oq-11-history-retention-for-deleted-transactions) | History retention for deleted transactions | **Decided:** minimal `DELETE` record (when, who/what); prior audit entries retained | Stage 4 | Closed |
| [OQ-12](#oq-12-adjustment-transaction-type) | Adjustment transaction type | **Decided:** `ADJUSTMENT`, one posting, required reason, excluded from income/expense/budgets ([ADR-0021](../decisions/ADR-0021-refund-and-adjustment-transaction-types.md)) | Stage 4 | Closed |
| [OQ-13](#oq-13-csv-re-import) | CSV re-import | No CSV import in v1 | Stage 13 | Open |
| [OQ-14](#oq-14-backup-encryption) | Backup encryption | Optional age/passphrase encryption | Stage 15 | Open |
| [OQ-15](#oq-15-pdf-export) | PDF export | Deferred | Stage 10 | Open |
| [OQ-16](#oq-16-user-account-deletion) | User account deletion | Deferred in the UI; schema supports it | Stage 16 | Open |
| [OQ-17](#oq-17-license) | License | AGPL-3.0 | Stage 16 (public release) | Open (OFL-1.1 for fonts accepted) |
| [OQ-18](#oq-18-mobile-dashboard-layout) | Mobile dashboard layout | Same order, full width; optional `mobileOrder` | Stage 12 | Open |
| [OQ-19](#oq-19-spending-estimate-method) | Spending estimate method | Median daily spend over 90 days per category | Stage 11 | Open |
| [OQ-20](#oq-20-default-execution-mode) | Default execution mode | `CONFIRM` | Stage 7 | Open |
| [OQ-21](#oq-21-local-database-library) | Local database library | Dexie 4 | Stage 5 | Open |
| [OQ-22](#oq-22-api-token-permission-catalogue-and-lifecycle) | API token permission catalogue and lifecycle | **Decided:** catalogue and defaults in api-tokens.md; revoked on deactivation and restore ([ADR-0017](../decisions/ADR-0017-personal-api-tokens.md), amended by [ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md)) | Stage 2 | Closed |
| [OQ-23](#oq-23-s3-compatible-server-for-development-and-tests) | S3-compatible server for development and tests | Evaluate Garage and SeaweedFS against the driver contract suite | Stage 6 | Open |
| [OQ-24](#oq-24-deleting-an-expense-that-has-refunds) | Deleting an expense that has refunds | **Decided:** rejected with `422 EXPENSE_HAS_REFUNDS` until the user deletes the refunds; nothing deleted implicitly | Stage 4 | Closed |

**Before Stage 1:** nothing open (OQ-01, OQ-02, OQ-08 closed; OQ-07 deferred, 2026-11-18). **Before Stage 2:** nothing open (OQ-03, OQ-06, OQ-22 closed, 2026-11-19; reviewed again for the OIDC-only switch, [ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md)). **Before Stage 4:** nothing open (OQ-10, OQ-11, OQ-12, OQ-24 closed, 2026-11-19).

## Questions

### OQ-01: Product name

**Status: Closed (2026-11-18).** **Decision:** the product name is **Monevo**, used consistently in all documentation with no alternative or placeholder names. Technical identifiers follow it: image `monevo`, cookie `__Host-monevo_session`, package scope `@monevo/*`, environment prefix `MONEVO_` (e.g. `MONEVO_SKIP_PRE_UPGRADE_BACKUP`), file formats `monevo-backup` and `monevo-export`, and the default instance name `Monevo`. Operators can still rename their own instance (branding, R-GEN-06).

### OQ-02: Package manager and repository layout

**Status: Closed (2026-11-18).** **Decision:** pnpm, in a pnpm workspaces monorepo, as described below and in [ADR-0012](../decisions/ADR-0012-monorepo-and-shared-packages.md) (now Accepted). The workspace itself is created in Stage 1.

**Original recommendation:** pnpm workspaces monorepo with `apps/server`, `apps/web`, `packages/contracts|domain|i18n`, `e2e/` ([application-structure.md](../architecture/application-structure.md), [ADR-0012](../decisions/ADR-0012-monorepo-and-shared-packages.md)). Alternative: npm workspaces (fewer tools, weaker isolation). Separate repositories are not recommended: the shared contracts and domain packages would need publishing.

### OQ-03: SMTP for authentication emails

**Status: Closed (2026-11-19), obsolete.** The user switched to OIDC-only authentication ([ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md)): Monevo has no passwords, no password reset, no email verification and no email change, so it sends no email and needs no SMTP. Credentials and email addresses are managed in Account Center. *(Earlier the same day, option 1, optional SMTP with an admin reset link as the fallback, had been chosen; that decision is void.)*

**Original question:** email **notifications** are out of scope (R-NOT-05), but email verification and password reset normally need email. Options:

1. SMTP optional: when configured, verification and reset emails are sent; when not, verification is skipped and the admin generates one-time reset links ([authentication.md](../architecture/authentication.md), [administration.md](../architecture/administration.md#users-r-adm-01-r-auth-04)).
2. SMTP required for every instance.
3. No email at all (admin reset links only).

**Recommendation:** option 1. Confirm that transactional auth emails are not considered "email notifications".

### OQ-04: Admin backup access vs financial privacy

R-ADM-05 says admin privileges never grant access to financial data, but R-BAK-01 lets admins download backups, which contain everyone's data. Any operator with shell or database access can read the data too.

**Recommendation:** accept operator trust explicitly (documented in [security.md](../architecture/security.md#threat-model)); application admins can download backups only after re-authentication, every download is logged, and archives can be encrypted ([OQ-14](#oq-14-backup-encryption)). Alternative: restrict download to the CLI only (UI restore from server-side archives still possible). End-to-end encryption is incompatible with server-side features and is not considered.

### OQ-05: Changing the base currency

**Status: Closed (2026-11-19).** **Decision:** the base currency can be changed as an explicit, confirmed operation: `POST /me/base-currency-change` with `{ baseCurrency, confirm: true }` and `If-Match`, session only (never available to API tokens) ([api-design.md](../architecture/api-design.md#8-endpoint-map-v1-indicative)). Stage 3 changes only `user_settings.baseCurrency` (no ledger exists yet). From Stage 4 the same endpoint starts a recalculation background job: `users.maintenanceState = BASE_CURRENCY_CHANGE` blocks the user's financial writes (`503 MAINTENANCE_USER`) until the job succeeds; base amounts are recomputed at historical rates per item date; original amounts are never changed. The change is not complete until recalculation succeeds ([multi-currency.md](../architecture/multi-currency.md#9-base-currency)).

**Original recommendation:** allow it as an explicit, confirmed operation that runs as a job: recompute `baseAmount` for all postings at historical rates, convert budget limits and alert amounts at today's rate for the user to review, and block the user's financial writes meanwhile (`503 MAINTENANCE_USER`) ([multi-currency.md](../architecture/multi-currency.md)). Alternative: base currency fixed after onboarding (simpler, but a user who moves country is stuck).

### OQ-06: Authentication implementation

**Status: Closed (2026-11-19).** **Decision:** OIDC-only authentication with Account Center as the single identity provider ([ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md), superseding [ADR-0005](../decisions/ADR-0005-authentication-and-sessions.md)): `openid-client` v6 for the Relying Party (Authorization Code + PKCE S256, state, nonce, JWKS-verified ID tokens, refresh grant, RP-initiated logout), plus Monevo's own thin session layer on vetted primitives: `crypto.randomBytes` + SHA-256 for session and token hashes, AES-256-GCM via Node `crypto` for the encrypted state cookie and stored IdP refresh tokens, and `express-rate-limit` with its in-memory store (one container; counters reset on restart). Users are provisioned on first login and keyed by `(issuer, sub)`, never by email. Sensitive actions (API token creation, admin deactivation and role change) need a recent authentication within 15 minutes, done by re-signing in at the IdP with `prompt=login` (otherwise `403 REAUTH_REQUIRED`). Details: [authentication.md](../architecture/authentication.md). *(Earlier the same day, a local-password design with argon2 and nodemailer had been chosen; it was replaced before implementation.)*

**Original recommendation:** an own thin session layer on vetted primitives (argon2, `crypto.randomBytes`, openid-client), not a custom crypto or protocol implementation ([ADR-0005](../decisions/ADR-0005-authentication-and-sessions.md)). Alternative: better-auth (more features out of the box, but its schema and session model would need to fit Prisma, composite-key isolation, and the Bearer-token plan for native clients). Confirm before Stage 2.

### OQ-07: CI platform

**Status: Deferred (2026-11-18).** **Decision:** no CI platform is introduced for the initial development phase: no GitHub Actions, Woodpecker CI, or other service, no cloud CI dependency, usage limits, or paid runners. Tests, linting, type checking, and the other checks run locally through `pnpm validate` and `pnpm test:e2e` ([ADR-0016](../decisions/ADR-0016-local-validation-ci-deferred.md), [testing-strategy.md](../development/testing-strategy.md#5-local-validation)). A platform can be chosen later as a thin wrapper around the same scripts, without significant changes to the architecture or the workflow. The image registry (GHCR) and an opt-in, publish-only release workflow are proposed separately in [ADR-0019](../decisions/ADR-0019-release-management.md) (pending acceptance); they are not a merge gate, so this question stays deferred.

**Original recommendation (not adopted for now):** GitHub Actions with workflows kept compatible with Forgejo/Gitea Actions; images on GHCR (or the Forgejo registry). The choice affects the registry name in [docker-compose.md](../infrastructure/docker-compose.md) and the CI files in Stage 1 ([testing-strategy.md](../development/testing-strategy.md#5-local-validation)).

### OQ-08: Node.js and PostgreSQL versions

**Status: Closed (2026-11-18).** **Decision:** Node.js 24 in development and in the Docker image. PostgreSQL is **externally hosted**: Monevo connects through `DATABASE_URL`, the Compose stack has no mandatory PostgreSQL container, and nothing provider-specific is hard-coded. Supported: maintained PostgreSQL majors supported by Prisma, minimum 16 (lowered from 17 on 2026-11-18, [ADR-0018](../decisions/ADR-0018-postgresql-16-minimum.md)), never an end-of-life major. Connection, TLS, pooling, and deployment requirements: [postgresql.md](../infrastructure/postgresql.md); decision record: [ADR-0015](../decisions/ADR-0015-external-postgresql.md).

**Original recommendation (superseded):** Node.js 24 LTS and PostgreSQL 17 ([technology-stack.md](../architecture/technology-stack.md)). PostgreSQL 18 is acceptable if pinned consistently (server image and `postgresql-client` in the app image must have the same major). Major upgrades later follow [deployment.md](../infrastructure/deployment.md#postgresql-major-upgrades).

### OQ-09: Offline attachment uploads

**Recommendation:** uploads require connectivity in v1; an offline upload queue (blobs in IndexedDB, quota handling, retry) is **[Deferred]** ([offline-and-synchronization.md](../architecture/offline-and-synchronization.md), [file-storage.md](../architecture/file-storage.md)). Transactions themselves work offline; attachments are added once online.

### OQ-10: Refunds

**Status: Closed (2026-11-19).** **Decision:** the recommendation (refund as INCOME) is **not** accepted. Refunds are a dedicated `REFUND` transaction type (R-TX-13, [ADR-0021](../decisions/ADR-0021-refund-and-adjustment-transaction-types.md)):

- A refund is linked to its original expense (`refundOfId`) and is a separate financial operation; the original expense and its history are never edited or deleted by it.
- Partial and full refunds are supported, including several partial refunds for one expense, as long as their combined amount never exceeds the original expense.
- A refund increases the balance of the account receiving the money, reduces reported expenses in the original expense's category (reports and budgets), and never appears as ordinary income. There is no default "Refunds" income category.
- **Currency and exchange rates:** a refund is entered in the expense's original currency, so the cap is an exact comparison; the refund resolves its own rate to the receiving account and its own base conversion for its own date; neither transaction changes the other's rate snapshots. A full refund of a foreign-currency expense may therefore leave a small base-currency difference when the rate moved, which reflects the real rates on the two dates and is not corrected artificially.
- **Reporting:** reports and budgets count a refund in the period of its own date; it takes its category from the original expense; account filters use the account receiving the refund.
- **Entry rules:** a refund can go to any active account (default: the original expense's account); its date cannot be earlier than the expense's date; its link to the expense is immutable; no transaction can change type into or out of `REFUND`.
- **Expense with refunds:** cannot change type or original currency, cannot lower its amount below the total already refunded, and cannot move its date after its first refund. Deleting it is rejected until its refunds are deleted ([OQ-24](#oq-24-deleting-an-expense-that-has-refunds)).

Details: [financial-domain-model.md](../architecture/financial-domain-model.md#refunds), [multi-currency.md](../architecture/multi-currency.md#refunds-and-adjustments), [financial-calculations.md](../data/financial-calculations.md#income-and-expense-totals).

**Original recommendation (rejected):** in v1 a refund is an INCOME transaction (optionally in a "Refunds" income category); it does not reduce expense totals. Alternative for later: a refund link to the original expense that nets it in reports and budgets.

### OQ-11: History retention for deleted transactions

**Status: Closed (2026-11-19).** **Decision:** the recommendation is accepted ([financial-domain-model.md](../architecture/financial-domain-model.md#transaction-history-audit), R-TX-09):

- Deleting a transaction writes a minimal `DELETE` audit record containing only what establishes that it was deleted, when, and who or what initiated it (time, actor type, user, credential type, session or personal API token with a copy of the token name, device label). No amounts, accounts, category, description, notes, custom fields, or attachment data are copied.
- Earlier `CREATE` and `UPDATE` records remain available for the lifetime of the user account.
- A deleted transaction no longer affects balances, reports, or budgets (its postings are physically deleted).
- A deletion made with a personal API token records `credentialType = API_TOKEN`, the token ID, and the token name, so it stays identifiable after the token is revoked or purged.

**Original recommendation:** when a transaction is deleted, write a minimal `DELETE` audit record and **retain** the earlier `CREATE`/`UPDATE` records for the life of the user account. Alternative: purge prior entries on delete (less data, but loses the "what was it" trail).

### OQ-12: Adjustment transaction type

**Status: Closed (2026-11-19).** **Decision:** the recommendation is accepted (R-TX-14, [ADR-0021](../decisions/ADR-0021-refund-and-adjustment-transaction-types.md)). An `ADJUSTMENT` has a single posting and reconciles an account's recorded balance with its actual balance. It affects the balance, is not income or expense, does not affect budgets, requires a reason (`description`), and appears in transaction and audit history. Validation: amount non-zero, positive or negative, in the account currency only (no conversion), within the currency's precision, on an active account; the API accepts the signed amount; the UI computes the delta from the target balance and saves nothing when it is zero ([financial-domain-model.md](../architecture/financial-domain-model.md#adjustments)). Adjustments are not available in transaction templates or scheduled transactions. Opening balances remain an account field.

**Original recommendation:** add an `ADJUSTMENT` type (one posting) for reconciliation ("set balance to X"), excluded from income, expense, and budgets. Opening balances remain an account field. Alternative: use INCOME/EXPENSE in an "Adjustments" category (distorts reports).

### OQ-13: CSV re-import

<a id="oq-csv-re-import"></a>CSV exports exist for spreadsheets. Importing **bank statement** CSVs is out of scope, but re-importing Monevo's own CSV export could be expected by users.

**Recommendation:** no CSV import in v1; the JSON export is the lossless round-trip format ([import-export.md](../architecture/import-export.md)). Revisit after v1 if users ask for it.

### OQ-14: Backup encryption

**Recommendation:** optional encryption with age (scrypt passphrase), via `BACKUP_ENCRYPTION_PASSPHRASE` or the admin setting ([backups-and-restoration.md](../infrastructure/backups-and-restoration.md#encryption)). Alternative: leave encryption to the storage target (encrypted disk or S3 server-side encryption). Losing the passphrase loses the backups; the UI warns about it.

### OQ-15: PDF export

**Recommendation:** **[Deferred]** (requirements deferred list). v1 offers CSV/JSON report export and client-side chart PNG ([reporting-and-dashboard.md](../architecture/reporting-and-dashboard.md)). Confirm that this satisfies R-REP-04 for v1.

### OQ-16: User account deletion

**Recommendation:** self-service deletion is **[Deferred]**; admin deletion is deferred in the UI too, while the schema supports it by cascade plus `storage_deletions` ([administration.md](../architecture/administration.md#users-r-adm-01-r-auth-04)). Deactivation covers v1 needs. Confirm before v1.0 whether GDPR-style erasure is needed for the intended deployments (a CLI command would be the minimal answer).

### OQ-17: License

**Recommendation:** AGPL-3.0 (self-hosted network software; keeps hosted forks open). Alternatives: MIT or Apache-2.0 for maximum reuse. Must be decided before the repository is published; third-party dependency licenses are checked against it ([dependencies.md](dependencies.md)).

**Partial decision (2026-11-18):** the SIL Open Font License 1.1 (OFL-1.1) is accepted for third-party **font** dependencies, starting with `@fontsource-variable/hanken-grotesk` ([dependencies.md](dependencies.md#policy)). OFL-1.1 allows bundling and redistributing the fonts with software under any license, including each candidate above; it only forbids selling the fonts on their own and reusing the reserved font name for modified versions. The project license itself is still open.

### OQ-18: Mobile dashboard layout

<a id="oq-mobile-dashboard-layout"></a>**Recommendation:** v1 uses the desktop widget order on mobile with every widget at full width. A separate optional `mobileOrder: string[]` is **[Proposed]** if users want a different order on phones ([reporting-and-dashboard.md](../architecture/reporting-and-dashboard.md#dashboard)).

### OQ-19: Spending estimate method

**Recommendation:** for the "with estimated spending" forecast scenario, use the median daily spend per expense category over the last 90 days, excluding schedule-generated transactions, spread evenly per day ([forecasting.md](../architecture/forecasting.md)). Alternatives: mean (sensitive to one-off large purchases), weekday-weighted, or seasonal models (more complex, less explainable).

### OQ-20: Default execution mode

**Recommendation:** new scheduled transactions default to `CONFIRM` (the user confirms each occurrence, so nothing appears in the ledger without the user's action); `AUTO` is one click away and suggested for fixed amounts such as salary or rent ([scheduling-and-calendar.md](../architecture/scheduling-and-calendar.md), [data-model.md](../data/data-model.md)). Alternative: `AUTO` by default (less friction, more surprise entries).

### OQ-21: Local database library

**Recommendation:** Dexie 4 with `dexie-react-hooks` (live queries, schema versioning, bulk operations) ([frontend-architecture.md](../architecture/frontend-architecture.md)). Alternative: `idb` (smaller, but the sync engine would need its own query and migration helpers). The brief leaves this not finalized; confirm before Stage 5.

### OQ-22: API token permission catalogue and lifecycle

**Status: Closed (2026-11-19).** **Decision:** the design in [api-tokens.md](../architecture/api-tokens.md) as recommended below ([ADR-0017](../decisions/ADR-0017-personal-api-tokens.md), now Accepted, amended by [ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md)), with these changes. (1) The catalogue in `@monevo/contracts` and the creation form contain **only permissions whose routes exist**: Stage 2 ships `profile:read`, and each later stage adds the permissions of its routes; the table in api-tokens.md stays as the plan. (2) **Password-related revocation: not applicable.** Monevo has no passwords after the OIDC-only switch, so there is no password change or reset to react to (the earlier `PASSWORD_RESET` revocation is dropped). Tokens are still revoked on admin deactivation (`DEACTIVATED`) and backup restore (`RESTORE`). Creation requires a recent authentication, which is now a re-sign-in at the identity provider.

**Original question:** personal API tokens are in scope (R-TOK-01..09, decided 2026-11-18). The design details that the requirements leave open follow the recommendation as **[Proposed]** ([api-tokens.md](../architecture/api-tokens.md), [ADR-0017](../decisions/ADR-0017-personal-api-tokens.md)).

**Recommendation:** the permission catalogue in [api-tokens.md](../architecture/api-tokens.md#4-permission-catalogue) (independent read, create, update, and delete per resource where supported, with "also requires" for cross-resource writes); never available to tokens: auth, account and credential management, sessions, token management, push subscriptions, notification preferences, admin, sync, realtime, dashboard layout, and export/import; permissions fixed at creation (rename only); at most 50 active tokens per user; expiration optional with a 90-day UI default; creation requires a recent authentication; tokens revoked on deactivation and backup restore but kept on password change or reset; `If-Match` required for token updates and deletes. Alternatives: allow export/import or dashboard access with dedicated permissions; editable permissions; a mandatory maximum lifetime; revoking tokens on password reset. Confirm before Stage 2.

### OQ-23: S3-compatible server for development and tests

Raised in Stage 1 (2026-11-18). The docs planned MinIO (`minio/minio`) for the `s3` storage-driver tests in `docker-compose.dev.yml`, the E2E stack, and the optional same-host `s3` profile in `docker-compose.yml` ([docker-compose.md](../infrastructure/docker-compose.md#2-compose-services), [testing-strategy.md](../development/testing-strategy.md)). The MinIO images are no longer publicly pullable (Docker Hub: pull access denied; quay.io: 401), so Stage 1 ships the compose files **without an S3 service**. Nothing in Stages 1-5 needs one; the `s3` driver and its contract suite arrive in Stage 6 ([file-storage.md](../architecture/file-storage.md)).

**Recommendation:** at Stage 6, evaluate Garage and SeaweedFS (both maintained, open source, with public images) against the `StorageDriver` contract suite (multipart upload, streaming, ranged reads, delete) and pick the one that passes with the simplest configuration; use it for development, tests, and the optional `s3` profile. Alternatives: RustFS (newer, less proven); MinIO built from source into a project-maintained image (maintenance burden); a hosted S3 bucket for tests (needs credentials, not offline). Confirm before Stage 6.

### OQ-24: Deleting an expense that has refunds

**Status: Closed (2026-11-19).** **Decision:** option 1 (reject) is accepted:

- Deleting an expense that still has refunds fails with `422 EXPENSE_HAS_REFUNDS`.
- The delete confirmation lists the linked refunds, each with a link to its details.
- The user deletes the refunds manually; only then can the expense be deleted.
- Refunds are never deleted implicitly, and deleting a transaction never deletes any other financial operation automatically.

Details: [financial-domain-model.md](../architecture/financial-domain-model.md#refunds), [entity-relationships.md](../data/entity-relationships.md#3-deletion-rules), [features.md](../product/features.md#editing-deletion-history).

**Original question:** raised by the OQ-10 decision (2026-11-19). A refund must always be linked to its original expense, and Stage 4 implements permanent deletion (R-TX-08). The user's requirements do not say what happens when the user deletes an expense that already has refunds, and every option changes data the user did not explicitly pick, so it is a product decision. It blocks Stage 4 because it determines the delete command, the foreign key behaviour of `refundOfId`, the error codes, and the confirmation UI.

Options:

1. **Reject** with `422 EXPENSE_HAS_REFUNDS` until the user deletes the refunds; the UI lists them with links. Keeps every refund linked, never deletes anything implicitly (the same philosophy as account deletion, [features.md](../product/features.md#accounts)).
2. **Delete together:** the confirmation names the N refunds, and the expense and its refunds are deleted in one command (each gets its own minimal `DELETE` audit record).
3. **Ask each time** (like a transfer's fee): offer "delete with refunds" or cancel. In effect option 2 with an extra step; keeping the refunds is impossible, because a refund without an expense would break R-TX-13.

**Original recommendation:** option 1 (accepted).
