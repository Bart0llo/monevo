# Application Structure

**[Proposed]**, see [ADR-0012](../decisions/ADR-0012-monorepo-and-shared-packages.md). Confirm the package manager and layout before Stage 1.

## Repository layout

```text
monevo/
├── CLAUDE.md
├── README.md                    # short operator-facing intro (created in Stage 1)
├── package.json                 # workspace root: scripts only, no runtime deps
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .nvmrc                       # 24
├── Dockerfile                   # single multi-stage image (Stage 1)
├── docker-compose.yml           # production example: app only, external PostgreSQL (Stage 1)
├── docker-compose.dev.yml       # dev only: local postgres, minio, mailpit
├── .env.example
├── apps/
│   ├── server/                  # Express API + static hosting + jobs
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   ├── main.ts          # process entry: config → db → jobs → http
│   │   │   ├── app.ts           # express app factory (testable, no listen)
│   │   │   ├── cli.ts           # create-admin, backup, restore, reset-password-link
│   │   │   ├── config/          # env parsing (Zod), runtime settings
│   │   │   ├── infra/           # prisma client, logger, mailer, storage drivers, job runner, socket
│   │   │   ├── http/            # middleware: auth, csrf, validation, errors, rate limit
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── users/
│   │   │   │   ├── accounts/
│   │   │   │   ├── transactions/
│   │   │   │   └── …            # one folder per module (see overview.md)
│   │   │   └── openapi/         # registry assembly, swagger mount
│   │   └── test/                # integration tests, fixtures, isolation suite
│   └── web/                     # React PWA
│       ├── index.html
│       ├── public/              # icons, manifest assets
│       └── src/
│           ├── main.tsx
│           ├── app/             # providers, router, theme, layout shell
│           ├── features/        # one folder per feature (transactions, budgets, …)
│           ├── data/            # Dexie schema, sync engine, repositories, query client
│           ├── components/      # shared presentational components
│           ├── lib/             # formatting, money input, hooks
│           ├── i18n/            # i18next setup (resources from @monevo/i18n)
│           └── sw.ts            # service worker (injectManifest)
├── packages/
│   ├── contracts/               # @monevo/contracts – Zod schemas = API DTOs, error codes, sync envelopes
│   ├── domain/                  # @monevo/domain – pure logic: money, currency, recurrence, budgets, forecast, balances
│   └── i18n/                    # @monevo/i18n – locale JSON (pl, en), shared keys for server-rendered push text
├── e2e/                         # Playwright tests (run against the docker image)
└── docs/
```

## Package responsibilities and dependency rules

```
apps/web ─────┐
              ├──► @monevo/contracts ──► @monevo/domain (types such as Money, LocalDate)
apps/server ──┤
              ├──► @monevo/domain
              └──► @monevo/i18n
```

| Package | Contains | Must not contain |
|---|---|---|
| `@monevo/domain` | Money type and arithmetic (decimal.js), ISO 4217 currency table (code, exponent), conversion and rounding, `LocalDate` utilities, time zone helpers, recurrence expansion, budget period math, balance and pot calculations, forecast projection engine, sync merge helpers (field diff/merge). | I/O, Prisma, Express, React, `Date.now()` without injection (time is always passed in). |
| `@monevo/contracts` | Zod schemas for every request/response DTO, the sync mutation and change envelopes, error code enum, pagination types, shared enums (TransactionType, …), OpenAPI metadata. | Business logic, Prisma types. |
| `@monevo/i18n` | `locales/{en,pl}/*.json` namespaces, key type generation. | Code beyond a tiny loader. |
| `apps/server` | HTTP, persistence, jobs, integrations. | React, browser APIs. |
| `apps/web` | UI, local DB, sync client, service worker. | Prisma, Node-only APIs. |

Rules:
1. Packages are consumed as TypeScript source via workspace protocol (`"@monevo/domain": "workspace:*"`) and built by each app's bundler. There is no separate publish step.
2. `domain` must have ≥ 90% branch coverage on money, recurrence, and forecast functions (it is cheap to test and critical).
3. Prisma-generated types never cross into `contracts` or `web`. Mapping from DB rows to DTOs happens in server module mappers.
4. A dependency from one backend module to another goes through that module's exported **service interface** (`modules/<m>/index.ts`), never its repository or tables directly. Read-only reporting queries are the exception: `reports`, `insights`, and `forecast` may run read-only SQL across tables owned by other modules, through their own query files.

## Backend module folder convention

```text
modules/transactions/
├── index.ts                 # public surface: service interface, command handler registrations
├── transactions.routes.ts   # express router: path → validate → handler → DTO
├── transactions.service.ts  # commands & queries (application layer), opens DB transactions
├── transactions.repo.ts     # Prisma access, always scoped by userId
├── transactions.mapper.ts   # DB row ↔ DTO
├── transactions.sync.ts     # sync entity adapter (serialize, apply mutation, merge policy)
├── transactions.openapi.ts  # route registrations for OpenAPI
└── __tests__/               # unit tests for module-level logic
```

## Frontend feature folder convention

```text
features/transactions/
├── routes.tsx               # route objects
├── components/              # feature components (QuickEntry, TransactionForm, …)
├── hooks/                   # useTransactions (Dexie liveQuery), useTransactionHistory (TanStack Query)
├── model/                   # view-model helpers, form schemas (from contracts)
└── __tests__/
```
