# Development Setup

**[Accepted]** pnpm workspaces monorepo ([OQ-02](../planning/open-questions.md#oq-02-package-manager-and-repository-layout), [ADR-0012](../decisions/ADR-0012-monorepo-and-shared-packages.md)), Node.js 24, and external PostgreSQL ([OQ-08](../planning/open-questions.md#oq-08-nodejs-and-postgresql-versions), [postgresql.md](../infrastructure/postgresql.md)); validation runs locally, with no CI platform ([ADR-0016](../decisions/ADR-0016-local-validation-ci-deferred.md)). **[Proposed]** details below. Stage 1 ([implementation-stages.md](../planning/implementation-stages.md#stage-1-foundation)) implements the workspace, scripts, and dev services below; items that belong to later stages (for example `db:seed:dev`, `DEV_FAKE_NOW`, `job:run`) are the target developer experience.

## 1. Prerequisites

- Node.js 24 (`.nvmrc`; use nvm, fnm, or mise). Corepack enabled (`corepack enable`), which provides the pinned pnpm version from `package.json#packageManager`.
- Docker with the Compose plugin (for the local development PostgreSQL, Mailpit, and E2E; an S3-compatible test server is pending [OQ-23](../planning/open-questions.md#oq-23-s3-compatible-server-for-development-and-tests)).
- Git. An editor with ESLint, Prettier, and TypeScript support.

## 2. First run

```bash
pnpm install
cp .env.example .env.development        # then apply the dev values from its comments (below)
docker compose -f docker-compose.dev.yml up -d   # db, db-test, mailpit
pnpm db:migrate                          # prisma migrate dev
pnpm dev                                 # server (tsx watch, :3000) + web (Vite, :5173) in parallel
pnpm --filter @monevo/e2e exec playwright install --with-deps chromium   # once, for pnpm test:e2e
```

`.env.example` is production-oriented; its comments give the development values. In `.env.development` set `APP_URL=http://localhost:5173`, `INSECURE_COOKIES=true`, `DATABASE_URL=postgresql://monevo:monevo@127.0.0.1:5432/monevo_dev`, and an `APP_ENCRYPTION_KEY` (`openssl rand -base64 32`).

On Windows and macOS, `--with-deps` is unnecessary: `playwright install chromium` is enough. The repository's `.gitattributes` forces LF line endings, which Prettier and the Linux image expect; clones made before it existed need a fresh checkout.

Open `http://localhost:5173`. The Vite dev server proxies `/api` (including the WebSocket path `/api/v1/realtime`) to `:3000`, so the browser sees one origin, as in production. The first registered user becomes admin.

## 3. Dev services (`docker-compose.dev.yml`)

| Service | Port (host) | Purpose |
|---|---|---|
| `db` | `127.0.0.1:5432` | Development database `monevo_dev` (PostgreSQL 17, inside the [supported range](../infrastructure/postgresql.md#supported-versions); persistent volume) |
| `db-test` | `127.0.0.1:5433` | Disposable database for integration tests at the minimum supported major, PostgreSQL 16 (tmpfs, `fsync=off`) |
| `mailpit` | `127.0.0.1:1025` (SMTP), `8025` (UI) | Catches verification and reset emails |

All ports bind to localhost only. These PostgreSQL containers are a development convenience only; production always uses an external PostgreSQL ([postgresql.md](../infrastructure/postgresql.md)). Instead of the dev `db`, `DATABASE_URL` in `.env.development` may point to any reachable PostgreSQL in the supported range.

There is no S3-compatible service yet: the planned MinIO images are no longer publicly available, and the replacement is open in [OQ-23](../planning/open-questions.md#oq-23-s3-compatible-server-for-development-and-tests) (needed from Stage 6).

### Integration-test database

| Variable | Default | Purpose |
|---|---|---|
| `TEST_DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:5433/postgres` (the `db-test` service) | Admin connection used to build a migrated template database, cloned per test file |
| `TESTCONTAINERS` | unset | `true` starts a throwaway PostgreSQL with Testcontainers instead of using `db-test` |

Start `db-test` with `docker compose -f docker-compose.dev.yml up -d db-test` before `pnpm test:integration` or `pnpm validate`.

## 4. Root scripts

| Script | Does |
|---|---|
| `pnpm dev` | Server and web in watch mode |
| `pnpm build` | Builds all packages and apps |
| `pnpm typecheck` | `tsc --noEmit` across the workspace (project references) |
| `pnpm lint` / `pnpm lint:fix` | ESLint (including the custom money and isolation rules) |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm test` | Unit tests (all packages; the `e2e` package's Playwright script is `test:e2e`, so it is not part of this) |
| `pnpm db:generate` | `prisma generate` (the first step of `pnpm validate`, so lint and typecheck see the generated client on a fresh clone) |
| `pnpm test:integration` | Server integration tests against `db-test` (or Testcontainers when `TESTCONTAINERS=true`) |
| `pnpm test:e2e` | Builds the image, starts `docker-compose.e2e.yml`, runs Playwright |
| `pnpm db:migrate` | `prisma migrate dev` (create/apply migrations in development) |
| `pnpm db:reset` | Drop and re-create the dev database |
| `pnpm db:seed:dev` | Optional demo data for one dev user (development only, never in migrations or production) |
| `pnpm openapi:check` | Regenerate the OpenAPI document and diff it against the committed snapshot |
| `pnpm i18n:check` | Missing/unused translation keys ([internationalization.md](internationalization.md#tooling)) |
| `pnpm docs:check` | Relative link and anchor check for `docs/` and `CLAUDE.md` (`scripts/check-doc-links.mjs`) |
| `pnpm validate` | All local checks: lint, format check, typecheck, i18n, docs, unit/component/sync, integration, OpenAPI snapshot ([testing-strategy.md](testing-strategy.md#5-local-validation)). Must pass before every merge. |

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
| Prisma client out of date | `pnpm db:generate` |
| Stale web app after changes | Unregister the service worker (Application tab) or disable `VITE_PWA_DEV` |
