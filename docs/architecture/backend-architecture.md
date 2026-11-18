# Backend Architecture

**[Accepted]** Express modular monolith ([ADR-0001](../decisions/ADR-0001-express-modular-monolith.md)). **[Proposed]** internal conventions.

## 1. Process layout

`apps/server/src/main.ts` boot sequence:
1. Load and validate config (Zod over `process.env` + `*_FILE` secrets). Fail fast with a readable error.
2. Create the logger (pino).
3. Connect Prisma (pg driver adapter). Verify the DB is reachable and migrations are applied (migrations themselves run in the container entrypoint via `prisma migrate deploy`; see [docker-compose.md](../infrastructure/docker-compose.md)).
4. Load runtime settings from `app_settings` (cached, invalidated on admin update).
5. Initialize the storage driver (local or S3) and verify write access with a probe object.
6. Start pg-boss (creates its schema `pgboss` on first run) and register job handlers and cron schedules.
7. Build the Express app (`app.ts` factory), attach Socket.IO to the HTTP server, and listen on `PORT` (default 3000).
8. Graceful shutdown on SIGTERM/SIGINT: stop accepting connections, close sockets, `boss.stop({ graceful: true })`, close Prisma, exit (timeout 25 s, under the Docker 30 s default).

There is one Node process. No cluster mode (single-user-scale load; avoids cross-process socket and job coordination).

## 2. Layers

```
HTTP layer        routes.ts         express Router; parse+validate (Zod) → call service → map DTO → respond
                  http/middleware   requestId, logging, helmet, rate limit, auth, csrf, error handler
Application layer *.service.ts      commands/queries; owns DB transaction boundaries; enforces domain rules;
                                    calls ChangeTracker, AuditWriter, IdempotencyStore; emits post-commit events
Domain layer      @monevo/domain    pure functions & types (money, recurrence, budgets, forecast, merge)
Persistence       *.repo.ts         Prisma queries, always userId-scoped; raw SQL for reports
Infrastructure    infra/*           prisma client, storage drivers, mailer, push, job runner, socket, rate providers
```

Rules:
- Routes contain no business logic. Services contain no `req`/`res`. Repositories contain no business rules.
- A service method takes `(ctx: RequestContext, input: ValidatedDto)`. `ctx` carries `userId`, `role`, `credential` (`SESSION` with `sessionId`, or `API_TOKEN` with `apiTokenId`, name, and permissions; [api-tokens.md](api-tokens.md)), `requestId`, `actor` (`USER` | `SYSTEM_SCHEDULE` | `IMPORT`).
- Jobs construct a `SystemContext` for a specific `userId` and call the same services.

## 3. Command pattern (single write path)

Every state-changing operation on synced entities is a **command** registered in a module:

```ts
// modules/transactions/index.ts
registerCommand('transaction.create', {
  input: TransactionCreateSchema,            // from @monevo/contracts
  handler: (tx, ctx, input) => transactionsService.create(tx, ctx, input),
  sync: { entityType: 'transaction', op: 'create' },
});
```

- REST routes call `executeCommand(ctx, 'transaction.create', body, { idempotencyKey })`.
- Sync push calls `executeCommand(ctx, name, payload, { idempotencyKey: mutationId, baseVersion, baseValues })`.
- `executeCommand` opens **one** Prisma interactive transaction (`ReadCommitted` + explicit row locks where needed), checks idempotency, runs the handler, writes audit and change log, stores the idempotency result, commits, then publishes post-commit events.

This guarantees that REST and sync behave identically (validation, invariants, audit, change tracking).

## 4. Transactions and locking

| Situation | Approach |
|---|---|
| Normal entity write | Interactive transaction. Optimistic concurrency via `version` (`UPDATE … WHERE id AND user_id AND version = $v`). |
| Change log seq allocation | `UPDATE user_sync_state … RETURNING` (row lock, per user) inside the same transaction. |
| Quota reservation | `SELECT … FROM users WHERE id = $1 FOR UPDATE` then update `storage_used_bytes`. |
| Pot release (no negative balance) | Lock the pot row (`FOR UPDATE`), compute the sum, insert the allocation. |
| Recurring generation | Unique constraints `(scheduled_transaction_id, occurrence_date)`. A duplicate insert means already done. |
| Base currency change | Long operation, run as a job, chunked per 1 000 postings, user-level lock (advisory lock `pg_advisory_xact_lock(hashtext('basecur:'||userId))`). The user is in a "recomputing" state, which blocks other financial writes with `503 MAINTENANCE_USER`. |

