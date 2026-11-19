# Monitoring and Logging

**[Accepted]** technical logs useful for troubleshooting (R-ADM-06); a log management platform and admin analytics are out of scope ([requirements.md](../product/requirements.md#out-of-scope)). **[Proposed]** design.

## 1. Logs

### Format and destination

- **pino** JSON lines to **stdout** (and fatal startup errors to stderr). No log files inside the container; Docker's logging driver handles storage and rotation. Operators read them with `docker compose logs app` or ship them with their own tooling.
- The compose example sets the `local` logging driver with rotation (`max-size: 10m`, `max-file: 5`).
- Level from `LOG_LEVEL` (default `info`) ([configuration.md](configuration.md)). Development uses `pino-pretty`.

### Standard fields

| Field | Content |
|---|---|
| `time`, `level`, `msg` | pino defaults (ISO time) |
| `requestId` | Per request; from a validated incoming `X-Request-Id` or a new UUIDv7. Returned in the `X-Request-Id` response header and in problem+json bodies ([api-design.md](../architecture/api-design.md)) |
| `userId` | After authentication (an opaque UUID, not the email) |
| `apiTokenId` | When the request is authenticated by a personal API token ([api-tokens.md](../architecture/api-tokens.md#6-audit-and-logging)) |
| `module`, `event` | e.g. `module: "sync"`, `event: "sync.push.conflict"` |
| `job`, `jobId` | Inside job handlers |
| `durationMs`, `status`, `method`, `route` | HTTP access log (route pattern, e.g. `/api/v1/transactions/:id`, not the raw URL with query strings) |
| `err` | Serialized error with stack, for `error` level |

### What must never be logged

Canonical rule in [security.md](../architecture/security.md#logging-hygiene): no request or response bodies of financial or auth endpoints, no passwords, tokens, cookies, CSRF tokens, `Authorization` headers, OIDC codes, ID tokens, refresh tokens, `state`/`nonce`/PKCE values, push subscription keys, secrets, financial amounts, descriptions, notes, attachment filenames, or storage keys at `info`. pino `redact` paths enforce this centrally, and a unit test asserts redaction for each path.

Email addresses are not logged; auth events identify the user by `userId` (the identity provider `sub` appears only at `debug`).

### Levels

| Level | Used for |
|---|---|
| `fatal` | Startup config errors, unrecoverable DB loss |
| `error` | Unhandled exceptions (500), job failures after final retry, backup failure, storage probe failure |
| `warn` | Retried job failures, rate provider errors, push endpoint failures, `INSECURE_COOKIES`, rate-limit hits, failed logins |
| `info` | Startup/shutdown, HTTP access log (one line per request), job start/finish summaries, admin actions (`event: admin.action`), auth events (login, account provisioned, logout, session revoked, IdP revocation, re-authentication), backup/restore events |
| `debug` | Query timings, sync batch sizes, cache decisions |

Health check requests are logged at `debug` only, so they don't flood the log.

### Key events

`server.started` (version, commit, config summary without secrets), `migrate.applied`, `auth.login.succeeded|failed`, `auth.user.provisioned`, `auth.reauth.succeeded|failed`, `auth.session.revoked`, `auth.idp.revoked`, `auth.idp.unavailable`, `admin.action`, `sync.push.conflict`, `sync.resync_required`, `job.failed`, `backup.started|succeeded|failed|restored`, `storage.probe.failed`, `rates.fetch.failed`, `push.endpoint.removed`, `maintenance.on|off`.

## 2. Health endpoints

| Endpoint | Checks | Response |
|---|---|---|
| `GET /api/v1/health` (liveness) | The process is serving HTTP. No dependency checks. | `200 {"status":"ok"}` |
| `GET /api/v1/health/ready` (readiness) | Database `SELECT 1` (≤ 2 s), no pending migrations, storage driver probe status (cached, refreshed every 60 s), not shutting down | `200 {"status":"ok"}` or `503 {"status":"unavailable","checks":{"database":"fail"}}` |

Both are public, unauthenticated, rate-limit exempt, and return no versions or internals. Maintenance mode returns `200` from readiness with `"maintenance": true`, so Docker does not restart a container that is restoring. The Docker healthcheck uses readiness ([docker-compose.md](docker-compose.md#runtime-properties)).

## 3. Admin system status

The detailed status (versions, migrations, job runs, storage, identity provider, rate provider, push, maintenance) is in the admin System tab, `GET /api/v1/admin/system` ([administration.md](../architecture/administration.md#system-r-adm-02-r-adm-06)). Job status (last run, status, error, next run per job name) is read from pg-boss's own job and schedule tables; no extra table is needed.

Failures that the admin should notice (backup failed, storage probe failing, rate provider failing for > 24 h, jobs failing repeatedly) are shown as a banner in the admin panel. There are no outbound alerts (email notifications are out of scope); operators who want alerts point an external uptime monitor at `/api/v1/health/ready` or alert on `level >= 50` lines with their log tooling.

## 4. Metrics

No metrics endpoint in v1 **[Proposed]**. A Prometheus `/metrics` endpoint (request durations, job durations, sync push/pull counts) is a possible later addition that requires no design change; it would be disabled by default and bound to a separate port.

## 5. Client-side errors

The web app reports nothing to third parties (no telemetry, [security.md](../architecture/security.md#privacy)). Unexpected client errors are shown with the `requestId` (when an API call was involved) so the user can give it to the admin, who finds the matching server log line. Sync errors are visible in the client's sync status panel ([offline-and-synchronization.md](../architecture/offline-and-synchronization.md)).

## 6. Testing

- Redaction unit tests per sensitive path; an integration test that performs login, a transaction create, and an attachment upload, then asserts the captured log output contains none of the OIDC code, ID or refresh token, amount, description, filename, or session token.
- Readiness returns 503 when the database is stopped (integration) and 200 during maintenance.
