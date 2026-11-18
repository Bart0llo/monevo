# API Design

**[Accepted]** REST + `/api/v1` + OpenAPI. **[Proposed]** conventions. See [ADR-0004](../decisions/ADR-0004-rest-api-versioning-and-contracts.md). Covers R-API-01..03 and R-GEN-03.

## 1. Principles

- The API is a **product**, not an internal detail of the web app. The web app, a future Android app, and scripts use the same endpoints.
- Contracts are defined once as **Zod schemas in `@monevo/contracts`**. They provide runtime validation, TS types (client and server), and the OpenAPI 3.1 spec.
- **DTOs ≠ Prisma models.** Every module has explicit mappers. Internal columns (`tokenHash`, `storageKey`, `passwordHash`, `_internal` flags) never leak.
- Resource-oriented URLs, JSON bodies, standard HTTP semantics.

## 2. Base paths

| Path | Purpose |
|---|---|
| `/api/v1/*` | REST API |
| `/api/v1/openapi.json` | OpenAPI 3.1 document (public, no auth) |
| `/api/v1/docs` | Swagger UI (can be disabled with `API_DOCS_ENABLED=false`) |
| `/api/v1/realtime` | Socket.IO endpoint (`path` option) |
| `/api/v1/health`, `/api/v1/health/ready` | Liveness and readiness (public, minimal output) |
| `/*` | SPA static files + `index.html` fallback (non-`/api` GET requests that accept HTML) |

## 3. Conventions

| Aspect | Convention |
|---|---|
| Naming | Plural kebab-case resources (`/scheduled-transactions`), camelCase JSON fields. |
| IDs | UUID strings (UUIDv7 for entities). Clients may supply IDs on create (`PUT /transactions/{id}` = create-or-idempotent-replay, or `POST` with an `id` field) to support offline-generated IDs. |
| Money | Decimal **strings** (`"amount": "123.45"`) plus a separate `currency` field. Never numbers. |
| Dates | `LocalDate` = `"YYYY-MM-DD"`. Instants = RFC 3339 UTC (`"2026-11-18T10:00:00.000Z"`). Field names: `…On` for LocalDate, `…At` for instants. |
| Enums | `UPPER_SNAKE` strings. |
| Nulls | Optional fields are omitted or null consistently per schema. Updates use `PATCH` with partial bodies, where `null` clears a field. |
| Versioning | `version` integer on mutable resources. `PATCH`/`DELETE` accept `If-Match: "<version>"` (or `version` in the body). A mismatch returns `409 VERSION_CONFLICT` with the current resource. Web clients use sync push instead. |
| Timestamps | `createdAt`, `updatedAt` on all mutable resources. |

## 4. Error format

RFC 9457 **Problem Details** (`application/problem+json`) with stable machine codes:

