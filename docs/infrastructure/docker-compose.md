# Docker Image and Compose

**[Accepted]** one application image, only the application port exposed, and PostgreSQL hosted externally and reached through `DATABASE_URL` (R-INF-01, R-INF-02, [ADR-0002](../decisions/ADR-0002-single-application-image.md), [ADR-0015](../decisions/ADR-0015-external-postgresql.md)). The production compose stack contains **no PostgreSQL service** ([postgresql.md](postgresql.md)). **[Proposed]** details below. The actual `Dockerfile` and `docker-compose.yml` are written in Stage 1 ([implementation-stages.md](../planning/implementation-stages.md)); this document is their specification.

## 1. Image

### Build (multi-stage)

| Stage | Base | Does |
|---|---|---|
| `deps` | `node:24-slim` | Enables corepack (pnpm), `pnpm fetch` with the lockfile (cached layer). |
| `build` | `deps` | `pnpm install --offline --frozen-lockfile`, `prisma generate`, builds `packages/*`, `apps/web` (Vite) and `apps/server` (tsup), then `pnpm deploy --prod` of the server into `/out`. |
| `runtime` | `node:24-slim` (pinned by digest) | Installs `tini`, `ca-certificates`, and the PostgreSQL client tools of the newest supported major (from the PGDG apt repository, for `pg_dump`/`pg_restore`; see [postgresql.md](postgresql.md#backup-client-tools)); copies `/out` (server bundle, production `node_modules`, Prisma engine/migrations) and the web build into `/app`. |

No build tools, compilers, or package caches are left in the runtime image. Native modules (`argon2`) are built in `build` for the same base, so the ABI matches.

### Runtime properties

| Property | Value |
|---|---|
| User | `node` (uid/gid 1000), never root |
| Init | `tini` as PID 1 (signal forwarding, zombie reaping) |
| Working dir | `/app` |
| Port | `3000` (`PORT`) |
| Volumes | `/data/attachments` (local storage driver), `/data/backups` (backups and user exports) |
| Writable paths | only `/data/*` and `/tmp` (tmpfs). Root filesystem read-only. |
| Healthcheck | `node dist/healthcheck.js` → `GET http://127.0.0.1:3000/api/v1/health/ready`, interval 30 s, timeout 5 s, start period 120 s (migrations and pre-upgrade backup may take a while), retries 3 |
| Labels | OCI labels: version, revision (commit), created, source, license |
| Build args | `APP_VERSION`, `GIT_COMMIT`, `BUILD_DATE` (exposed in `/admin/system`) |
| Stop | SIGTERM; graceful shutdown within 25 s ([backend-architecture.md](../architecture/backend-architecture.md#1-process-layout)) |

Image name: `monevo:<version>` plus `:<major>.<minor>` tags. The public registry and automated publishing are decided together with the CI platform ([OQ-07](../planning/open-questions.md#oq-07-ci-platform), deferred; [ADR-0016](../decisions/ADR-0016-local-validation-ci-deferred.md)). Until then, images are built locally from a release tag (`docker build -t monevo:<version> .`, or `build:` in the compose file). Architectures: `linux/amd64` and `linux/arm64` (homelab ARM boards), built with `docker buildx`.

### Entrypoint

`/app/docker-entrypoint.sh` (run by tini):

1. If the first argument is a CLI command (e.g. `node dist/cli.js restore …`), execute it and exit. This is how `docker compose run --rm app node dist/cli.js …` works without starting the server.
2. Otherwise: `node dist/cli.js migrate` (waits up to 60 s for the external database and checks its version ([postgresql.md](postgresql.md#supported-versions)), takes the [pre-upgrade backup](backups-and-restoration.md#pre-upgrade-backup) if migrations are pending, then `prisma migrate deploy`). Failure → exit non-zero; compose restarts according to its policy and the logs say why.
3. `exec node dist/main.js`.

Migrations never run concurrently: Prisma uses an advisory lock, and there is only one app container. This is one reason transaction-mode connection poolers are not supported ([postgresql.md](postgresql.md#connection-pooling)).

## 2. Compose services

| Service | Image | Network | Ports | Volumes | Notes |
|---|---|---|---|---|---|
| `app` | `monevo` | `default` (or the proxy's external network), plus `internal` when `minio` is used | `3000` published on `127.0.0.1` (or only to the proxy network) | `attachments:/data/attachments`, `backups:/data/backups` | `restart: unless-stopped`; read-only certificate mounts for database TLS if needed ([postgresql.md](postgresql.md#tls)) |
| `minio` *(optional profile `s3`; **pending [OQ-23](../planning/open-questions.md#oq-23-s3-compatible-server-for-development-and-tests)**, not in the compose files)* | `minio/minio` (pinned); the public images are no longer available, so the image is open in OQ-23 | `internal` only | none (console optional on localhost) | `minio:/data` | Only for operators who want S3 semantics on one host; most deployments use the local driver or an external S3 |

There is **no `db` service**. The app connects to the external PostgreSQL named in `DATABASE_URL`, through its default network or an external Docker network shared with the database ([postgresql.md](postgresql.md#connection)). The `internal` network (`internal: true`, no outbound access) exists only for the optional `minio` service (pending OQ-23; until then neither exists); the app reaches the database and the internet (OIDC, rates, push, SMTP) through its default network.

### Hardening applied to `app`

```
read_only: true
tmpfs: [/tmp]
security_opt: [no-new-privileges:true]
cap_drop: [ALL]
user: "1000:1000"
```

See [security.md](../architecture/security.md#docker). Volume directories must be writable by uid 1000; named volumes get this from the image's pre-created `/data/*` directories. For bind mounts, the operator runs `chown 1000:1000` once ([deployment.md](deployment.md#volumes-and-bind-mounts)).

### Environment

All variables come from an `.env` file next to the compose file (or Docker secrets via `*_FILE`). The list and defaults are canonical in [configuration.md](configuration.md). The compose file only references variables; it never hard-codes secrets.

## 3. Files shipped in the repository (Stage 1)

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build above |
| `docker-compose.yml` | Production example: `app` only (the `s3` profile returns with OQ-23); PostgreSQL is external |
| `docker-compose.dev.yml` | Development only: disposable local PostgreSQL containers `db` and `db-test`, plus `mailpit` (the S3 test server is pending OQ-23); the app runs on the host ([development-setup.md](../development/development-setup.md)). Not a production database. |
| `docker-compose.e2e.yml` | Local E2E: built image + a disposable PostgreSQL test fixture + `mailpit` for Playwright (S3 service pending OQ-23) ([testing-strategy.md](../development/testing-strategy.md)) |
| `.env.example` | Documented minimal configuration |
| `.dockerignore` | Excludes `node_modules`, `.git`, test artifacts, local `.env` |

## 4. Reverse proxy

TLS terminates at a reverse proxy chosen by the operator (Caddy, Traefik, nginx). Requirements and examples are in [deployment.md](deployment.md#reverse-proxy). The app needs WebSocket upgrade passthrough for `/api/v1/realtime`, `X-Forwarded-For`/`X-Forwarded-Proto`, and a body size limit at least as large as `MAX_IMPORT_BYTES` (and backup uploads, if used).

## 5. Testing

- `pnpm test:e2e` builds the image for the host architecture and runs the E2E suite against it locally ([testing-strategy.md](../development/testing-strategy.md#5-local-validation)). Release builds for both architectures are made locally with `docker buildx`.
- A container smoke test: start with `read_only`, non-root, no capabilities; health becomes ready; the `pg_dump --version` major equals the newest supported PostgreSQL major ([postgresql.md](postgresql.md#backup-client-tools)).
- Image vulnerability scan (Trivy, run locally) on release builds; non-blocking for unfixed low severity.
