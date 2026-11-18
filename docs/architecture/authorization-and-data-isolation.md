# Authorization and Data Isolation

**[Accepted]**, see [ADR-0006](../decisions/ADR-0006-user-data-isolation.md). Covers R-SEC-01, R-ADM-05, R-GEN-04.

## 1. Model

There are exactly two authorization dimensions:

1. **Ownership:** every financial or user-owned record belongs to exactly one user, and only that user can read or write it. There is no sharing, delegation, or impersonation.
2. **Role:** `USER` or `ADMIN`. `ADMIN` unlocks `/api/v1/admin/*` endpoints, which handle operational data only.

**Admin ≠ data access.** No endpoint, including admin endpoints, returns another user's financial records (transactions, accounts, categories, budgets, goals, pots, schedules, attachments, history, notifications, dashboard, exports). Admin endpoints may return *operational* per-user data only: email, display name, role, status, created, last login, storage used and quota, session count. Aggregate counts (number of users, total storage) are fine. Per-user financial counts (for example "user X has 1 234 transactions") are **not** exposed.

> Operator note: anyone with shell or database access to the server (including via backups) can technically read all data. "Admin" here means the application role. Server-level trust is documented in [security.md](security.md#threat-model) and [OQ-04](../planning/open-questions.md#oq-04-admin-backup-access-vs-financial-privacy).

## 2. Enforcement layers

### Layer 1: identity from the session only
- `req.auth.userId` is set by the auth middleware from the session. Route handlers pass a `RequestContext { userId, role, sessionId, requestId }` to services.
- Request DTOs **never** contain `userId`. Contract schemas use `.strict()`, so an injected `userId` field is a validation error.

### Layer 2: user-scoped repositories
- Every repository method for owned entities takes `userId` as its first parameter and includes it in **every** `where` clause, including updates and deletes (`updateMany`/`deleteMany` with `{ id, userId }` and a check of the affected count, or `findFirst({ where: { id, userId } })` followed by an update by ID inside the same transaction).
- A missing or foreign ID → `404 NOT_FOUND` (never 403, so existence isn't leaked).
- Referenced IDs in payloads (accountId, categoryId, potId…) are loaded with the same `userId` scope before use.
- Raw SQL (reports) must take `userId` as a bound parameter, and each query file has an isolation test.
- Lint guard **[Proposed]**: a custom ESLint rule or code-review checklist item that flags `prisma.<ownedModel>.(findUnique|update|delete)` calls without `userId` in the arguments. Owned-model Prisma access is only allowed inside `*.repo.ts` files.

### Layer 3: database constraints
- `user_id UUID NOT NULL` on every owned table, with an FK to `users`.
- **Composite ownership foreign keys:** owned tables expose `UNIQUE (id, user_id)`, and children reference `(parent_id, user_id)`. Example: `postings (account_id, user_id) REFERENCES accounts (id, user_id)`. The database itself then rejects a posting that points at another user's account, even if application code has a bug. See [database-architecture.md](database-architecture.md#composite-ownership-foreign-keys).
- Indexes lead with `user_id` for owned tables (they double as an isolation-friendly access path).

### Layer 4: tests
- A generic **isolation test suite** (Stage 2 onward) creates users A and B with data. For every registered route that takes an entity ID, it calls the route as B with A's IDs and asserts 404 with no data in the body. For list endpoints, it asserts that no A rows appear. The suite iterates over the OpenAPI registry, so new routes are automatically included (a route must be explicitly exempted with a reason).
- Sync: B's pull never returns A's changes. B's push with A's entity IDs → `NOT_FOUND`/`ID_CONFLICT`.
- Attachments: B cannot download A's attachment by ID.
- Admin: an admin calling user-data endpoints sees only their own data. Admin endpoints contain no financial fields (schema snapshot test).

### Postgres row-level security
**[Deferred]**, a candidate for defense in depth. With Prisma it requires setting `app.user_id` per transaction (`SET LOCAL` inside interactive transactions), which complicates connection handling and every query path. Composite FKs plus scoped repositories plus automated isolation tests give strong guarantees at lower complexity. This will be revisited if a second data-access path (for example a reporting connection) is added.

## 3. Role checks

- Middleware `requireRole('ADMIN')` on the admin router. Sensitive admin actions (deactivate user, change OIDC, restore backup, generate reset link) also require a recent authentication (≤ 15 min, otherwise `REAUTH_REQUIRED`).
- Role changes take effect on the next request (role is read from the DB with the session, not cached in a token).

## 4. Cross-entity rules (enforced in services)

| Rule | Reason |
|---|---|
| Transfer source and destination owned by the same user | Implied by composite FKs. |
| Category type matches transaction type | Domain invariant INV-4. |
| Pot's account owned and active | Composite FK + service check. |
| Goal's pot or account owned | Composite FK. |
| Budget categories and accounts owned | Join table with composite FKs. |
| Attachment's transaction owned | Composite FK. |
| Custom field values reference the user's own definitions | Service validation of JSONB keys. |
| Template/schedule references | Composite FKs, nullable. |

## 5. Shared reference data (not owned)

`currencies` and provider `exchange_rates` (`user_id IS NULL`) are readable by all authenticated users and writable only by the system. Manual exchange rates are owned (`user_id` set). `app_settings` are readable through specific public or admin endpoints only.