```json
{
  "type": "https://monevo.app/problems/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "code": "VALIDATION_FAILED",
  "detail": "One or more fields are invalid.",
  "requestId": "01JD…",
  "errors": [
    { "path": ["postings", 1, "amount"], "code": "AMOUNT_PRECISION", "message": "Too many decimal places for JPY", "params": { "max": 0 } }
  ]
}
```
- `code` values come from the `ErrorCode` enum in `@monevo/contracts`. The frontend translates `code`/`errors[].code` via i18n keys (`errors.<CODE>`). `title`/`message` are English fallbacks for developers and integrators.
- Status mapping: 400 malformed, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`/`CSRF_INVALID`/`REAUTH_REQUIRED`, 404 `NOT_FOUND` (also for foreign IDs), 409 `VERSION_CONFLICT`/`ID_CONFLICT`/`IDEMPOTENCY_KEY_REUSED`/`SETTING_LOCKED_BY_ENV` ([configuration.md](../infrastructure/configuration.md)), 410 `SYNC_RESYNC_REQUIRED`, 413 `PAYLOAD_TOO_LARGE`/`QUOTA_EXCEEDED`, 415, 422 validation and domain-rule violations (`ACCOUNT_ARCHIVED`, `CATEGORY_TYPE_MISMATCH`, …), 429 `RATE_LIMITED`, 503 `MAINTENANCE` (instance) / `MAINTENANCE_USER` (per-user base currency change), 500 `INTERNAL` (no stack traces).

## 5. Pagination, filtering, sorting

- **Cursor pagination** for large or append-heavy collections (transactions, history, notifications): `?limit=50&cursor=<opaque>` → `{ items, nextCursor }`. The cursor encodes the sort key + ID (base64url JSON, signed or validated). `limit` defaults to 50, max 200.
- **Offset pagination** is allowed for small admin lists (`?page=&pageSize=`).
- Small collections (accounts, categories, budgets, goals, templates) return all items without pagination (bounded per user, max 1000 enforced).
- **Filtering:** explicit query params per resource, defined in the contract. Example for transactions: `from`, `to`, `accountId` (repeatable), `categoryId` (repeatable, `includeSubcategories=true` default), `type` (repeatable), `amountMin`, `amountMax`, `amountBasis=ACCOUNT|BASE`, `q` (description contains).
- **Sorting:** `sort=-occurredOn,amount` (comma-separated, `-` = descending), with an allowlist per resource. The default for transactions is `-occurredOn,-createdAt`.

## 6. Idempotency

- Sync push: per-mutation `mutationId` (see [offline-and-synchronization.md](offline-and-synchronization.md#7-push-protocol)).
- REST `POST` that creates or acts: optional `Idempotency-Key: <uuid>` header (recommended for native clients). Stored in `idempotency_records` (user-scoped, 30 days). A replay returns the original status and body. The same key with a different body → `409 IDEMPOTENCY_KEY_REUSED`.
- Client-supplied entity IDs make creates naturally idempotent too.
- `PUT`/`DELETE` are idempotent by semantics.

## 7. Authentication

- Cookie session (web) or `Authorization: Bearer <session token>` (native, scripts). See [authentication.md](authentication.md).
- CSRF header on cookie-authenticated unsafe methods.
- OpenAPI declares both security schemes (`cookieAuth`, `bearerAuth`).

## 8. Endpoint map (v1, indicative)

| Area | Endpoints |
|---|---|
| Auth | `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/session`, `/auth/password-reset/*`, `/auth/email/verify`, `/auth/oidc/start`, `/auth/oidc/callback`, `/auth/config` |
| Me | `/me`, `/me/settings`, `/me/email-change`, `/me/password`, `/me/sessions[/:id]`, `/me/identities[/:id]`, `/me/storage`, `/me/push-subscriptions[/:id]`, `/me/base-currency-change` |
| Currencies | `/currencies`, `/exchange-rates` (GET query by pair/date; POST manual), `/exchange-rates/resolve` (on-demand fetch), `/exchange-rates/missing` + `/exchange-rates/missing/resolve` |
| Accounts | `/accounts[/:id]`, `/accounts/:id/archive`, `/accounts/:id/unarchive`, `/accounts/balances?asOf=` |
| Categories | `/categories[/:id]`, `/categories/reorder`, `/categories/:id/delete` (POST with reassignment body) |
| Transactions | `/transactions[/:id]`, `/transactions/:id/history`, `/transaction-history`, `/transfers` (convenience create; returns a transaction), `/adjustments` |
| Templates, custom fields | `/transaction-templates[/:id]`, `/custom-fields[/:id]` |
| Attachments | `/transactions/:id/attachments` (POST multipart, GET list), `/attachments/:id` (DELETE), `/attachments/:id/content` (GET, `?disposition=inline` for previewable types) |
| Scheduling | `/scheduled-transactions[/:id]`, `/scheduled-transactions/:id/amount-changes`, `/scheduled-transactions/:id/occurrences?from&to`, `/scheduled-transactions/:id/occurrences/:date/(confirm|skip|unskip|modify)`, `/upcoming` |
| Calendar, forecast | `/calendar?from&to`, `/forecast?horizon&scenario&accountId` |
| Budgets | `/budgets[/:id]`, `/budgets/:id/periods?from&to`, `/budgets/summary?date` |
| Savings | `/savings-pots[/:id]`, `/savings-pots/:id/allocations`, `/savings-goals[/:id]`, `/savings-goals/:id/contributions` |
| Alerts, notifications, insights | `/alert-rules[/:id]`, `/notifications` (+ `/read`, `/read-all`), `/notification-preferences`, `/insights` (+ `/:id/dismiss`) |
| Reports | `/reports/income-expense`, `/reports/by-category`, `/reports/category-trend`, `/reports/compare-months`, `/reports/compare-years`, `/reports/savings`, `/reports/net-worth`, `/reports/recurring`, `/report-definitions[/:id]`, `?format=csv` on report endpoints |
| Dashboard | `/dashboard` (GET/PUT layout) |
| Sync | `/sync/pull`, `/sync/push` |
| Export/import | `/exports` (POST create, GET status/download), `/imports` (POST upload → validate), `/imports/:id/apply` |
| Admin | `/admin/users[/:id]`, `/admin/users/:id/(activate|deactivate|password-reset-link)`, `/admin/settings`, `/admin/oidc`, `/admin/storage`, `/admin/backups[/:id]` (+ `/download`, `/restore`), `/admin/system` |

## 9. Versioning policy

- The major version is in the path: `/api/v1`. **Additive** changes (new endpoints, new optional fields, new enum values documented as extensible) are allowed within v1. Clients must ignore unknown fields.
- **Breaking** changes (removing or renaming fields, changing semantics or types, tightening validation of existing fields) require `/api/v2`. v1 is then kept for at least 6 months or two minor releases, with `Deprecation` and `Sunset` headers on deprecated endpoints.
- The OpenAPI document has `info.version` = the app semver. Contract changes are noted in `CHANGELOG.md`.
- A CI check diffs the generated OpenAPI against the committed snapshot (`apps/server/openapi.snapshot.json`), so contract changes are always reviewed deliberately. An `oasdiff` breaking-change check is **[Proposed]**.
- Enum extensibility: enums that may grow (notification types, widget types, insight types) are documented as "open". Clients must handle unknown values gracefully.

## 10. Realtime

Socket.IO at `/api/v1/realtime`, events defined in `@monevo/contracts/realtime`. Realtime messages are **hints**. All state is fetched through REST or sync. See [offline-and-synchronization.md](offline-and-synchronization.md#11-realtime-socketio).

## 11. Android readiness checklist

- Bearer session tokens (no cookie dependency). Optional `clientType: NATIVE` login.
- No HTML-only flows except OIDC (native apps use system browser + app-link redirect. A native redirect URI allowlist is **[Deferred]**, but the callback design separates "web callback" from future "native callback").
- Sync protocol is platform-neutral (JSON, UUIDv7, decimal strings).
- Error codes are machine-readable and translations are client-side.
- No server-rendered UI assumptions in responses (no HTML, no pre-formatted amounts).
