# Docker Image and Compose

**[Accepted]** one application image plus a separate PostgreSQL container, only the application port exposed (R-INF-01, R-INF-02, [ADR-0002](../decisions/ADR-0002-single-application-image.md)). **[Proposed]** details below. The actual `Dockerfile` and `docker-compose.yml` are written in Stage 1 ([implementation-stages.md](../planning/implementation-stages.md)); this document is their specification.

## 1. Image

### Build (multi-stage)

| Stage | Base | Does |
|---|---|---|
| `deps` | `node:24-slim` | Enables corepack (pnpm), `pnpm fetch` with the lockfile (cached layer). |
| `build` | `deps` | `pnpm install --offline --frozen-lockfile`, `prisma generate`, builds `packages/*`, `apps/web` (Vite) and `apps/server` (tsup), then `pnpm deploy --prod` of the server into `/out`. |
| `runtime` | `node:24-slim` (pinned by digest) | Installs `tini`, `ca-certificates`, and `postgresql-client-17` (from the PGDG apt repository, for `pg_dump`/`pg_restore`); copies `/out` (server bundle, production `node_modules`, Prisma engine/migrations) and the web build into `/app`. |

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

Image name: `ghcr.io/<owner>/monevo:<version>` plus `:<major>.<minor>` and `:latest` tags (registry depends on [OQ-07](../planning/open-questions.md#oq-07-ci-platform)). Architectures: `linux/amd64` and `linux/arm64` (homelab ARM boards).

### Entrypoint

`/app/docker-entrypoint.sh` (run by tini):

1. If the first argument is a CLI command (e.g. `node dist/cli.js restore …`), execute it and exit. This is how `docker compose run --rm app node dist/cli.js …` works without starting the server.
2. Otherwise: `node dist/cli.js migrate` (waits up to 60 s for the database, takes the [pre-upgrade backup](backups-and-restoration.md#pre-upgrade-backup) if migrations are pending, then `prisma migrate deploy`). Failure → exit non-zero; compose restarts according to its policy and the logs say why.
3. `exec node dist/main.js`.

Migrations never run concurrently: Prisma uses an advisory lock, and there is only one app container.

## 2. Compose services

| Service | Image | Network | Ports | Volumes | Notes |
|---|---|---|---|---|---|
| `app` | `monevo` | `internal` + `proxy` (or `default`) | `3000` published (or only to the proxy network) | `attachments:/data/attachments`, `backups:/data/backups` | `depends_on: db (service_healthy)`, `restart: unless-stopped` |
| `db` | `postgres:17` (pinned minor) | `internal` only | **none** | `pgdata:/var/lib/postgresql/data` | healthcheck `pg_isready`, `restart: unless-stopped` |
| `minio` *(optional profile `s3`)* | `minio/minio` (pinned) | `internal` only | none (console optional on localhost) | `minio:/data` | Only for operators who want S3 semantics on one host; most deployments use the local driver or an external S3 |

The `internal` network is `internal: true` (no outbound access); the app reaches the internet (OIDC, rates, push, SMTP) through its second network.

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
| `docker-compose.yml` | Production example: `app` + `db` (+ `minio` profile) |
| `docker-compose.dev.yml` | Development: `db` (+ `db-test`, `minio`, `mailpit`) only; the app runs on the host ([development-setup.md](../development/development-setup.md)) |
| `docker-compose.e2e.yml` | CI/E2E: built image + `db` + `minio` + `mailpit` for Playwright ([testing-strategy.md](../development/testing-strategy.md)) |
| `.env.example` | Documented minimal configuration |
| `.dockerignore` | Excludes `node_modules`, `.git`, test artifacts, local `.env` |

## 4. Reverse proxy

TLS terminates at a reverse proxy chosen by the operator (Caddy, Traefik, nginx). Requirements and examples are in [deployment.md](deployment.md#reverse-proxy). The app needs WebSocket upgrade passthrough for `/api/v1/realtime`, `X-Forwarded-For`/`X-Forwarded-Proto`, and a body size limit at least as large as `MAX_IMPORT_BYTES` (and backup uploads, if used).

## 5. Testing

- CI builds the image for both architectures and runs the E2E suite against it ([testing-strategy.md](../development/testing-strategy.md)).
- A container smoke test: start with `read_only`, non-root, no capabilities; health becomes ready; `pg_dump --version` major equals the `db` major.
- Image vulnerability scan (Trivy or the registry's scanner) on release builds; non-blocking for unfixed low severity.
