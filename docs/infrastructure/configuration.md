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
| `APP_URL` | none | **yes** | Public base URL, e.g. `https://money.example.com`. Used for the OIDC redirect URIs (`<APP_URL>/api/v1/auth/oidc/callback`, `<APP_URL>/login`), links in push notifications, cookie security decisions, and the PWA manifest scope. Must be `https://` unless `INSECURE_COOKIES=true`. |
| `PORT` | `3000` | no | HTTP port inside the container. |
| `NODE_ENV` | `production` (image) | no | Set by the image. Development tooling sets `development`/`test`. |
| `TZ` | `UTC` | no | Container time zone. Only affects server-time job schedules (e.g. `insights.detect` at 03:00) and log timestamps' display; all user-facing dates use the user's time zone. Leave at UTC unless there is a reason. |
| `APP_ENCRYPTION_KEY` *(secret)* | none | **yes** | 32 random bytes, base64. Encrypts secrets stored in `app_settings` and the IdP refresh tokens stored with sessions (AES-256-GCM), and keys the encrypted OIDC state cookie (via HKDF). Generate with the CLI `generate-key`. **Losing or changing it makes stored secrets unreadable** (sessions fail IdP revalidation and users sign in again; VAPID keys are regenerated, which invalidates push subscriptions). Keep it with the backups, but not inside them ([backups-and-restoration.md](backups-and-restoration.md#what-is-not-in-a-backup)). |
| `LOG_LEVEL` | `info` | no | `fatal`, `error`, `warn`, `info`, `debug`, `trace` ([monitoring-and-logging.md](monitoring-and-logging.md)). |

### Database

| Variable | Default | Required | Description |
|---|---|---|---|
| `DATABASE_URL` *(secret)* | none | **yes** | Connection string of the **external** PostgreSQL, e.g. `postgresql://monevo:<password>@<db-host>:5432/monevo?sslmode=verify-full&sslrootcert=/run/secrets/postgres-ca.pem`. No host or credentials are built in. Supported versions, TLS parameters, pooling, and the required role privileges (owns the database, not a superuser) are canonical in [postgresql.md](postgresql.md). Also used by `pg_dump`/`pg_restore` for backups. |
| `DATABASE_POOL_SIZE` | `10` | no | API connection pool size. pg-boss uses its own pool of 3 ([database-architecture.md](../architecture/database-architecture.md#6-connection-management)). The total connection budget is in [postgresql.md](postgresql.md#connection-pooling). |

### HTTP and security

| Variable | Default | Required | Description |
|---|---|---|---|
| `TRUST_PROXY` | `loopback, linklocal, uniquelocal` | no | Passed to Express `trust proxy`. Determines the client IP used for rate limits and session display. Set to the reverse proxy's address or hop count; `false` when the app is exposed directly (not recommended). |
| `INSECURE_COOKIES` | `false` | no | `true` drops `Secure` and the `__Host-` prefix so the app works over plain HTTP. **Only for local development or a trusted LAN test.** Logged as a warning at every start. |
| `CORS_ALLOWED_ORIGINS` | empty (CORS off) | no | Comma-separated origins for future external web clients. Credentials are never allowed cross-origin ([security.md](../architecture/security.md#cors)). |
| `API_DOCS_ENABLED` | `true` | no | Serves `/api/v1/docs` and `/api/v1/openapi.json`. The OpenAPI document contains no secrets; disable to reduce surface. |
| `HTTP_COMPRESSION` | `false` | no | Enables in-app `compression`. Normally the reverse proxy compresses. |

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

### OIDC

Authentication is OIDC-only with one identity provider, normally Account Center ([authentication.md](../architecture/authentication.md), [ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md)). It is configured **only** by environment; there is no admin form. Register Monevo in the IdP with the redirect URI `<APP_URL>/api/v1/auth/oidc/callback` and the post-logout redirect URI `<APP_URL>/login` ([deployment.md](deployment.md#registering-monevo-in-account-center)).

| Variable | Default | Required | Description |
|---|---|---|---|
| `OIDC_ISSUER` | none | **yes** | Issuer URL of the IdP (Account Center's `APP_URL`); discovery is read from `<issuer>/.well-known/openid-configuration`. Must be `https://` unless `INSECURE_COOKIES=true`. |
| `OIDC_CLIENT_ID` | none | **yes** | Client ID of the Monevo application registered in the IdP. |
| `OIDC_CLIENT_SECRET` *(secret)* | none | no | Client secret (confidential client, `client_secret_basic`; recommended). Empty → public client with PKCE only. |
| `OIDC_SCOPES` | `openid profile email groups` | no | Space-separated; must include `openid`. `groups` is needed for `OIDC_ADMIN_GROUP` (and the group must be exposed to the application in Account Center). |
| `OIDC_ADMIN_GROUP` | none | no | When set, users whose `groups` claim contains this group are ADMIN and everyone else is USER, synced at every sign-in and revalidation; roles cannot be changed in Monevo. When unset, the first provisioned user becomes ADMIN ([authentication.md](../architecture/authentication.md#7-admin-bootstrap)). |
| `OIDC_DISPLAY_NAME` | `Account Center` | no | Provider name on the login button ("Sign in with …"). |
| `SESSION_IDLE_DAYS` | `30` | no | Session idle timeout ([authentication.md](../architecture/authentication.md#4-sessions)). |
| `SESSION_ABSOLUTE_DAYS` | `90` | no | Session absolute lifetime. Must be ≥ `SESSION_IDLE_DAYS`. |

Monevo sends no email, so there are no SMTP variables ([OQ-03](../planning/open-questions.md#oq-03-smtp-for-authentication-emails)).

### Push, rates, sync

| Variable | Default | Required | Description |
|---|---|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` *(secret)* | auto-generated | no | If absent, a pair is generated on first start and stored encrypted in `app_settings` ([notifications.md](../architecture/notifications.md)). Set both or neither. |
| `VAPID_SUBJECT` | `mailto:admin@{APP_URL host}` | no | |
| `RATE_PROVIDER` | none (setting default `frankfurter`) | no | `frankfurter` or `nbp`. Locks `rates.provider` ([multi-currency.md](../architecture/multi-currency.md)). |
| `SYNC_TOMBSTONE_RETENTION_DAYS` | `90` | no | Change-log tombstone retention ([offline-and-synchronization.md](../architecture/offline-and-synchronization.md)). Clients offline longer must re-bootstrap. |

### Set by the image (not operator configuration)

These are baked into the image at build time. Operators do not set them; they are not part of the validated `config` schema.

| Variable | Default | Required | Description |
|---|---|---|---|
| `APP_VERSION` | `dev` | no | Build argument → env. Reported in the startup log and as the OCI `org.opencontainers.image.version` label. Release builds and `pnpm test:e2e` pass the root `package.json` version ([releasing.md](../development/releasing.md#canonical-version)). |
| `GIT_COMMIT` | `unknown` | no | Build argument → env. Reported in the startup log; OCI `revision` label. |
| `BUILD_DATE` | `unknown` | no | Build argument → env. OCI `created` label. |
| `SOURCE_URL` | empty | no | Build argument only (not an env variable). OCI `source` and `url` labels; release builds pass the repository URL. |
| `CHECKPOINT_DISABLE` | `1` (image) | no | Disables the Prisma CLI's telemetry and update check, which would otherwise try to write to the read-only root filesystem and phone home during `migrate`. |

### Development only

| Variable | Default | Required | Description |
|---|---|---|---|
| `VITE_PWA_DEV` | unset | no | Web dev server only (`apps/web`, read by Vite). `true` enables the service worker under `pnpm dev`; it is never in the production image. |
| `TEST_DATABASE_URL`, `TESTCONTAINERS` | see [development-setup.md](../development/development-setup.md) | no | Integration-test database selection. |
| `MOCK_IDP_PORT`, `MOCK_IDP_ISSUER`, `MOCK_IDP_CLIENT_ID`, `MOCK_IDP_CLIENT_SECRET`, `MOCK_IDP_REDIRECT_URIS`, `MOCK_IDP_POST_LOGOUT_REDIRECT_URIS` | `9400`, `http://localhost:9400`, `monevo-dev`, `monevo-dev-secret`, `http://localhost:5173/api/v1/auth/oidc/callback`, `http://localhost:5173/login` | no | The test-only mock OpenID Provider (`tools/mock-idp`) used in development and E2E ([development-setup.md](../development/development-setup.md)); URI lists are comma-separated. Never read by the application. |
| `RELEASE_MODE`, `IMAGE_*`, `GHCR_TOKEN`, `GHCR_USERNAME`, `YES`, and the other release tooling variables | see [releasing.md](../development/releasing.md#variables) | no | Release tooling only (`make` targets); never read by the application. |

<a id="runtime-settings-app_settings"></a>

## 3. Runtime settings (app_settings)

One `app_settings` row per key; the value is JSONB validated by the key's Zod schema ([data-model.md](../data/data-model.md#app_settings)). Unknown keys are ignored; a missing key means "use the default". The admin UI groups these as described in [administration.md](../architecture/administration.md#settings-r-adm-02-r-gen-06).

| Key | Type / shape | Default | Locked by env |
|---|---|---|---|
| `storage.defaultQuotaBytes` | int | 1 GiB | `DEFAULT_USER_QUOTA_BYTES` |
| `storage.maxUploadBytes` | int ≤ `MAX_UPLOAD_BYTES` | `MAX_UPLOAD_BYTES` | n/a |
| `branding.instanceName` | string ≤ 60 | `Monevo` | n/a |
| `branding.logo` | `{ mime: png\|webp, dataBase64 }` ≤ 256 KB | none (built-in logo) | n/a |
| `branding.accentColor` | hex color, contrast-checked against both themes | Mantine primary of the built-in theme | n/a |
| `rates.provider` | `frankfurter` \| `nbp` | `frankfurter` | `RATE_PROVIDER` |
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
DATABASE_URL=postgresql://monevo:<password>@<db-host>:5432/monevo?sslmode=verify-full&sslrootcert=/run/secrets/postgres-ca.pem
OIDC_ISSUER=https://accounts.example.com
OIDC_CLIENT_ID=monevo
OIDC_CLIENT_SECRET=<client secret from Account Center>
```

## 5. Testing

- Config schema unit tests: every default, every invalid value produces a message naming the variable, `X` and `X_FILE` together fail, size suffix parsing.
- Settings precedence integration test: env-locked keys reject `PATCH /admin/settings` with `SETTING_LOCKED_BY_ENV`.
- A check in `pnpm validate` fails if a variable is read in code but missing from this document (grep of `config` schema keys vs. this table, added in Stage 1; [testing-strategy.md](../development/testing-strategy.md#5-local-validation)).
