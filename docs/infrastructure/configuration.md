# Configuration

**[Proposed]** design. This document is the **canonical list** of environment variables and runtime settings ([docs/README.md](../README.md#canonical-locations)). Other documents name variables and link here for defaults.

## 1. Two configuration layers

| Layer | Source | Changed by | Read by the code as |
|---|---|---|---|
| **Environment** | `process.env` and `*_FILE` secrets, read once at startup | The operator (`.env` / compose file), takes effect on restart | `config` (immutable, Zod-validated) |
| **Runtime settings** | `app_settings` table | Admins in the UI (Settings tab), takes effect immediately | `settings` (cached in memory, invalidated on change) |

Rules:

1. **Startup validation.** The server validates every variable with a Zod schema at boot and exits with a readable list of all problems (never a stack trace) if anything is invalid ([backend-architecture.md](../architecture/backend-architecture.md#1-process-layout)).
2. **Environment wins.** When a variable that maps to a runtime setting is set explicitly, the setting is locked: the admin UI shows it read-only with a "set by environment" badge, and the API rejects changes with `409 SETTING_LOCKED_BY_ENV`.
3. **`*_FILE` variants.** Every variable marked *secret* below also accepts `<NAME>_FILE`, a path to a file containing the value (Docker secrets). Setting both is a startup error. Trailing newlines are trimmed.
4. **Secrets never leave the process.** They are redacted in logs, shown as "set"/"not set" in admin status, and never included in exports ([security.md](../architecture/security.md#secrets)).
5. **Sizes** accept a plain byte count or a suffix (`KB`, `MB`, `GB` = powers of 1000; `KiB`, `MiB`, `GiB` = powers of 1024). **Booleans** accept `true`/`false` only.

## 2. Environment variables

### Core

| Variable | Default | Required | Description |
|---|---|---|---|
| `APP_URL` | none | **yes** | Public base URL, e.g. `https://money.example.com`. Used for OIDC redirect URIs, links in emails and push, cookie security decisions, and the PWA manifest scope. Must be `https://` unless `INSECURE_COOKIES=true`. |
| `PORT` | `3000` | no | HTTP port inside the container. |
| `NODE_ENV` | `production` (image) | no | Set by the image. Development tooling sets `development`/`test`. |
| `TZ` | `UTC` | no | Container time zone. Only affects server-time job schedules (e.g. `insights.detect` at 03:00) and log timestamps' display; all user-facing dates use the user's time zone. Leave at UTC unless there is a reason. |
| `APP_ENCRYPTION_KEY` *(secret)* | none | **yes** | 32 random bytes, base64. Encrypts secrets stored in `app_settings` (AES-256-GCM). Generate with the CLI `generate-key`. **Losing it makes stored secrets unreadable** (re-enter the OIDC secret; VAPID keys are regenerated, which invalidates push subscriptions). Keep it with the backups, but not inside them ([backups-and-restoration.md](backups-and-restoration.md#what-is-not-in-a-backup)). |
| `LOG_LEVEL` | `info` | no | `fatal`, `error`, `warn`, `info`, `debug`, `trace` ([monitoring-and-logging.md](monitoring-and-logging.md)). |
| `BOOTSTRAP_ADMIN_EMAIL` | none | no | If set and no user exists, the first registration or OIDC login with this email becomes ADMIN, and open first-user registration is disabled for any other email ([authentication.md](../architecture/authentication.md#7-admin-bootstrap)). |

### Database

| Variable | Default | Required | Description |
|---|---|---|---|
| `DATABASE_URL` *(secret)* | none | **yes** | `postgresql://monevo:<password>@db:5432/monevo`. The role must own the schema and must not be a superuser ([security.md](../architecture/security.md#database)). |
| `DATABASE_POOL_SIZE` | `10` | no | API connection pool size. pg-boss uses its own pool of 3 ([database-architecture.md](../architecture/database-architecture.md#6-connection-management)). |

### HTTP and security

| Variable | Default | Required | Description |
|---|---|---|---|
| `TRUST_PROXY` | `loopback, linklocal, uniquelocal` | no | Passed to Express `trust proxy`. Determines the client IP used for rate limits and session display. Set to the reverse proxy's address or hop count; `false` when the app is exposed directly (not recommended). |
| `INSECURE_COOKIES` | `false` | no | `true` drops `Secure` and the `__Host-` prefix so the app works over plain HTTP. **Only for local development or a trusted LAN test.** Logged as a warning at every start. |
| `CORS_ALLOWED_ORIGINS` | empty (CORS off) | no | Comma-separated origins for future external web clients. Credentials are never allowed cross-origin ([security.md](../architecture/security.md#cors)). |
| `API_DOCS_ENABLED` | `true` | no | Serves `/api/v1/docs` and `/api/v1/openapi.json`. The OpenAPI document contains no secrets; disable to reduce surface. |
| `HTTP_COMPRESSION` | `false` | no | Enables in-app `compression`. Normally the reverse proxy compresses. |
| `SESSION_IDLE_DAYS` | `30` | no | Session idle timeout ([authentication.md](../architecture/authentication.md)). |
| `SESSION_ABSOLUTE_DAYS` | `90` | no | Session absolute lifetime. Must be ≥ `SESSION_IDLE_DAYS`. |

### Storage

| Variable | Default | Required | Description |
|---|---|---|---|
| `STORAGE_DRIVER` | `local` | no | `local` or `s3` ([file-storage.md](../architecture/file-storage.md)). Changing it on an instance with data requires migrating objects (tool deferred). |
| `STORAGE_LOCAL_PATH` | `/data/attachments` | no | Root for the local driver. Must be a writable volume. |
| `S3_ENDPOINT` | none | with `s3` for non-AWS | e.g. `http://minio:9000`. |
| `S3_REGION` | `us-east-1` | no | |
| `S3_BUCKET` | none | with `s3` | Private bucket. |
| `S3_ACCESS_KEY_ID` *(secret)* | none | with `s3` | |
| `S3_SECRET_ACCESS_KEY` *(secret)* | none | with `s3` | |
| `S3_FORCE_PATH_STYLE` | `true` | no | `true` for MinIO and most self-hosted S3; `false` for AWS virtual-hosted style. |
| `MAX_UPLOAD_BYTES` | `25MB` | no | Hard per-file upload ceiling, enforced while streaming. The admin setting `storage.maxUploadBytes` can only lower it. |
| `DEFAULT_USER_QUOTA_BYTES` | `1GiB` | no | Default per-user attachment quota. Maps to the runtime setting `storage.defaultQuotaBytes` (locked when set). |
| `MAX_IMPORT_BYTES` | `100MB` | no | Max size of an uploaded import file ([import-export.md](../architecture/import-export.md)). |
| `MAX_EXPORT_BYTES` | `2GiB` | no | An export job fails with a clear error above this size. |

### Backups

| Variable | Default | Required | Description |
|---|---|---|---|
| `BACKUP_PATH` | `/data/backups` | no | Local backup directory (a separate volume). User exports live in `<BACKUP_PATH>/exports/`. See [backups-and-restoration.md](backups-and-restoration.md). |
| `BACKUP_ENCRYPTION_PASSPHRASE` *(secret)* | none | no | When set, archives are encrypted and the admin cannot turn encryption off ([backups-and-restoration.md](backups-and-restoration.md#encryption)). **[Proposed]** |
| `MONEVO_SKIP_PRE_UPGRADE_BACKUP` | `false` | no | One-off override: skip the automatic pre-upgrade backup on this start ([backups-and-restoration.md](backups-and-restoration.md#pre-upgrade-backup)). Remove it again afterwards. |
| `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_PREFIX`, `BACKUP_S3_ACCESS_KEY_ID` *(secret)*, `BACKUP_S3_SECRET_ACCESS_KEY` *(secret)*, `BACKUP_S3_FORCE_PATH_STYLE` | none / `us-east-1` / none / `monevo/` / none / none / `true` | no | Optional off-site copy target. When set, they lock the runtime setting `backups.remote`. It should be a different bucket (ideally a different host) than attachment storage. |

### Email (authentication only)

| Variable | Default | Required | Description |
|---|---|---|---|
| `SMTP_HOST` | none | no | Enables verification and password-reset emails. Without it, see [OQ-03](../planning/open-questions.md#oq-03-smtp-for-authentication-emails). SMTP is configured **only** by environment. |
| `SMTP_PORT` | `587` | no | |
| `SMTP_SECURE` | `false` | no | `true` = implicit TLS (port 465). With `false`, STARTTLS is required when the server offers it. |
| `SMTP_USER` | none | no | |
| `SMTP_PASSWORD` *(secret)* | none | no | |
| `SMTP_FROM` | `Monevo <no-reply@{APP_URL host}>` | no | |

### OIDC

| Variable | Default | Required | Description |
|---|---|---|---|
| `OIDC_ISSUER` | none | no | When set, OIDC is configured by environment and the admin OIDC form is read-only ([authentication.md](../architecture/authentication.md)). |
| `OIDC_CLIENT_ID` | none | with issuer | |
| `OIDC_CLIENT_SECRET` *(secret)* | none | with issuer | Public clients (PKCE only) are allowed by leaving it empty. |
| `OIDC_SCOPES` | `openid email profile` | no | |
| `OIDC_DISPLAY_NAME` | `Single sign-on` | no | Login button label. |

`allowAutoProvision` and `allowEmailLinking` remain runtime settings (default off) even when OIDC is env-configured.

### Push, rates, sync

| Variable | Default | Required | Description |
|---|---|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` *(secret)* | auto-generated | no | If absent, a pair is generated on first start and stored encrypted in `app_settings` ([notifications.md](../architecture/notifications.md)). Set both or neither. |
| `VAPID_SUBJECT` | `mailto:admin@{APP_URL host}` | no | |
| `RATE_PROVIDER` | none (setting default `frankfurter`) | no | `frankfurter` or `nbp`. Locks `rates.provider` ([multi-currency.md](../architecture/multi-currency.md)). |
| `SYNC_TOMBSTONE_RETENTION_DAYS` | `90` | no | Change-log tombstone retention ([offline-and-synchronization.md](../architecture/offline-and-synchronization.md)). Clients offline longer must re-bootstrap. |

### Variables for the database container

Not read by the app; listed so the compose `.env` is complete ([docker-compose.md](docker-compose.md)): `POSTGRES_DB` (`monevo`), `POSTGRES_USER` (`monevo`), `POSTGRES_PASSWORD` *(secret, required)*. `DATABASE_URL` must match them.

<a id="runtime-settings-app_settings"></a>

## 3. Runtime settings (app_settings)

One `app_settings` row per key; the value is JSONB validated by the key's Zod schema ([data-model.md](../data/data-model.md#app_settings)). Unknown keys are ignored; a missing key means "use the default". The admin UI groups these as described in [administration.md](../architecture/administration.md#settings-r-adm-02-r-adm-04-r-gen-06).

| Key | Type / shape | Default | Locked by env |
|---|---|---|---|
| `registration.mode` | `OPEN` \| `DISABLED` | `OPEN` until the first admin exists, then set to `DISABLED` once | n/a |
| `registration.emailVerificationRequired` | bool | `false` (forced `false` without SMTP) | n/a |
| `storage.defaultQuotaBytes` | int | 1 GiB | `DEFAULT_USER_QUOTA_BYTES` |
| `storage.maxUploadBytes` | int ≤ `MAX_UPLOAD_BYTES` | `MAX_UPLOAD_BYTES` | n/a |
| `branding.instanceName` | string ≤ 60 | `Monevo` | n/a |
| `branding.logo` | `{ mime: png\|webp, dataBase64 }` ≤ 256 KB | none (built-in logo) | n/a |
| `branding.accentColor` | hex color, contrast-checked against both themes | Mantine primary of the built-in theme | n/a |
| `rates.provider` | `frankfurter` \| `nbp` | `frankfurter` | `RATE_PROVIDER` |
| `oidc` | `{ issuer, clientId, clientSecret (encrypted), scopes, displayName }` | not configured | `OIDC_*` |
| `oidc.allowAutoProvision` | bool | `false` | n/a |
| `oidc.allowEmailLinking` | bool | `false` | n/a |
| `backups.enabled` | bool | `true` | n/a |
| `backups.schedule` | 5-field cron in the container time zone | `30 2 * * *` (daily 02:30) | n/a |
| `backups.retention` | `{ keepLast: int ≥ 1, maxAgeDays: int? }` | `{ keepLast: 7, maxAgeDays: 30 }` | n/a |
| `backups.includeS3Attachments` | bool | `true` | n/a |
| `backups.encryption` | bool | `false` | forced on by `BACKUP_ENCRYPTION_PASSPHRASE` |
| `backups.remote` | S3 target as in `BACKUP_S3_*` (secret encrypted) | none | `BACKUP_S3_*` |
| `backups.preUpgrade` | bool | `true` **[Proposed]** | n/a |
| `privacy.showSessionIp` | bool | `true` | n/a |
| `push.vapid` *(internal)* | `{ publicKey, privateKey (encrypted), subject }` | generated on first start | `VAPID_*` |
| `system.instanceEpoch` *(internal)* | int, bumped by every restore; clients with an older epoch must re-bootstrap | `1` | n/a |
| `system.maintenance` *(internal)* | `{ mode: ON\|OFF, reason, since }` | `OFF` | n/a |
| `migrations_done` *(internal)* | string[] of completed one-off data jobs | `[]` | n/a |

*Internal* keys are not editable in the UI. `system.maintenance` is in the database (not memory) so that the CLI `maintenance on|off` from a separate process takes effect; the server polls it every 5 s in addition to the in-process notification.

The backup schedule determines the storage deletion grace period: `max(7 days, interval between two scheduled backups)` ([file-storage.md](../architecture/file-storage.md#deletion)).

## 4. Example `.env`

A documented example ships as `.env.example` in Stage 1. Minimum for a working instance:

```
APP_URL=https://money.example.com
APP_ENCRYPTION_KEY=<output of: docker compose run --rm app node dist/cli.js generate-key>
POSTGRES_PASSWORD=<long random>
DATABASE_URL=postgresql://monevo:<same password>@db:5432/monevo
```

## 5. Testing

- Config schema unit tests: every default, every invalid value produces a message naming the variable, `X` and `X_FILE` together fail, size suffix parsing.
- Settings precedence integration test: env-locked keys reject `PATCH /admin/settings` with `SETTING_LOCKED_BY_ENV`.
- A CI check fails if a variable is read in code but missing from this document (grep of `config` schema keys vs. this table, added in Stage 1).
