# Personal API Tokens

**[Accepted]** scope (R-TOK-01..09, [requirements.md](../product/requirements.md#personal-api-tokens)). **[Proposed]** design, see [ADR-0017](../decisions/ADR-0017-personal-api-tokens.md); the permission catalogue and lifecycle defaults are confirmed with [OQ-22](../planning/open-questions.md#oq-22-api-token-permission-catalogue-and-lifecycle) before Stage 2. This is the canonical document for the token format, the permission catalogue, and token-authenticated request handling.

A personal API token lets a user connect an external integration (a script, a home automation system, a spreadsheet) to their own data through the versioned REST API. It is an **additional** credential: it does not replace local login, OIDC, or sessions ([authentication.md](authentication.md)), and it never opens an interactive session.

## 1. Token model

```
ApiToken: id (UUIDv7), userId, name, tokenHash (SHA-256 of the full token, unique), displayPrefix,
          permissions (text[]), expiresAt?, lastUsedAt?, lastUsedIp?,
          createdAt, revokedAt?, revokedReason?
```

Columns are listed in [data-model.md](../data/data-model.md#api_tokens). The table is owned (`userId`), not synced, and online-only in the UI.

- **Exactly one owner.** A token belongs to the user who created it. There is no sharing and no transfer.
- **Status** is derived, never stored: `REVOKED` if `revokedAt` is set, else `EXPIRED` if `expiresAt ≤ now`, else `ACTIVE`.
- **Name:** 1–100 characters after trimming, not required to be unique. The user creates one token per integration so each can be revoked separately.
- **Limit:** at most 50 active tokens per user (`422 API_TOKEN_LIMIT_REACHED`).
- **Permissions are fixed at creation.** Only the name can be changed later. To change permissions, the user creates a new token and revokes the old one, so a token's power never grows silently.
- **Retention:** revoked and expired tokens stay visible in the list for 90 days, then the daily `sessions.purge` job deletes them ([backend-architecture.md](backend-architecture.md#6-background-jobs-pg-boss)). Audit records keep a copy of the token name ([§6](#6-audit-and-logging)), so purging does not lose history.

## 2. Token format and storage

- **Generation:** 32 bytes from `crypto.randomBytes` (256 bits, CSPRNG), encoded as base64url without padding (43 characters).
- **Format:** `mnv_pat_<43 base64url characters>`, for example `mnv_pat_Xq3v…` (51 characters in total). The fixed prefix lets the server route the credential without a database lookup and lets secret scanners and users recognise a leaked Monevo token.
- **Storage:** only `SHA-256(full token)` is stored (`tokenHash`, unique index). The full token is returned **once**, in the creation response, and cannot be retrieved again. `displayPrefix` (`mnv_pat_` plus the first 6 random characters) is stored so the user can tell tokens apart in the list.
- **Why SHA-256 and not argon2:** the token is 256 bits of random data, not a human-chosen password, so brute-forcing the hash is infeasible and a slow hash would only make every API request expensive. This is the standard practice for high-entropy bearer tokens and the same scheme as session tokens ([authentication.md](authentication.md#4-sessions)). No custom cryptography is involved (R-SEC-03).
- **Never exposed:** `tokenHash` is never returned by any endpoint, never logged, and never included in user exports. API responses map tokens through an explicit DTO ([api-design.md](api-design.md#1-principles)).

## 3. Authentication

Integrations send the token in the standard header:

```
Authorization: Bearer mnv_pat_Xq3v…
```

The request authentication pipeline ([authentication.md](authentication.md#6-request-authentication-pipeline)) branches on the prefix:

```
Bearer value starts with "mnv_pat_" → hash → SELECT api_token JOIN user WHERE tokenHash = $1
  → not found or malformed → 401 UNAUTHENTICATED
  → revoked → 401 API_TOKEN_REVOKED;  expired → 401 API_TOKEN_EXPIRED
  → user not ACTIVE → 401 UNAUTHENTICATED
  → route not available to tokens → 403 API_TOKEN_NOT_ALLOWED
  → token lacks a required permission → 403 API_TOKEN_PERMISSION_DENIED (params.required)
  → touch lastUsedAt / lastUsedIp (throttled, 5 min)
  → req.auth = { userId, role: USER, credential: { type: API_TOKEN, apiTokenId, tokenName, permissions } }
  → route
```

- **Revocation is immediate:** every request looks the token up by hash, as for sessions, so a revoked token fails on the very next request.
- **CSRF:** not required (the token is not an ambient credential; [authentication.md](authentication.md#5-csrf)).
- **Role:** a token-authenticated request always has the effective role `USER`, even if the owner is an admin. Admin routes are never reachable with a token.
- **Permission checks run before any resource lookup**, so a missing permission never reveals whether an ID exists. After the permission check, the normal ownership rules apply: foreign IDs return `404 NOT_FOUND` ([authorization-and-data-isolation.md](authorization-and-data-isolation.md)).
- **Never exceeding the owner:** a token acts as its owner and can only do what the owner can do through the API, intersected with its permissions. Every ownership check, domain invariant, quota, per-user maintenance state (`503 MAINTENANCE_USER`), and rate limit applies unchanged.
- **Optimistic concurrency:** token-authenticated `PATCH` and `DELETE` on versioned resources must send `If-Match` (or `version` in the body); otherwise `428 PRECONDITION_REQUIRED`. Integrations therefore cannot silently overwrite edits made on another device (R-OFF-06; [api-design.md](api-design.md#3-conventions)).
- **Idempotency:** `Idempotency-Key` works as for any client and is recommended for creates ([api-design.md](api-design.md#6-idempotency)).
- **Realtime:** tokens cannot open Socket.IO connections in v1. Integrations poll REST endpoints.

## 4. Permission catalogue

Permissions are strings `<resource>:<operation>`. The user selects them for each token from this predefined catalogue; free-form permissions are rejected (`422`). Operations are `read`, `create`, `update`, and `delete`, and each resource lists only the operations it actually supports. Every operation is granted independently: no operation implies another (`delete` does not imply `read`), although write responses still return the created or changed resource. Domain actions map to the closest operation: archive, unarchive, reorder, enable, disable, mark-read, and dismiss are `update`. The catalogue is defined once in `@monevo/contracts` and shared by the server (enforcement, OpenAPI) and the web app (token creation form). New permissions are additive within `/api/v1`.

| Resource | Operations | Grants | Also requires |
|---|---|---|---|
| `profile` | `read` | Profile and settings: display name, locale, time zone, base currency, week start (`GET /me`, `GET /me/settings`). No email address. | |
| `currencies` | `read` | Currencies and exchange rates (`GET /currencies`, `GET /exchange-rates`, `GET /exchange-rates/missing`). | |
| `exchange-rates` | `create` | Enter manual rates, trigger on-demand provider fetches (`POST /exchange-rates`, `/exchange-rates/resolve`, `/exchange-rates/missing/resolve`). | |
| `accounts` | `read` | Accounts and balances (`GET /accounts[/:id]`, `/accounts/balances`). | |
| | `create` | Create accounts. | |
| | `update` | Edit, archive, unarchive accounts. | |
| | `delete` | Delete unused accounts. | |
| `categories` | `read` | Categories and subcategories. | |
| | `create` | Create categories. | |
| | `update` | Edit and reorder categories. | |
| | `delete` | Delete categories. | `transactions:update` (deleting reassigns or uncategorizes transactions) |
| `transactions` | `read` | Transactions, transfers, adjustments, and their change history. | |
| | `create` | Create transactions, transfers, adjustments. | `savings-pots:update` to pay from a pot |
| | `update` | Edit transactions. | |
| | `delete` | Permanently delete transactions. | |
| `transaction-templates` | `read`, `create`, `update`, `delete` | Transaction templates. | |
| `custom-fields` | `read` | Custom field definitions (needed to interpret `customFields` values). | |
| | `create` | Create definitions. | |
| | `update` | Edit and archive definitions. | |
| `attachments` | `read` | List and download attachments. | |
| | `create` | Upload attachments (counts against the user's quota). | |
| | `delete` | Delete attachments. | |
| `scheduled-transactions` | `read` | Recurring and planned transactions, occurrences, `GET /upcoming`. | |
| | `create` | Create schedules. | |
| | `update` | Edit schedules, amount changes, skip and unskip occurrences, confirm or modify an occurrence. | `transactions:create` to confirm or modify an occurrence (creates a transaction) |
| | `delete` | Delete schedules. | |
| `calendar` | `read` | `GET /calendar`. | |
| `forecast` | `read` | `GET /forecast`. | |
| `budgets` | `read` | Budgets, periods, summary. | |
| | `create`, `update` | Create and edit budgets. | |
| | `delete` | Delete budgets (including their threshold alert rules). | |
| `savings-pots` | `read` | Pots and allocation history. | |
| | `create` | Create pots. | |
| | `update` | Edit and archive pots; allocate and release money (allocations change the pot balance). | |
| | `delete` | Delete pots. | |
| `savings-goals` | `read` | Goals, progress, contribution history. | |
| | `create`, `update`, `delete` | Create, edit, delete goals. | |
| `alert-rules` | `read` | Alert rules. | |
| | `create`, `update`, `delete` | Create; edit, enable, disable; delete alert rules. | |
| `notifications` | `read` | Notifications and insights. | |
| | `update` | Mark notifications read, dismiss insights. | |
| `reports` | `read` | Report endpoints (including `?format=csv`) and saved report definitions. | |
| | `create`, `update`, `delete` | Create, edit, delete saved report definitions. | |

A row listing several operations defines one permission per operation (`budgets:create` and `budgets:update` are separate). The exact routes of each permission are declared on the route with `x-monevo-permissions` ([§7](#7-api-documentation)) when the stage that adds the route is built ([implementation-stages.md](../planning/implementation-stages.md)).

**"Also requires"** applies the general rule: an operation that creates, changes, or deletes records of another resource type needs that resource's permission too, so a token cannot reach transactions indirectly. Removing a feature's own dependent configuration (a budget's threshold alert rules) needs no extra permission.

### Never available to tokens

These routes reject token authentication with `403 API_TOKEN_NOT_ALLOWED`, whatever permissions the token has:

| Area | Reason |
|---|---|
| `/auth/*` (login, logout, session, registration, password reset, OIDC) | Tokens never create or represent interactive sessions. |
| `/me` writes, `/me/email-change`, `/me/password`, `/me/identities`, `/me/oidc/link`, `/me/base-currency-change` | Account, credential, and identity management stay interactive. |
| `/me/sessions` | Session management (R-TOK-07). |
| `/me/api-tokens` | A token cannot create, list, or revoke tokens, so a leaked token cannot entrench itself. |
| `/me/push-subscriptions`, `/notification-preferences`, `/me/storage` | Device- and UI-bound settings. |
| `/admin/*` | Administrative functionality (R-TOK-07, R-ADM-05). |
| `/sync/*`, Socket.IO | The offline sync protocol belongs to session-based clients ([offline-and-synchronization.md](offline-and-synchronization.md)). |
| `/dashboard` | UI layout, not data. |
| `/exports`, `/imports` | Whole-account bulk transfer stays interactive; integrations use the read permissions instead. |

**Public routes** need no credential at all: `/health`, `/health/ready`, `/openapi.json`, `/docs`, and `/auth/config`. They declare `security: []` in OpenAPI and no permission. A token sent to them is ignored.

## 5. Token management

Available in **Settings → API tokens** ([features.md](../product/features.md#settings)) and through the API, **only with a session** (cookie or native bearer session):

| Endpoint | Behaviour |
|---|---|
| `GET /me/api-tokens` | All of the user's tokens (active, and revoked or expired within 90 days): `id`, `name`, `displayPrefix`, `permissions`, `status`, `createdAt`, `expiresAt`, `lastUsedAt`, `lastUsedIp` (hidden when `privacy.showSessionIp` is off), `revokedAt`. Never the hash or the token. |
| `POST /me/api-tokens` | Body `{ name, permissions, expiresAt? }`. Requires a recent authentication (≤ 15 min, otherwise `403 REAUTH_REQUIRED`), like other credential changes. Unknown permissions or a past `expiresAt` → `422`. Response `201 { token: <metadata>, secret: "mnv_pat_…" }`: the only time the full token is returned. |
| `PATCH /me/api-tokens/:id` | Rename only (`name`). |
| `DELETE /me/api-tokens/:id` | Revoke (`revokedAt = now`, `revokedReason = USER_REVOKED`). Idempotent, `204`. |

UI rules:
- The creation form groups the catalogue by resource with one toggle per supported operation (read, create, update, delete), no permission selected by default, shows the "also requires" hints, and offers expiration presets (30, 90, 365 days, a custom date, or none). The default preset is 90 days; choosing "no expiration" shows a warning. A custom date means the end of that day in the user's time zone.
- After creation, the secret is shown once with a copy button and the message that it cannot be shown again.
- Revoking asks for confirmation that names the token ([user-experience.md](../product/user-experience.md#interaction-rules)).

### Lifecycle events

| Event | Effect on tokens |
|---|---|
| User revokes a token | Revoked immediately (`USER_REVOKED`). |
| Expiration reached | Rejected from `expiresAt` on (`401 API_TOKEN_EXPIRED`). |
| Admin deactivates the user | All tokens revoked (`DEACTIVATED`), together with the sessions ([administration.md](administration.md#users-r-adm-01-r-auth-04)). Reactivation does not restore them. |
| Backup restore | All tokens revoked (`RESTORE`), because a restored database could otherwise bring back tokens revoked after the backup was taken ([backups-and-restoration.md](../infrastructure/backups-and-restoration.md#restore)). |
| Password change or reset | Tokens stay valid (they are independent credentials). After a password reset, the UI prompts the user to review their active tokens. |

## 6. Audit and logging

- **Transaction history:** a change made with a token is recorded with `actorType = USER`, `credentialType = API_TOKEN`, `apiTokenId`, and `apiTokenName` copied at write time; `sessionId` is null ([financial-domain-model.md](financial-domain-model.md#transaction-history-audit)). The history view shows "via API token *name*".
- **Token records** keep their own lifecycle metadata: `createdAt`, `lastUsedAt`, `lastUsedIp`, `revokedAt`, `revokedReason`.
- **Logs:** token-authenticated requests carry `apiTokenId` in the request log context; token creation and revocation are logged as `event: api_token.created` / `api_token.revoked` with user and token IDs only. The token itself and its hash are never logged ([monitoring-and-logging.md](../infrastructure/monitoring-and-logging.md)).
- Changes made with a token go through the same command path as every other write, so they produce change-log entries and reach the user's other devices through normal sync ([backend-architecture.md](backend-architecture.md#3-command-pattern-single-write-path)).

## 7. API documentation

- OpenAPI declares a third security scheme, `apiToken` (`type: http`, `scheme: bearer`, `bearerFormat: mnv_pat`), next to `cookieAuth` and `bearerAuth` ([api-design.md](api-design.md#7-authentication)).
- Each token-enabled operation lists `apiToken` in its `security` and declares its required permissions in an `x-monevo-permissions` extension, which also appears in the operation description. Operations from [§4](#never-available-to-tokens) do not list `apiToken`.
- `info.description` contains an "Authenticating integrations" section: create a token in Settings → API tokens, send `Authorization: Bearer mnv_pat_…`, handle `401`/`403` codes, send `If-Match` on updates and `Idempotency-Key` on creates, respect `429 Retry-After`.
- Swagger UI's "Authorize" dialog accepts a token, so integrators can try endpoints with their own data.

## 8. Testing

- Unit: token generation format and entropy source, hash lookup, status derivation, permission resolution including "also requires".
- Integration: create → use → revoke → next request `401 API_TOKEN_REVOKED`; expiry with an injected clock; the secret is returned only by the create response; no endpoint response or log line contains a `tokenHash` or secret (schema snapshot + log capture).
- **Permission suite:** iterates the OpenAPI registry. Every operation either declares `x-monevo-permissions` or is in the never-available list (a route without either fails the suite). For every token-enabled operation, a token without the required permissions gets `403 API_TOKEN_PERMISSION_DENIED`; for every never-available route, a token with all permissions gets `403 API_TOKEN_NOT_ALLOWED`.
- **Isolation suite with tokens:** the generic isolation suite also runs with user B authenticated by a full-permission token ([testing-strategy.md](../development/testing-strategy.md)).
- Lifecycle: deactivation and restore revoke tokens; an admin's token gets `403` on admin routes; token `PATCH` without `If-Match` → `428`.
- Audit: a token-made create, update, and delete appear in history with `credentialType = API_TOKEN` and the token name.
