# Coding Conventions

**[Proposed]**, enforced by lint rules and review from Stage 1. When a rule here conflicts with an architecture document, the architecture document wins and this file is fixed.

## 1. General

- TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. ESM only. No `any` (use `unknown` and narrow); `// eslint-disable` needs a reason comment.
- Prettier formatting, no style debates in review. ESLint (typescript-eslint, `import` ordering, `react-hooks`).
- Names: files `kebab-case` except React components (`PascalCase.tsx`) and module files (`transactions.service.ts`); types and components `PascalCase`; functions and variables `camelCase`; constants and enum-like unions `UPPER_SNAKE`; DB columns camelCase in Prisma, mapped to snake_case tables and columns ([database-architecture.md](../architecture/database-architecture.md)).
- Small modules with explicit exports. No default exports except React route components where the router requires them.
- Comments explain *why*, not *what*. Reference a requirement ID or doc section for non-obvious rules (`// R-TX-04, see financial-domain-model.md#transfers`).

## 2. Money (non-negotiable)

Canonical rules: [multi-currency.md](../architecture/multi-currency.md), [ADR-0007](../decisions/ADR-0007-money-and-multi-currency.md).

- Never represent money as `number`. Use the `Money`/`Decimal` types from `@monevo/domain`. In JSON, amounts are **decimal strings**.
- Never use `+ - * /`, `Math.round`, `toFixed`, `parseFloat`, or `Number()` on amounts. Lint rule `monevo/no-float-money` flags arithmetic on identifiers or properties named like amounts (`amount`, `balance`, `limit`, `rate`, `total`, …) and flags `parseFloat`/`Number` on them.
- Round only where the canonical doc says, with `ROUND_HALF_UP` to the currency exponent.
- Sums go through `sumMoney()` (same currency enforced) or a SQL `SUM` over `NUMERIC`.
- Money input components pass the raw string to the decimal parser; never let an `<input type="number">` produce a float.

## 3. Dates and time

Canonical rules: [scheduling-and-calendar.md](../architecture/scheduling-and-calendar.md#5-time-zones), [internationalization.md](internationalization.md#time-zones).

- Calendar dates (`occurredOn`, occurrence dates, budget periods) are `LocalDate` strings `YYYY-MM-DD`, never `Date` objects. Instants are ISO 8601 UTC strings in the API and `timestamptz` in the DB.
- No `new Date()` or `Date.now()` in services or `@monevo/domain`: take a `Clock` (server) or pass `now` in. Lint rule `monevo/no-ambient-time` bans them outside `infra/clock.ts` and tests.
- "Today" for a user is `clock.today(user.timeZone)`.
- date-fns + `@date-fns/tz` only; no moment, no dayjs in our code.

## 4. Data isolation

Canonical rules: [authorization-and-data-isolation.md](../architecture/authorization-and-data-isolation.md), [ADR-0006](../decisions/ADR-0006-user-data-isolation.md).

- `userId` comes from `ctx` (the session) only. Request schemas for owned resources must not contain `userId`; a contract test fails if one does.
- Repositories for owned tables take `userId` as a required first argument and include it in every `where`. Lint rule `monevo/no-unscoped-prisma` bans direct `prisma.<ownedModel>` calls outside `*.repo.ts`.
- Foreign IDs return 404, never 403.
- `$queryRawUnsafe` and `$executeRawUnsafe` are banned. Raw SQL uses tagged templates.

## 5. Backend

- Layers and module boundaries as in [backend-architecture.md](../architecture/backend-architecture.md) and [application-structure.md](../architecture/application-structure.md#package-responsibilities-and-dependency-rules). Cross-module calls go through the module's `index.ts`; enforced with `eslint-plugin-boundaries` (or `dependency-cruiser`).
- Every write is a **command** run through `executeCommand` (one DB transaction with audit, change log, and idempotency). REST handlers and sync mutations call the same command handler.
- Validate all input with the Zod schema from `@monevo/contracts`; never trust `req.body` types.
- Throw `AppError(code, status, details)` with a code from the contracts error enum. Never send ad-hoc error JSON. Never put user input or internals in `detail` text that reaches other users.
- Side effects after commit only (events buffered by `executeCommand`), and anything durable goes through a table or a pg-boss job.
- Logging: use the request/job logger (`ctx.log`), structured fields, no sensitive data ([monitoring-and-logging.md](../infrastructure/monitoring-and-logging.md#what-must-never-be-logged)).

## 6. API

- Follow [api-design.md](../architecture/api-design.md): plural kebab-case paths, camelCase JSON, cursor pagination, RFC 9457 problems with `code`, `If-Match` versions, `Idempotency-Key` on creates.
- Every route registers its OpenAPI definition next to the router (`*.openapi.ts`). A route without a registration fails a test.
- Breaking changes to `v1` are not allowed; the OpenAPI snapshot diff (`pnpm openapi:check`) flags removals and type changes.

## 7. Database

- Schema changes only through Prisma migrations, reviewed SQL, with CHECK constraints and composite FKs as in [database-architecture.md](../architecture/database-architecture.md).
- Expand → migrate → contract for renames and drops across releases.
- Every new owned table: `userId`, composite FK `(id, user_id)` targets where referenced, `version`, `createdAt`/`updatedAt`, change-log integration if synced, and a row in [data-model.md](../data/data-model.md).

## 8. Frontend

- Feature folders as in [application-structure.md](../architecture/application-structure.md#frontend-feature-folder-convention). Components are function components with hooks.
- Synced entities are read from Dexie (`useLiveQuery`) and written through the local repository + outbox; never call the REST endpoint for them directly. Server-only data uses TanStack Query ([frontend-architecture.md](../architecture/frontend-architecture.md)).
- All user-visible text through `t()` with typed keys; no string literals in JSX (lint rule `i18next/no-literal-string` for `apps/web/src/features`).
- Format money and dates only through `lib/format` helpers.
- Mantine components and theme tokens; no hard-coded colors (dark mode). Accessible names for icon-only buttons.
- Charts always have an accessible summary or data table alternative.

## 9. Tests

- Each bug fix comes with a test that fails without the fix. Test conventions: [testing-strategy.md](testing-strategy.md).
- Test names describe behaviour (`it('clamps the 31st to the last day of February')`).

## 10. Dependencies

New runtime dependencies need a justification in [dependencies.md](../planning/dependencies.md) (maintenance, license, size, alternatives). Prefer the platform and existing dependencies.
