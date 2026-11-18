# CLAUDE.md

Monevo (working name, [OQ-01](docs/planning/open-questions.md#oq-01-product-name)) is a self-hosted, offline-first personal finance PWA. It is multi-user, but each user's financial data is strictly private. This file is the short entry point. The [`docs/`](docs/README.md) tree is the source of truth: when this file and the docs disagree, the docs win, so fix this file.

## Before you start

1. Read [docs/README.md](docs/README.md) (map, status markers, canonical locations) and [terminology.md](docs/product/terminology.md).
2. Find the current stage in [implementation-stages.md](docs/planning/implementation-stages.md). Work only on that stage. A stage starts after the previous one is accepted and its open questions are resolved ([open-questions.md](docs/planning/open-questions.md)).
3. Build only what [requirements.md](docs/product/requirements.md) puts in scope. `[Deferred]` and `[Out of scope]` items are not built. Don't make product decisions the docs leave open: add them to open-questions.md instead.

## Stack (summary)

pnpm monorepo: `apps/server` (Node 24, Express 5, Prisma 7, PostgreSQL 17, pg-boss, Socket.IO), `apps/web` (React, Mantine 8, Dexie, TanStack Query, PWA), `packages/contracts` (Zod 4 → OpenAPI 3.1), `packages/domain` (pure financial and scheduling logic), `packages/i18n` (en, pl), `e2e/`. Details: [technology-stack.md](docs/architecture/technology-stack.md), [application-structure.md](docs/architecture/application-structure.md), [dependencies.md](docs/planning/dependencies.md).

## Architecture (summary)

One container runs a modular monolith: static web app, REST API `/api/v1`, realtime, and in-process jobs, backed by PostgreSQL and a storage driver (local or S3) ([overview.md](docs/architecture/overview.md), [ADR-0001](docs/decisions/ADR-0001-express-modular-monolith.md), [ADR-0002](docs/decisions/ADR-0002-single-application-image.md)). The browser keeps a local replica and syncs by cursor ([offline-and-synchronization.md](docs/architecture/offline-and-synchronization.md)).

## Non-negotiable rules

- **Money:** never use JS floats for amounts. Use decimal strings in JSON and decimal.js in code, with the precision and rounding in [multi-currency.md](docs/architecture/multi-currency.md). Formulas live only in [financial-calculations.md](docs/data/financial-calculations.md); the ledger model is in [financial-domain-model.md](docs/architecture/financial-domain-model.md).
- **Dates:** a transaction's `occurredOn` is a calendar date; recurrence works on local dates in the user's time zone ([coding-conventions.md](docs/development/coding-conventions.md#3-dates-and-time), [scheduling-and-calendar.md](docs/architecture/scheduling-and-calendar.md)).
- **Isolation:** `userId` comes from the session only. Use user-scoped repositories. Foreign IDs return 404. Admins never see other users' financial data. Every owned endpoint is covered by the isolation test suite ([authorization-and-data-isolation.md](docs/architecture/authorization-and-data-isolation.md)).
- **Auth:** server-side sessions, CSRF header, optional OIDC ([authentication.md](docs/architecture/authentication.md)). Security checklist: [security.md](docs/architecture/security.md).
- **API:** contracts are defined in `@monevo/contracts` first; errors are problem+json with a stable `code`; plus cursor pagination, `Idempotency-Key`, and `If-Match` versions ([api-design.md](docs/architecture/api-design.md)). Breaking changes need a new API version.
- **Schema:** follow [database-architecture.md](docs/architecture/database-architecture.md) and keep [data-model.md](docs/data/data-model.md) and [entity-relationships.md](docs/data/entity-relationships.md) in sync with migrations.
- **Configuration:** every environment variable and runtime setting is listed in [configuration.md](docs/infrastructure/configuration.md). Environment values override admin settings.

## Docker and operations

Image and compose: [docker-compose.md](docs/infrastructure/docker-compose.md). Deployment, reverse proxy and upgrades: [deployment.md](docs/infrastructure/deployment.md). Backups: [backups-and-restoration.md](docs/infrastructure/backups-and-restoration.md). Logs and health: [monitoring-and-logging.md](docs/infrastructure/monitoring-and-logging.md).

## Development

- Setup and commands: [development-setup.md](docs/development/development-setup.md).
- Code rules: [coding-conventions.md](docs/development/coding-conventions.md).
- Tests (Vitest, real PostgreSQL for integration tests, Playwright against the Docker image): [testing-strategy.md](docs/development/testing-strategy.md). Bug fixes come with a regression test.
- i18n: every user-visible string exists in `en` and `pl` ([internationalization.md](docs/development/internationalization.md)).
- Workflow, definition of done, commits: [contribution-guidelines.md](docs/development/contribution-guidelines.md). Never commit secrets, `.env` files or real financial data.

## Keeping docs current

- Update docs in the same change as the code. A mismatch between code and docs is a defect.
- Each fact has one canonical home ([canonical locations](docs/README.md#canonical-locations)). Link to it; don't copy it.
- Changing an `[Accepted]` decision requires an ADR ([decisions/README.md](docs/decisions/README.md)).
- Links are relative and anchors must exist (`pnpm docs:check`, from Stage 1).
- Keep this file short. Change it only when a top-level rule changes ([contribution-guidelines.md](docs/development/contribution-guidelines.md#3-documentation-maintenance)).
