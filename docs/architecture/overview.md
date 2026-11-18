# Architecture Overview

## Summary

Monevo is a **modular monolith**: one Node.js process (Express) serves the React PWA as static files, the REST API under `/api/v1`, the Socket.IO realtime endpoint, and in-process background jobs. PostgreSQL, hosted externally and reached through `DATABASE_URL`, is the system of record. Attachment content lives in a storage backend (a local volume or S3-compatible storage). The browser keeps a replica of the user's data in IndexedDB for offline use and synchronizes through a cursor-based sync API.

```
                    ┌──────────────────────── Browser / PWA ────────────────────────┐
                    │  React + Mantine UI                                           │
                    │   ├─ Local DB (IndexedDB via Dexie): synced entities, outbox  │
                    │   ├─ Sync engine (push mutations / pull changes by cursor)    │
                    │   ├─ TanStack Query: server-only data (reports, admin…)       │
                    │   └─ Service worker: app shell cache, Web Push                │
                    └───────────────┬───────────────────────────────┬───────────────┘
                         HTTPS REST │ /api/v1/*        WebSocket    │ /api/v1/realtime
                                    │                  (pokes only) │
   Reverse proxy (TLS, operator's choice: Caddy / Traefik / nginx)  │
                                    │                               │
┌───────────────────────────────── app container (single image) ─────────────────────────────────┐
│ Node.js process                                                                                 │
│  Express 5                                                                                      │
│   ├─ static: built web app (/, SPA fallback)                                                    │
│   ├─ /api/v1/* REST routers → validation (Zod) → module services → Prisma repositories         │
│   ├─ /api/v1/docs (Swagger UI), /api/v1/openapi.json                                            │
│   └─ Socket.IO server (path /api/v1/realtime) – user rooms                                      │
│  Job runner (pg-boss, in-process): recurring generation, reminders, alerts, backups, cleanup   │
│  Storage driver: local FS (/data/attachments) | S3 client                                       │
└───────────────┬───────────────────────────────────────────────┬─────────────────────────────────┘
                │ DATABASE_URL (TLS off-host)                   │
        ┌───────▼────────┐                             ┌────────▼─────────┐
        │ PostgreSQL ≥17 │                             │ S3/MinIO (opt.)  │
        │ (external)     │                             │ or local volume  │
        └────────────────┘                             └──────────────────┘
External (outbound only): OIDC provider · exchange rate provider · Web Push services · SMTP (auth emails)
```

## Key architectural decisions

| Topic | Decision | ADR |
|---|---|---|
| Backend framework | Express 5 modular monolith, not NestJS | [ADR-0001](../decisions/ADR-0001-express-modular-monolith.md) |
| Packaging | One application image; Postgres separate | [ADR-0002](../decisions/ADR-0002-single-application-image.md) |
| Database hosting | External PostgreSQL via `DATABASE_URL`, no database in the Monevo stack | [ADR-0015](../decisions/ADR-0015-external-postgresql.md) |
| Persistence | PostgreSQL + Prisma, raw SQL migrations for constraints | [ADR-0003](../decisions/ADR-0003-postgresql-and-prisma.md) |
| API | REST `/api/v1`, Zod-defined contracts → OpenAPI 3.1 | [ADR-0004](../decisions/ADR-0004-rest-api-versioning-and-contracts.md) |
| Auth | Local + one OIDC provider, server-side opaque sessions | [ADR-0005](../decisions/ADR-0005-authentication-and-sessions.md) |
| Isolation | `userId` on every owned row, composite FKs, scoped repositories | [ADR-0006](../decisions/ADR-0006-user-data-isolation.md) |
| Money | `NUMERIC` + decimal.js, decimal strings in JSON, stored rate snapshots | [ADR-0007](../decisions/ADR-0007-money-and-multi-currency.md) |
| Ledger | Transaction header + postings; transfers = 2 postings | [ADR-0008](../decisions/ADR-0008-transaction-and-transfer-model.md) |
| Offline | Per-user change log with monotonic seq, idempotent mutations, field-level 3-way merge | [ADR-0009](../decisions/ADR-0009-offline-synchronization.md) |
| Files | Storage driver abstraction (local / S3), quotas in DB | [ADR-0010](../decisions/ADR-0010-file-storage-abstraction.md) |
| Backups | pg_dump + immutable attachment copy, delayed physical deletion | [ADR-0011](../decisions/ADR-0011-backup-and-restore.md) |
| Repo | pnpm workspaces monorepo with shared contracts/domain packages | [ADR-0012](../decisions/ADR-0012-monorepo-and-shared-packages.md) |
| Scheduling | Scheduled transactions + computed occurrences; pg-boss job runner | [ADR-0013](../decisions/ADR-0013-scheduled-transactions-and-jobs.md) |
| Savings pots | Allocations, not transactions | [ADR-0014](../decisions/ADR-0014-virtual-savings-pots.md) |
| Validation | Local validation scripts; CI platform deferred | [ADR-0016](../decisions/ADR-0016-local-validation-ci-deferred.md) |
| API tokens | Opaque hashed personal API tokens with per-resource permissions | [ADR-0017](../decisions/ADR-0017-personal-api-tokens.md) |

