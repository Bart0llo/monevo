# Technology Stack

Status markers: **[Accepted]** means fixed by the project brief. **[Proposed]** means recommended in Stage 0 and to be confirmed at or before the stage where it is first used (see [open-questions.md](../planning/open-questions.md)). Library-level justifications are in [planning/dependencies.md](../planning/dependencies.md).

## Fixed choices [Accepted]

| Area | Choice |
|---|---|
| Frontend | React, TypeScript, Mantine UI, Recharts, i18next, PWA, IndexedDB |
| Backend | Node.js, TypeScript, Express (not NestJS), Prisma ORM, PostgreSQL, REST, Socket.IO |
| Infrastructure | Docker Compose. One application image (frontend + backend). PostgreSQL in a separate container. Files outside PostgreSQL. API at `/api/v1`. |

## Proposed choices [Proposed]

### Runtime and tooling
| Area | Proposal | Notes |
|---|---|---|
| Node.js | **24 LTS** (current Active LTS) | Pin via `.nvmrc`/`engines` and the Docker base image. |
| Package manager | **pnpm** (workspaces) | Strict dependency isolation and fast installs. Alternative: npm workspaces. Confirm before Stage 1. |
| Repo layout | **Monorepo** (`apps/web`, `apps/server`, `packages/*`) | See [application-structure.md](application-structure.md), [ADR-0012](../decisions/ADR-0012-monorepo-and-shared-packages.md). |
| Language | TypeScript `strict`, ESM throughout | |
| Lint/format | ESLint (typescript-eslint) + Prettier | Biome is a viable alternative. Use ESLint for its custom-rule ecosystem (e.g. banning float money ops). |
| Build: web | Vite | Standard for React and PWA (`vite-plugin-pwa`). |
| Build: server | `tsc` for type-check + `tsup` (esbuild) bundle per app | |

### Backend
| Area | Proposal | Notes |
|---|---|---|
| HTTP | **Express 5** | Native async error propagation. |
| Validation and contracts | **Zod 4**, shared in `@monevo/contracts` | One schema source for runtime validation, TS types, and OpenAPI. |
| OpenAPI | `@asteasolutions/zod-to-openapi` (Zod 4 compatible) + `swagger-ui-express` | OpenAPI 3.1 at `/api/v1/openapi.json`, UI at `/api/v1/docs`. |
| ORM | **Prisma 7** with the `@prisma/adapter-pg` driver adapter | Raw SQL in migrations for CHECK constraints, partial indexes, composite FKs where Prisma's schema DSL is insufficient. Verify the exact major version at Stage 1. |
| Database | **PostgreSQL 17** | `pg_dump` client in the app image must match the server major version. 18 is acceptable if pinned consistently. |
| Decimal math | **decimal.js** (via `@monevo/domain` money wrapper) | Prisma's `Decimal` is decimal.js, so no conversion layer is needed. |
| Password hashing | **argon2** (node-argon2, argon2id) | |
| OIDC | **openid-client** (v6+) | Certified relying-party library. Authorization Code + PKCE. |
| Sessions | Own thin layer over DB table + `crypto.randomBytes` tokens | See [ADR-0005](../decisions/ADR-0005-authentication-and-sessions.md). The alternative (better-auth) is recorded there. Confirm before Stage 2. |
| Security headers | helmet | |
| Rate limiting | express-rate-limit (memory store, single process) | A Postgres-backed store if multi-instance ever happens. |
| Realtime | **Socket.IO 4** | Path `/api/v1/realtime`. |
| Jobs | **pg-boss** | Durable Postgres-backed queue and cron. No Redis. See [ADR-0013](../decisions/ADR-0013-scheduled-transactions-and-jobs.md). |
| Logging | **pino** + pino-http | JSON to stdout, with redaction. |
| Email (auth only) | **nodemailer** (SMTP) | Verification and password reset only. See [OQ-03](../planning/open-questions.md#oq-03-smtp-for-authentication-emails). |
| Web Push | **web-push** (VAPID) | |
| Uploads | **busboy** (streaming multipart) | Streams directly to the storage driver with byte counting. |
| File type detection | **file-type** | Magic-number sniffing. |
| S3 | `@aws-sdk/client-s3` + `@aws-sdk/lib-storage` | Works with MinIO, Garage, Backblaze B2, AWS. |
| Dates/time zones | **date-fns 4** + **@date-fns/tz** | Used in `@monevo/domain` on both ends. Temporal can replace it once it is universally available. |
| UA parsing | ua-parser-js | Device descriptions for sessions. |

### Frontend
| Area | Proposal | Notes |
|---|---|---|
| UI | **Mantine 8** (`core`, `hooks`, `form`, `dates`, `notifications`, `modals`, `spotlight` optional) | `@mantine/charts` (built on Recharts) may be used where sufficient. Use raw Recharts otherwise. |
| Charts | **Recharts** | |
| Routing | **React Router 7** (data/library mode, SPA) | TanStack Router is the alternative. |
| Local DB | **Dexie 4** + `dexie-react-hooks` | Recommended. Not finalized (brief). Alternative: `idb` (lower-level, more code). |
| Server state | **TanStack Query 5** | Only for server-only data (reports, forecast, admin, history). Synced entities are read from Dexie. |
| Forms | `@mantine/form` + Zod resolver using `@monevo/contracts` schemas | |
| i18n | **i18next** + react-i18next + `i18next-browser-languagedetector` | |
| PWA | **vite-plugin-pwa** (Workbox, `injectManifest` for the custom push handler) | |
| Drag and drop | **@dnd-kit** (core, sortable) | Dashboard reorder + size presets. No grid-layout engine. |
| Icons | Tabler icons (Mantine's default companion) | Also used for the category icon picker. |
| Socket | `socket.io-client` | |

### Testing
| Level | Proposal |
|---|---|
| Unit | **Vitest** (all packages), **fast-check** for property tests of money and recurrence |
| API integration | Vitest + **Supertest** against a real PostgreSQL (CI service container locally via docker compose `db-test`, or **Testcontainers**) |
| S3 integration | MinIO container (CI service / Testcontainers) |
| Frontend | Vitest + Testing Library. `fake-indexeddb` for sync engine tests |
| E2E | **Playwright** against the built Docker image via compose |
| CI | GitHub Actions (or Forgejo/Gitea Actions, which use a compatible syntax). See [OQ-07](../planning/open-questions.md#oq-07-ci-platform). |

## Explicitly not used

- NestJS (brief). tRPC/GraphQL (the REST API must serve Android and integrations). Redis (not needed at this scale; pg-boss covers queues).
- JWT access tokens for the web session (opaque server-side sessions give instant revocation; see [authentication.md](authentication.md)).
- Lucia (deprecated). A custom crypto/OIDC implementation.
- Floating-point money (`number`) anywhere in domain logic.
- dayjs in our own code (Mantine dates uses it internally; we don't depend on it directly).
- A microservices, event-sourcing, or Kubernetes-oriented design.
