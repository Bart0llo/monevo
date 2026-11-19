# Administration

**[Accepted]** scope from R-ADM-01..06. **[Proposed]** design; the Users section, the identity provider status, access control, and the identity CLI commands are built in Stage 2. Authentication is OIDC-only ([ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md)): users, passwords and MFA are managed in Account Center, not here. The admin panel is for **operating the instance**, not for viewing anyone's finances (R-ADM-05, [authorization-and-data-isolation.md](authorization-and-data-isolation.md#1-model)).

## 1. Boundaries

| Admins can | Admins cannot |
|---|---|
| List users with operational data (email as last reported by the IdP, display name, role, status, created, last login, session count, storage used and quota) | See any user's accounts, transactions, categories, budgets, goals, pots, schedules, attachments, history, notifications, dashboard, exports, or API tokens |
| Activate and deactivate users, change roles (unless roles are managed by the IdP group) | Impersonate a user or log in as them |
| See the identity provider status (read-only) | Create users, set passwords, or change the identity provider (done in Account Center and the environment) |
| Configure quotas, upload limits, branding, rate provider, backups | See per-user financial counts or amounts |
| See system status, versions, job status, storage status | Update the application from the UI (out of scope) |
| Run, download, and restore instance backups | Browse a backup's contents in the UI |

