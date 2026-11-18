# Open Questions

Unresolved decisions and assumptions. Each entry has a recommendation, which the documentation already follows as **[Proposed]**, and a deadline: the stage that must not start before the question is answered. When a question is resolved, record the answer under it, change its status to **Resolved**, and update the affected documents (and the ADR, if one exists) in the same change ([contribution-guidelines.md](../development/contribution-guidelines.md#3-documentation-maintenance)).

## Summary

| ID | Question | Recommendation | Confirm before | Status |
|---|---|---|---|---|
| [OQ-01](#oq-01-product-name) | Product name | Keep "Monevo" as a working name | Stage 1 | Open |
| [OQ-02](#oq-02-package-manager-and-repository-layout) | Package manager and repository layout | pnpm workspaces monorepo | Stage 1 | Open |
| [OQ-03](#oq-03-smtp-for-authentication-emails) | SMTP for authentication emails | Optional SMTP; admin reset link as fallback | Stage 2 | Open |
| [OQ-04](#oq-04-admin-backup-access-vs-financial-privacy) | Admin backup access vs financial privacy | Accept operator trust + optional encryption | Stage 15 | Open |
| [OQ-05](#oq-05-changing-the-base-currency) | Changing the base currency | Allow, as a recompute job | Stage 3 | Open |
| [OQ-06](#oq-06-authentication-implementation) | Authentication implementation | Own thin layer on vetted primitives | Stage 2 | Open |
| [OQ-07](#oq-07-ci-platform) | CI platform | GitHub Actions (Forgejo-compatible syntax) | Stage 1 | Open |
| [OQ-08](#oq-08-nodejs-and-postgresql-versions) | Node.js and PostgreSQL versions | Node 24 LTS, PostgreSQL 17 | Stage 1 | Open |
| [OQ-09](#oq-09-offline-attachment-uploads) | Offline attachment uploads | Online-only in v1 (deferred) | Stage 6 | Open |
| [OQ-10](#oq-10-refunds) | Refunds | Enter as INCOME in v1 | Stage 4 | Open |
| [OQ-11](#oq-11-history-retention-for-deleted-transactions) | History retention for deleted transactions | Retain prior audit entries | Stage 4 | Open |
| [OQ-12](#oq-12-adjustment-transaction-type) | Adjustment transaction type | Add `ADJUSTMENT`, excluded from income/expense | Stage 4 | Open |
| [OQ-13](#oq-13-csv-re-import) | CSV re-import | No CSV import in v1 | Stage 13 | Open |
| [OQ-14](#oq-14-backup-encryption) | Backup encryption | Optional age/passphrase encryption | Stage 15 | Open |
| [OQ-15](#oq-15-pdf-export) | PDF export | Deferred | Stage 10 | Open |
| [OQ-16](#oq-16-user-account-deletion) | User account deletion | Deferred in the UI; schema supports it | Stage 16 | Open |
| [OQ-17](#oq-17-license) | License | AGPL-3.0 | Stage 16 (public release) | Open |
| [OQ-18](#oq-18-mobile-dashboard-layout) | Mobile dashboard layout | Same order, full width; optional `mobileOrder` | Stage 12 | Open |
| [OQ-19](#oq-19-spending-estimate-method) | Spending estimate method | Median daily spend over 90 days per category | Stage 11 | Open |
| [OQ-20](#oq-20-default-execution-mode) | Default execution mode | `CONFIRM` | Stage 7 | Open |
| [OQ-21](#oq-21-local-database-library) | Local database library | Dexie 4 | Stage 5 | Open |

**Must be confirmed before Stage 1:** OQ-01, OQ-02, OQ-07, OQ-08. **Before Stage 2:** OQ-03, OQ-06.

## Questions

### OQ-01: Product name

"Monevo" is a working name. It appears in the image name, cookie name (`__Host-monevo_session`), package scope (`@monevo/*`), and the default instance name. Renaming after Stage 1 is a mechanical but wide change (and changing the cookie name logs everyone out).

**Recommendation:** decide before Stage 1; check for trademark and domain conflicts. Operators can rename their instance anyway (branding, R-GEN-06).

### OQ-02: Package manager and repository layout

**Recommendation:** pnpm workspaces monorepo with `apps/server`, `apps/web`, `packages/contracts|domain|i18n`, `e2e/` ([application-structure.md](../architecture/application-structure.md), [ADR-0012](../decisions/ADR-0012-monorepo-and-shared-packages.md)). Alternative: npm workspaces (fewer tools, weaker isolation). Separate repositories are not recommended: the shared contracts and domain packages would need publishing.

### OQ-03: SMTP for authentication emails

Email **notifications** are out of scope (R-NOT-05), but email verification and password reset normally need email. Options:

1. SMTP optional: when configured, verification and reset emails are sent; when not, verification is skipped and the admin generates one-time reset links ([authentication.md](../architecture/authentication.md), [administration.md](../architecture/administration.md#users-r-adm-01-r-auth-04)).
2. SMTP required for every instance.
3. No email at all (admin reset links only).

**Recommendation:** option 1. Confirm that transactional auth emails are not considered "email notifications".

### OQ-04: Admin backup access vs financial privacy

R-ADM-05 says admin privileges never grant access to financial data, but R-BAK-01 lets admins download backups, which contain everyone's data. Any operator with shell or database access can read the data too.

**Recommendation:** accept operator trust explicitly (documented in [security.md](../architecture/security.md#threat-model)); application admins can download backups only after re-authentication, every download is logged, and archives can be encrypted ([OQ-14](#oq-14-backup-encryption)). Alternative: restrict download to the CLI only (UI restore from server-side archives still possible). End-to-end encryption is incompatible with server-side features and is not considered.

### OQ-05: Changing the base currency

**Recommendation:** allow it as an explicit, confirmed operation that runs as a job: recompute `baseAmount` for all postings at historical rates, convert budget limits and alert amounts at today's rate for the user to review, and block the user's financial writes meanwhile (`503 MAINTENANCE_USER`) ([multi-currency.md](../architecture/multi-currency.md)). Alternative: base currency fixed after onboarding (simpler, but a user who moves country is stuck).

### OQ-06: Authentication implementation

**Recommendation:** an own thin session layer on vetted primitives (argon2, `crypto.randomBytes`, openid-client), not a custom crypto or protocol implementation ([ADR-0005](../decisions/ADR-0005-authentication-and-sessions.md)). Alternative: better-auth (more features out of the box, but its schema and session model would need to fit Prisma, composite-key isolation, and the Bearer-token plan for native clients). Confirm before Stage 2.

### OQ-07: CI platform

**Recommendation:** GitHub Actions with workflows kept compatible with Forgejo/Gitea Actions; images on GHCR (or the Forgejo registry). The choice affects the registry name in [docker-compose.md](../infrastructure/docker-compose.md) and the CI files in Stage 1 ([testing-strategy.md](../development/testing-strategy.md#5-ci-pipeline)).

### OQ-08: Node.js and PostgreSQL versions

**Recommendation:** Node.js 24 LTS and PostgreSQL 17 ([technology-stack.md](../architecture/technology-stack.md)). PostgreSQL 18 is acceptable if pinned consistently (server image and `postgresql-client` in the app image must have the same major). Major upgrades later follow [deployment.md](../infrastructure/deployment.md#postgresql-major-upgrades).

### OQ-09: Offline attachment uploads

**Recommendation:** uploads require connectivity in v1; an offline upload queue (blobs in IndexedDB, quota handling, retry) is **[Deferred]** ([offline-and-synchronization.md](../architecture/offline-and-synchronization.md), [file-storage.md](../architecture/file-storage.md)). Transactions themselves work offline; attachments are added once online.

### OQ-10: Refunds

**Recommendation:** in v1 a refund is an INCOME transaction (optionally in a "Refunds" income category); it does not reduce expense totals ([financial-calculations.md](../data/financial-calculations.md)). Alternative for later: a refund link to the original expense that nets it in reports and budgets.

### OQ-11: History retention for deleted transactions

**Recommendation:** when a transaction is deleted, write a minimal `DELETE` audit record and **retain** the earlier `CREATE`/`UPDATE` records for the life of the user account ([financial-domain-model.md](../architecture/financial-domain-model.md), [database-architecture.md](../architecture/database-architecture.md#7-data-lifecycle)). Alternative: purge prior entries on delete (less data, but loses the "what was it" trail).

### OQ-12: Adjustment transaction type

**Recommendation:** add an `ADJUSTMENT` type (one posting) for reconciliation ("set balance to X"), excluded from income, expense, and budgets ([financial-domain-model.md](../architecture/financial-domain-model.md), R-TX-01 interpretation). Opening balances remain an account field. Alternative: use INCOME/EXPENSE in an "Adjustments" category (distorts reports).

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

### OQ-18: Mobile dashboard layout

<a id="oq-mobile-dashboard-layout"></a>**Recommendation:** v1 uses the desktop widget order on mobile with every widget at full width. A separate optional `mobileOrder: string[]` is **[Proposed]** if users want a different order on phones ([reporting-and-dashboard.md](../architecture/reporting-and-dashboard.md#dashboard)).

### OQ-19: Spending estimate method

**Recommendation:** for the "with estimated spending" forecast scenario, use the median daily spend per expense category over the last 90 days, excluding schedule-generated transactions, spread evenly per day ([forecasting.md](../architecture/forecasting.md)). Alternatives: mean (sensitive to one-off large purchases), weekday-weighted, or seasonal models (more complex, less explainable).

### OQ-20: Default execution mode

**Recommendation:** new scheduled transactions default to `CONFIRM` (the user confirms each occurrence, so nothing appears in the ledger without the user's action); `AUTO` is one click away and suggested for fixed amounts such as salary or rent ([scheduling-and-calendar.md](../architecture/scheduling-and-calendar.md), [data-model.md](../data/data-model.md)). Alternative: `AUTO` by default (less friction, more surprise entries).

### OQ-21: Local database library

**Recommendation:** Dexie 4 with `dexie-react-hooks` (live queries, schema versioning, bulk operations) ([frontend-architecture.md](../architecture/frontend-architecture.md)). Alternative: `idb` (smaller, but the sync engine would need its own query and migration helpers). The brief leaves this not finalized; confirm before Stage 5.