## Module map

Backend modules (each one owns its tables, services, routes, and contracts; see [backend-architecture.md](backend-architecture.md)):

| Module | Responsibility | Depends on |
|---|---|---|
| `system` | Health, version, config loading | n/a |
| `auth` | Login, registration, sessions, OIDC, personal API tokens, single-use tokens, email flows | `users` |
| `users` | User profile, settings (locale, tz, base currency) | n/a |
| `admin` | Admin endpoints (users status, settings, status) | `users`, `auth`, `storage`, `backups` |
| `currencies` | Currency reference, exchange rates, providers, conversion service | n/a |
| `accounts` | Accounts, balances | `currencies` |
| `categories` | Category tree | n/a |
| `transactions` | Transactions, postings, transfers, adjustments, templates, custom fields, history | `accounts`, `categories`, `currencies` |
| `attachments` | Attachment metadata, upload/download, quota | `transactions`, `storage` |
| `storage` | Storage drivers (infrastructure) | n/a |
| `scheduling` | Scheduled transactions, occurrences, generation, reminders | `transactions` |
| `budgets` | Budgets, period computation | `categories`, `transactions` (read) |
| `savings` | Pots, allocations, goals | `accounts` |
| `alerts` | Alert rules evaluation | `budgets`, `accounts`, `transactions` (read) |
| `notifications` | Notification center, preferences, Web Push | n/a |
| `insights` | Anomaly suggestions | `transactions`, `scheduling` (read) |
| `calendar` | Calendar aggregation (actual + planned) | `transactions`, `scheduling`, `savings` |
| `forecast` | Forecast computation | `accounts`, `scheduling`, `savings`, `currencies` |
| `reports` | Aggregated analytics, saved report definitions | `transactions` (read), `currencies` |
| `dashboard` | Per-user widget layout | n/a |
| `sync` | Change log, pull/push, mutation dispatch | all synced modules' command handlers |
| `realtime` | Socket.IO server, user rooms | `auth` |
| `exportimport` | User export/import | most domain modules |
| `backups` | Backup/restore orchestration | `storage` |

Pure, framework-free logic (money math, conversion, recurrence expansion, budget period math, forecast projection, balance computation) lives in the shared `@monevo/domain` package and is used by both server and client (see [application-structure.md](application-structure.md)).

## Data flow examples

**Create an expense (online, web):**
1. The UI writes the transaction optimistically to IndexedDB and enqueues a mutation `{mutationId, type: "transaction.create", entityId (UUIDv7), payload}`.
2. The sync engine pushes to `POST /api/v1/sync/push`.
3. The server validates (Zod) → `transactions` command handler → resolves rates → in one DB transaction it inserts the transaction and posting, writes the audit `CREATE` record, bumps the user sequence, upserts the change log, and stores the idempotency record.
4. After commit: Socket.IO `sync:poke` to the user's room, and enqueue alert evaluation.
5. Other devices receive the poke → `GET /api/v1/sync/pull?cursor=…` → apply.

**Create an expense (Android/integration, future):** `POST /api/v1/transactions` with an `Idempotency-Key`. Same command handler, same transaction boundary, same change log.

**Recurring auto-generation:** a pg-boss job runs every 15 minutes → for each due `AUTO` occurrence (in the user's time zone) → the `transactions` command handler creates the transaction with `(scheduledTransactionId, occurrenceDate)` unique → the same post-commit pipeline runs.

## Cross-cutting principles

1. **One write path:** REST endpoints and sync mutations call the same command handlers. There is no duplicate validation or business logic.
2. **One DB transaction per command,** including audit, change log, and idempotency record. Side effects (sockets, push, storage deletion) happen after commit, driven by durable records or jobs.
3. **Authorization from the authenticated credential only:** handlers receive `ctx.userId` from the session or personal API token, and repositories require it. Tokens are further limited by their permissions ([api-tokens.md](api-tokens.md)).
4. **Exact money everywhere:** see [multi-currency.md](multi-currency.md).
5. **Actual vs. projected separation:** projections are computed on demand and never written to transaction tables.
