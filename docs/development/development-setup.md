# Development Setup

**[Proposed]**. Tooling depends on [OQ-02](../planning/open-questions.md#oq-02-package-manager-and-repository-layout) (pnpm workspaces) and [OQ-08](../planning/open-questions.md#oq-08-nodejs-and-postgresql-versions) (Node 24, PostgreSQL 17). Nothing here exists until Stage 1 ([implementation-stages.md](../planning/implementation-stages.md#stage-1-foundation)); this is the target developer experience.

## 1. Prerequisites

- Node.js 24 (`.nvmrc`; use nvm, fnm, or mise). Corepack enabled (`corepack enable`), which provides the pinned pnpm version from `package.json#packageManager`.
- Docker with the Compose plugin (for PostgreSQL, MinIO, Mailpit, and E2E).
- Git. An editor with ESLint, Prettier, and TypeScript support.

## 2. First run

```bash
pnpm install
cp .env.example .env.development        # dev defaults: INSECURE_COOKIES=true, APP_URL=http://localhost:5173
docker compose -f docker-compose.dev.yml up -d   # db, db-test, minio, mailpit
pnpm db:migrate                          # prisma migrate dev
pnpm dev                                 # server (tsx watch, :3000) + web (Vite, :5173) in parallel
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` (including the WebSocket path `/api/v1/realtime`) to `:3000`, so the browser sees one origin, as in production. The first registered user becomes admin.

## 3. Dev services (`docker-compose.dev.yml`)

| Service | Port (host) | Purpose |
|---|---|---|
| `db` | `127.0.0.1:5432` | Development database `monevo_dev` |
| `db-test` | `127.0.0.1:5433` | Disposable database for integration tests (tmpfs, `fsync=off`) |
| `minio` | `127.0.0.1:9000` (API), `9001` (console) | S3 driver testing (`STORAGE_DRIVER=s3`) |
| `mailpit` | `127.0.0.1:1025` (SMTP), `8025` (UI) | Catches verification and reset emails |

All ports bind to localhost only.

## 4. Root scripts

| Script | Does |
|---|---|
| `pnpm dev` | Server and web in watch mode |
| `pnpm build` | Builds all packages and apps |
| `pnpm typecheck` | `tsc --noEmit` across the workspace (project references) |
| `pnpm lint` / `pnpm lint:fix` | ESLint (including the custom money and isolation rules) |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm test` | Unit tests (all packages) |
| `pnpm test:integration` | Server integration tests against `db-test` (or Testcontainers when `TESTCONTAINERS=true`) |
| `pnpm test:e2e` | Builds the image, starts `docker-compose.e2e.yml`, runs Playwright |
| `pnpm db:migrate` | `prisma migrate dev` (create/apply migrations in development) |
| `pnpm db:reset` | Drop and re-create the dev database |
| `pnpm db:seed:dev` | Optional demo data for one dev user (development only, never in migrations or production) |
| `pnpm openapi:check` | Regenerate the OpenAPI document and diff it against the committed snapshot |
| `pnpm i18n:check` | Missing/unused translation keys ([internationalization.md](internationalization.md#tooling)) |
| `pnpm docs:check` | Relative link and anchor check for `docs/` and `CLAUDE.md` (`scripts/check-doc-links.mjs`) |

## 5. Working on specific areas

- **Offline:** Chrome DevTools → Network → Offline, or Application → Service Workers. The service worker is enabled in development via `vite-plugin-pwa` `devOptions` only when `VITE_PWA_DEV=true`, because it caches aggressively.
- **Two devices:** use two browser profiles logged in as the same user to watch sync and conflicts.
- **Time and time zones:** the server accepts `DEV_FAKE_NOW` (ISO instant, development and test builds only, rejected at startup in production) to drive the injected clock; the client has a dev-tools panel to override "today". Use `TZ=Pacific/Kiritimati` or `TZ=America/St_Johns` to flush out time zone bugs.
- **Jobs:** `pnpm --filter server job:run <name>` runs one job immediately against the dev database.
- **Push:** works on `localhost` without HTTPS in Chromium and Firefox.
- **OIDC:** a local Keycloak or Authelia container is not part of the default dev compose; the OIDC integration tests use a mock issuer ([testing-strategy.md](testing-strategy.md)).

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| Cookies not set on `localhost` | `INSECURE_COOKIES=true` in `.env.development` |
| `P1001` cannot reach database | `docker compose -f docker-compose.dev.yml ps`; port 5432 in use by a host Postgres |
| Prisma client out of date | `pnpm --filter server prisma generate` |
| Stale web app after changes | Unregister the service worker (Application tab) or disable `VITE_PWA_DEV` |