The isolation level is Read Committed (the Postgres default) plus the explicit locks above. Serializable is not needed given these patterns.

## 5. Post-commit events

An in-process typed event bus (`infra/events.ts`, a simple emitter) receives events **after commit** only (`executeCommand` buffers them during the transaction):

| Event | Consumers |
|---|---|
| `entity.changed { userId, seq }` | realtime → `sync:poke` |
| `transaction.changed { userId, ids }` | enqueue `alerts.evaluate` job (debounced per user via pg-boss singletonKey + 30 s delay), invalidate forecast cache |
| `attachment.deleted { storageKey }` | (storage deletion is durable via the `storage_deletions` table written in-transaction, so no event is needed) |
| `notification.created { userId, id }` | realtime → `notification:new`, enqueue `push.send` |

Anything that must not be lost is written to a table **inside** the transaction (change log, storage deletions, notifications) or enqueued as a pg-boss job. In-memory events are only optimizations, and periodic jobs reconcile.

## 6. Background jobs (pg-boss)

| Job | Schedule | Purpose |
|---|---|---|
| `schedules.generate` | every 15 min + startup | AUTO recurring/planned occurrence generation |
| `schedules.remind` | every 15 min | Reminders and overdue notices |
| `alerts.evaluate` | on demand (debounced) + hourly sweep | Alert rules |
| `insights.detect` | daily 03:00 server time per user batch + after transaction changes (debounced 5 min) | Anomaly suggestions |
| `rates.retryMissing` | daily | Retry missing base conversions (≤ 30 days old) |
| `push.send` | on demand | Web Push delivery with retry and endpoint cleanup on 404/410 |
| `storage.purgeDeleted` | hourly | Physically delete storage objects whose grace period has passed |
| `storage.orphanSweep` | daily | Remove stale PENDING uploads and orphan objects |
| `sync.purgeTombstones` | daily | Tombstone retention + idempotency record expiry |
| `sessions.purge` | daily | Remove expired or revoked sessions and personal API tokens after retention |
| `backups.run` | admin-configured cron | Automatic backups and retention cleanup |
| `exports.build` | on demand | Generate user export files |
| `user.baseCurrencyChange` | on demand | Recompute snapshots |

Each job handler is idempotent and processes users in small batches. Job failures are logged and visible in admin system status (last run, last error).

## 7. Module catalogue

See [overview.md](overview.md#module-map). Every module exposes in its `index.ts`: its router, service interface, command registrations, sync adapter (if synced), OpenAPI registrations, and job registrations.

## 8. Error handling

- Domain errors are thrown as `AppError(code, status, details)`. The central error middleware maps `ZodError` → 422 problem, Prisma `P2002` (unique) → 409 with a mapped code, `P2025` → 404, and anything unknown → 500 with `requestId` (logged with stack).
- Express 5 propagates rejected promises from async handlers automatically.

## 9. Configuration access

`config` (env, immutable at runtime) and `settings` (DB `app_settings`, admin-editable, cached) are separate injected objects. See [configuration.md](../infrastructure/configuration.md).

## 10. Static frontend hosting

- `express.static(<webDist>, { index: false, immutable caching for /assets/* hashed files (1 year), no-cache for index.html, sw.js, manifest })`.
- SPA fallback: `GET` requests not starting with `/api/` and accepting `text/html` → `index.html`.
- `/api/*` unknown routes → 404 problem JSON (never the SPA).
- Compression is left to the reverse proxy by default. Optional `compression` middleware via `HTTP_COMPRESSION=true`.

## 11. Testability

- `createApp(deps)` builds the Express app with injected dependencies (prisma, storage, clock, rate provider, mailer, push). Tests use a real Postgres and fakes for external services.
- `Clock` is injected everywhere (no direct `new Date()` in services/domain), which enables deterministic recurrence and job tests.
