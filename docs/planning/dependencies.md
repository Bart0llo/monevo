# Dependencies

**[Proposed]** third-party libraries with justification. The architectural choices behind them are in [technology-stack.md](../architecture/technology-stack.md). Exact versions are pinned in the lockfile at Stage 1 and verified then (major versions below are the planning baseline).

## Policy

1. **Prefer the platform** (Node `crypto`, `fetch`, `Intl`, Web Crypto, Web Locks) and libraries already in the tree.
2. A new runtime dependency needs: active maintenance (release in the last 12 months or clearly "done"), a license compatible with the project license ([OQ-17](open-questions.md#oq-17-license); MIT, ISC, BSD, Apache-2.0, MPL-2.0 are fine), reasonable size for web dependencies, and an entry in this file.
3. **Security-critical functionality uses established libraries**, never custom implementations (R-SEC-03): password hashing, OIDC, cookies/CSRF tokens, encryption.
4. Lockfile committed; `pnpm audit` and Renovate/Dependabot ([security.md](../architecture/security.md#dependencies)).
5. Removing a dependency is always welcome; replacing one needs a note here.

## Server (`apps/server`)

| Package | Purpose | Why this one |
|---|---|---|
| `express` 5 | HTTP framework | Required by the brief; v5 has native async error handling |
| `zod` 4 | Validation, DTO schemas | One schema source for runtime validation, types, and OpenAPI |
| `@asteasolutions/zod-to-openapi` | OpenAPI 3.1 generation from Zod | Mature, Zod 4 compatible, registry model fits module registration |
| `swagger-ui-express` | Swagger UI at `/api/v1/docs` | Standard, small |
| `prisma`, `@prisma/client` 7, `@prisma/adapter-pg`, `pg` | ORM and driver | Required ORM; the pg adapter gives control over the pool and timeouts |
| `decimal.js` | Exact decimal arithmetic | Same library as Prisma `Decimal`; via the `@monevo/domain` wrapper |
| `argon2` | argon2id password hashing | Maintained native binding, OWASP-recommended algorithm |
| `openid-client` 6 | OIDC relying party | OpenID-certified, PKCE/nonce/state handled correctly |
| `helmet` | Security headers | Standard |
| `express-rate-limit` | Rate limiting | Simple, memory store suffices for one process |
| `cookie-parser` (or Express built-in parsing) | Session cookie reading | Minimal |
| `socket.io` 4 | Realtime pokes | Required by the brief |
| `pg-boss` | Durable jobs and cron in PostgreSQL | No Redis; transactional enqueue; singleton jobs ([ADR-0013](../decisions/ADR-0013-scheduled-transactions-and-jobs.md)) |
| `pino`, `pino-http` | Structured logging with redaction | Fast, JSON, redaction built in |
| `nodemailer` | SMTP for auth emails | De facto standard |
| `web-push` | Web Push with VAPID | Standard, implements payload encryption |
| `busboy` | Streaming multipart parsing | Streams to storage without temp files; byte limits |
| `file-type` | Magic-byte MIME detection | Maintained, broad format coverage |
| `@aws-sdk/client-s3`, `@aws-sdk/lib-storage` | S3 driver and backup target | Official SDK, works with MinIO/Garage/B2; multipart uploads |
| `date-fns` 4, `@date-fns/tz` | Dates and IANA time zones | Tree-shakable, immutable, shared with the client |
| `ua-parser-js` | Session device descriptions | Small, maintained; check its license version (v2 is AGPL/commercial, v1 is MIT) against OQ-17 |
| `age-encryption` (typage) | Backup encryption **[Proposed]** | Implementation of the age format by its author; no custom crypto ([OQ-14](open-questions.md#oq-14-backup-encryption)) |
| `tar-stream` | Streaming backup archives | Streams without loading archives into memory |
| `uuid` (v7) or `uuidv7` | Time-ordered IDs | UUIDv7 for client-generated IDs (index locality) |
| `commander` | CLI argument parsing | Small, well known |

Dev/build: `typescript`, `tsx` (watch), `tsup`, `vitest`, `supertest`, `@testcontainers/postgresql`, `fast-check`.

## Web (`apps/web`)

| Package | Purpose | Why this one |
|---|---|---|
| `react` 19, `react-dom` | UI | Required |
| `@mantine/core|hooks|form|dates|notifications|modals` 8 | Component library | Required; good a11y defaults, theming, dark mode |
| `@mantine/charts`, `recharts` | Charts | Required (Recharts); Mantine wrappers where sufficient |
| `react-router` 7 | Routing | Mature SPA routing with data APIs |
| `@tanstack/react-query` 5 + persist client | Server-only data cache | Caching, retries, offline persistence of report results |
| `dexie` 4, `dexie-react-hooks` | IndexedDB local database | Live queries, versioned schema ([OQ-21](open-questions.md#oq-21-local-database-library)) |
| `socket.io-client` | Realtime pokes | Matches the server |
| `i18next`, `react-i18next`, `i18next-browser-languagedetector` | i18n | Required (i18next) |
| `vite-plugin-pwa` (Workbox) | Service worker, manifest | Standard for Vite PWAs; `injectManifest` for push |
| `@dnd-kit/core`, `@dnd-kit/sortable` | Dashboard drag and drop | Accessible (keyboard), no grid engine needed |
| `@tabler/icons-react` | Icons | Mantine's companion set; category icons |
| `zod`, `decimal.js`, `date-fns` | via shared packages | Shared with the server |

Dev: `vite`, `@vitejs/plugin-react`, `@testing-library/react`, `msw`, `fake-indexeddb`, `@playwright/test`, `@axe-core/playwright`.

## Workspace tooling

`pnpm`, `eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-i18next` + `eslint-plugin-boundaries`, `prettier`, `i18next-parser` (or a custom key checker), a tiny link checker script for `docs:check` (no dependency).

## Rejected or avoided

| Package | Reason |
|---|---|
| NestJS | Excluded by the brief ([ADR-0001](../decisions/ADR-0001-express-modular-monolith.md)) |
| Redis / BullMQ | An extra service for no benefit at this scale; pg-boss covers jobs |
| Lucia | Deprecated |
| `jsonwebtoken` for web sessions | Opaque server-side sessions instead ([ADR-0005](../decisions/ADR-0005-authentication-and-sessions.md)) |
| `multer` | Buffers or temp-files uploads; busboy streams |
| moment, dayjs (directly) | date-fns chosen; Mantine uses dayjs internally only |
| `react-grid-layout` | Free placement not needed; @dnd-kit sortable is simpler and accessible |
| `big.js`, `bignumber.js` | decimal.js already required by Prisma |
