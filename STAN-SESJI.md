# Session State: Stage 1 (Foundation), in progress (session 11 paused at context limit)

## Goal
Implement Stage 1 (Foundation) exactly as in `docs/planning/implementation-stages.md#stage-1-foundation`. Stage 0 accepted. Technical foundation only: nothing from Stage 2+ (no auth, users, sessions, tokens, SMTP, OIDC, storage drivers, rate providers, DEV_FAKE_NOW, generate-key CLI, pre-upgrade backup). Branch `stage-1-foundation`. **Never commit unless the user asks.** Don't change the docs updated in session 8 (api-tokens.md, authentication.md, ADR-0017, implementation-stages.md, open-questions.md, requirements.md) unless Stage 1 code requires it (OQ-23 below qualifies).

## Done (all uncommitted)
- Sessions 8-10: doc alignment; root files; packages/domain|contracts|i18n (verified); apps/server (complete, 111 unit + 10 integration tests PASS); docker-compose.dev.yml; ESLint + tools/eslint-plugin-monevo (35 tests). See git status for files.
- **Session 11:**
  - **apps/web** (done, verified): package.json (Mantine 8.3.18, react-router 7.18.5, React 19.3, i18next 27 + react-i18next 18 + browser-languagedetector, vite 8.3, vite-plugin-pwa 2.0 injectManifest, workbox-*), tsconfig.json (Bundler, DOM; includes src + vite/vitest configs, excludes src/sw), `src/sw/tsconfig.json` (WebWorker lib) + `src/sw/sw.ts` (precache, NavigationRoute denylist `/api`, SKIP_WAITING), vite.config.ts (manifest, proxy /api ws → :3000, `VITE_PWA_DEV` toggles devOptions, chunkSizeWarningLimit 900), vitest.config.ts (jsdom, `src/test/setup.ts`), index.html (external `/color-scheme.js`, theme-color metas; manifest link injected by plugin), `public/color-scheme.js` (key `monevo-color-scheme`), `public/favicon.svg`, `public/icons/*.png` from `scripts/generate-icons.mjs` (node+zlib), src/theme/theme.ts, src/i18n/{i18n.ts (storage key `monevo-language`), i18next.d.ts (CustomTypeOptions)}, src/app/{AppProviders, AppLayout (AppShell + burger + NavLinks), ColorSchemeMenu, LanguageMenu, NotFoundPage, navigation.ts, routes.tsx, AppLayout.test.tsx}, src/features/placeholder/PlaceholderPage.tsx, src/pwa/register.tsx (registerSW prompt + Mantine notification), src/main.tsx. typecheck PASS, 5 unit tests PASS, build PASS (shell JS ~170 KB gzip), eslint clean.
  - eslint.config.js: i18next rule now checks only user-visible JSX attributes (`jsx-attributes.include` aria-label/title/alt/placeholder/label/description); browser globals + script sourceType for `apps/web/public/**/*.js`.
  - **scripts/**: `check-doc-links.mjs` (PASS, 774 links/64 files; verified it catches broken files/anchors), `check-i18n.mjs` (PASS; verified it catches missing keys/placeholders/extra keys), `test-e2e.mjs` (build with APP_VERSION/GIT_COMMIT/BUILD_DATE args, up --wait, smoke: uid 1000, read-only root, cap_drop ALL, healthy, pg_dump major 18, /app not writable, /data writable; Playwright; logs on failure; always `down -v`).
  - **Docker**: Dockerfile (node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54, bookworm; deps stage installs openssl so Prisma picks the openssl-3 schema engine; pnpm 12.21.0 via npm -g; `pnpm deploy --prod --legacy /out`; runtime: tini, ca-certificates, PGDG postgresql-client-18 with key via `ADD --checksum`; /data dirs uid 1000; ENV NODE_ENV, APP_VERSION, GIT_COMMIT, BUILD_DATE, CHECKPOINT_DISABLE=1; HEALTHCHECK with --start-interval=5s), docker-entrypoint.sh, .dockerignore, docker-compose.yml (app only, hardened, env_file .env), docker-compose.e2e.yml (db postgres:17 tmpfs, app on 127.0.0.1:3100, mailpit), .env.example, README.md. apps/server/package.json got `"files": ["dist","prisma","prisma.config.ts"]` for deploy. Image builds (~896 MB; prisma CLI is ~most of 356 MB node_modules: note in stage report).
  - **e2e/** package: package.json (@playwright/test), tsconfig.json, playwright.config.ts (E2E_BASE_URL default http://localhost:3100), tests/shell.spec.ts (shell+nav, theme switch persists, language switch persists, manifest+active SW, API/docs/problem+json 404).
  - Chromium headless shell downloaded (`pnpm exec playwright install chromium` in e2e/).
  - **MinIO removed** from docker-compose.dev.yml, docker-compose.yml (s3 profile) and docker-compose.e2e.yml: `minio/minio` images are no longer public (Docker Hub: pull access denied; quay.io: 401). Comments point to OQ-23 (not yet written in docs).

## Last e2e run (session 11)
Image build PASS, compose up --wait PASS, migrations applied, smoke test PASS (uid 1000, read-only, healthy, pg_dump 18.7). Playwright: 1 passed (API test), 4 failed only because Chromium cannot start: `libnspr4.so: cannot open shared object file` (host lacks browser system deps).

## Remaining (in order)
1. Install Playwright system deps: needs sudo. Use `request_secret` with `delivery: "file"`, then `sudo -S -p '' $(which node) ...`/or `cd e2e && sudo -S -p '' env PATH="$PATH" pnpm exec playwright install-deps chromium < "$file"`. Then rerun `pnpm test:e2e` and fix real failures (theme/language/SW tests have not run in a browser yet).
2. `pnpm install` (already done), `pnpm validate` (full; not yet run with web/e2e/scripts; expect Prettier fixes: run `pnpm format` then re-check; e2e package typecheck is in `pnpm -r typecheck`). Possibly add `apps/web/dev-dist/` to .prettierignore.
3. Doc updates owed (Stage 1 code requires them):
   - configuration.md: row for build metadata `APP_VERSION`, `GIT_COMMIT`, `BUILD_DATE` (set by the image build) and image-internal `CHECKPOINT_DISABLE=1` (disables Prisma CLI telemetry/update check on a read-only FS); `VITE_PWA_DEV` (web dev build only).
   - api-design.md §4: name `MALFORMED_REQUEST` (400) and `UNSUPPORTED_MEDIA_TYPE` (415).
   - development-setup.md: TEST_DATABASE_URL (default `postgresql://postgres:postgres@127.0.0.1:5433/postgres`), TESTCONTAINERS=true; `.env.example` is production-oriented with dev values in comments (fix the `cp .env.example .env.development` comment); MinIO lines → OQ-23; Playwright browser install step (`pnpm --filter @monevo/e2e exec playwright install --with-deps chromium`).
   - **open-questions.md: add OQ-23 "S3-compatible server for development and tests"** (summary row + section; confirm before Stage 6; MinIO images no longer public; options: Garage, SeaweedFS, RustFS, MinIO built from source; recommendation: evaluate Garage and SeaweedFS against the driver contract suite at Stage 6; until then compose files have no S3 service). Mark MinIO mentions in docker-compose.md (§2 table rows, §3 files table), testing-strategy.md (E2E row, validate diagram) as pending OQ-23.
   - dependencies.md: uuidv7, dotenv-cli, no pino-http, eslint-plugin-i18next confirmed for ESLint 10; web adds workbox-precaching/routing/window/build, @testing-library/user-event, jsdom; eslint-plugin-boundaries and import ordering not added in Stage 1 (mention in stage report).
4. `pnpm docs:check`, stage report (what ran + results, deviations: MinIO/OQ-23, image size, no boundaries plugin, HTTP_COMPRESSION not implemented), one Discord notification (real results, `--git uncommitted`, `--acceptance pending`).

## Decisions
- Readiness lists only failing checks; migrations check cached once passing. X-Request-Id accepted only matching `^[A-Za-z0-9._:-]{8,128}$`. OpenAPI servers `/api/v1`, info.version 1.0.0. CLI `migrate` loads full config. HTTP_COMPRESSION not implemented (proxy compresses).
- Web: theme/language controls are header menus (ActionIcon + Menu: aria-labels "Color scheme", "Language"); service worker registered once from main.tsx (not a component); tests import `RouterProvider` from `react-router` (the `react-router/dom` one breaks under Vitest with a duplicate-context error).
- Navigation uses a burger-collapsed navbar on mobile (no footer nav yet).

## Pitfalls
- Don't add env vars to server code that aren't in configuration.md (unit test checks schema keys).
- psql isn't on the host: `docker exec monevo-dev-db-test-1 psql -U postgres ...`.
- Docker build DNS can fail transiently (deb.debian.org); just retry.
- `docker compose config` on docker-compose.yml needs a `.env` file (env_file); none exists in the repo, don't leave one behind.
- `pgrep -f 'node dist/main.js'` matches your own shell; kill by PID.
- e2e logs: `/tmp/claude-1000/e2e.log` (scratch, may be gone).