Backups are the one place where an admin can obtain all data (by downloading an archive). This is accepted as operator trust, with optional backup encryption; see [OQ-04](../planning/open-questions.md#oq-04-admin-backup-access-vs-financial-privacy).

Out of scope (R-ADM, [requirements.md](../product/requirements.md#out-of-scope)): admin analytics, an admin audit-log dashboard, a log management platform, self-update.

## 2. Access control

- All endpoints live under `/api/v1/admin/*` behind `requireRole('ADMIN')`.
- **Sensitive actions** require a recent authentication (≤ 15 min, otherwise `403 REAUTH_REQUIRED`; the UI offers "Confirm identity", a re-sign-in at the identity provider, [authentication.md](authentication.md#recent-authentication)): deactivate a user, change a role, download a backup, restore a backup, change the storage quota defaults.
- Admins cannot deactivate themselves, and the last active admin cannot be deactivated or demoted (`409 LAST_ADMIN`, [authentication.md](authentication.md#7-admin-bootstrap)).
- Admin actions are logged as structured `info` log events (`event: admin.action`, actor user ID, action, target user ID, no financial data). There is no admin audit dashboard; the logs are the record ([monitoring-and-logging.md](../infrastructure/monitoring-and-logging.md)).
- Admin data is never synced to IndexedDB, and the admin UI is online-only.

## 3. Sections

The admin UI has five tabs: Users, Settings, Storage, Backups, System ([user-experience.md](../product/user-experience.md#key-screens)).

### Users (R-ADM-01, R-AUTH-04)

`GET /admin/users?cursor&limit&q&status` (cursor pagination), `GET /admin/users/:id`, `PATCH /admin/users/:id` (role in Stage 2; quota override from Stage 6), `POST /admin/users/:id/activate|deactivate`.

- **Role:** `PATCH` with `{ role }` (recent authentication). When `OIDC_ADMIN_GROUP` is set, roles follow the IdP group and the change is refused with `409 ROLE_MANAGED_BY_IDP` ([authentication.md](authentication.md#7-admin-bootstrap)).

- **Deactivate:** sets `status = DEACTIVATED`, revokes all sessions (sockets disconnected with `session:revoked`) and all personal API tokens ([api-tokens.md](api-tokens.md#lifecycle-events)), deletes push subscriptions, and pauses jobs for the user (AUTO generation, reminders, alerts, insights skip deactivated users). Data is kept unchanged. **Activate** reverses it; AUTO schedules resume from the current date (no burst of back-filled occurrences: missed occurrences become overdue for confirmation).
- Deactivation does not touch the account in the IdP; disable the user in Account Center as well if they should lose access to other applications. A deactivated user who signs in at the IdP gets no Monevo session (`account_deactivated`).
- **Create user:** not offered. Users are provisioned automatically on their first sign-in; who may sign in is controlled in Account Center (allowed groups for the Monevo application).
- **Delete user:** **[Deferred]** (schema supports it by cascade; see [database-architecture.md](database-architecture.md#7-data-lifecycle)).
- **Issuer change:** identities are keyed by issuer, so pointing `OIDC_ISSUER` at a different IdP makes existing users unreachable (their next sign-in provisions new users). Changing the issuer is an operator migration, not a supported setting change.

### Identity provider (R-ADM-04)

`GET /admin/identity-provider` (read-only): provider name, issuer, client ID, client type (confidential or public), scopes, whether `OIDC_ADMIN_GROUP` is set and its name, whether discovery currently succeeds, and whether the IdP offers an end-session endpoint. The provider is configured only through environment variables ([configuration.md](../infrastructure/configuration.md#oidc)); there is no form.

### Settings (R-ADM-02, R-GEN-06)

`GET/PATCH /admin/settings`.

Runtime settings are stored in `app_settings` (one key per setting, JSONB value, validated by Zod, cached in memory and invalidated on change). **Environment variables take precedence**: a setting that is set by env is shown read-only with a "set by environment" badge. The full list and defaults are canonical in [configuration.md](../infrastructure/configuration.md#runtime-settings-app_settings).

| Group | Settings |
|---|---|
| Storage | default user quota, max upload size (≤ `MAX_UPLOAD_BYTES`) |
| Branding | instance name, logo (PNG/WebP ≤ 256 KB), accent color (contrast-checked against both themes) |
| Exchange rates | active provider (`frankfurter` / `nbp`) |
| Backups | see Backups |
| Privacy | show session IP addresses to users (default on) |

### Storage (R-ADM-03)

Driver status and totals from `/admin/storage` ([file-storage.md](file-storage.md#7-admin-view)), the default quota, and per-user overrides (edited in the Users tab). The driver itself is chosen by env (`STORAGE_DRIVER`) and cannot be switched from the UI.

### Backups (R-BAK-01)

`GET /admin/backups`, `POST /admin/backups` (run now), `GET /admin/backups/:id/download`, `POST /admin/backups/:id/restore`, `DELETE /admin/backups/:id`, `GET/PATCH /admin/settings` (backup schedule, retention, S3 target, encryption on/off). Status, last success, last failure with its error, and next scheduled run are shown. The procedure is canonical in [backups-and-restoration.md](../infrastructure/backups-and-restoration.md).

### System (R-ADM-02, R-ADM-06)

`GET /admin/system`:

```json
{
  "version": "1.0.0", "commit": "abc1234", "builtAt": "…", "uptimeSeconds": 86400, "nodeVersion": "v24.x",
  "database": { "status": "OK", "serverVersion": "17.x", "latestMigration": "20261118_add_x", "pendingMigrations": 0, "sizeBytes": 123456789 },
  "jobs": [ { "name": "schedules.generate", "lastRunAt": "…", "lastStatus": "COMPLETED", "lastError": null, "nextRunAt": "…" } ],
  "storage": { "driver": "local", "status": "OK" },
  "identityProvider": { "issuer": "https://ac.example.com", "discovery": "OK" },
  "rateProvider": { "id": "frankfurter", "lastSuccessAt": "…", "lastError": null },
  "push": { "vapidConfigured": true },
  "users": { "total": 4, "active": 3 },
  "maintenance": { "mode": "OFF" }
}
```

`database.status` is `OK`, or `WARN` when the server's major version is newer than the newest supported one ([postgresql.md](../infrastructure/postgresql.md#supported-versions)).

It also links to `/api/v1/docs` (if enabled) and shows the effective non-secret configuration (secrets as "set"/"not set"). There is no log viewer in the UI: logs go to stdout and are read with `docker compose logs` (R-ADM-06; see [monitoring-and-logging.md](../infrastructure/monitoring-and-logging.md)).

## 4. Maintenance mode

Used during restore and base-currency-wide operations:

- Instance-wide `MAINTENANCE` (restore): all API requests except `/health`, `/auth/session`, and `/admin/system` return `503 MAINTENANCE`, sockets receive `system:maintenance { mode: "ON" }`, and jobs are paused. The web app shows a full-screen notice and keeps the outbox (sync resumes afterwards; a restore forces a re-bootstrap because all sessions are invalidated).
- Per-user `MAINTENANCE_USER` (base currency change): only that user's financial writes are blocked ([backend-architecture.md](backend-architecture.md#4-transactions-and-locking)).

## 5. CLI

Operator commands for situations where the UI is unavailable (`docker compose exec app node dist/cli.js <command>`):

| Command | Purpose |
|---|---|
| `list-users` | Print id, display name, email, role, status, issuer and subject of every user (to find an id) |
| `set-role --user-id <uuid> --role ADMIN|USER` | Recover admin access; refused when `OIDC_ADMIN_GROUP` is set (change the group in Account Center instead) |
| `backup [--output <path>]` | Run a backup now |
| `restore <archive> [--yes]` | Disaster recovery restore ([backups-and-restoration.md](../infrastructure/backups-and-restoration.md)) |
| `maintenance on|off` | Toggle instance maintenance mode |
| `generate-key` | Print a new random `APP_ENCRYPTION_KEY` |

CLI commands log to stdout with the same redaction rules and never print secrets other than the requested key.

## 6. Testing

- Admin endpoint response schemas contain no financial fields (schema snapshot test).
- A non-admin gets 403 on every admin route (iterated from the OpenAPI registry); sensitive actions without recent auth get `REAUTH_REQUIRED`.
- Deactivation revokes sessions and API tokens and stops jobs for the user (integration test with an injected clock).
- Last-admin protection, no self-deactivation, `ROLE_MANAGED_BY_IDP` with `OIDC_ADMIN_GROUP` set.
