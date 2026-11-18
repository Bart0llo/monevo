# Testing Strategy

**[Accepted]** the relevant automated tests run through local validation scripts; no CI platform is selected yet (R-INF-04, [ADR-0016](../decisions/ADR-0016-local-validation-ci-deferred.md), [OQ-07](../planning/open-questions.md#oq-07-ci-platform) deferred). **[Proposed]** tools and structure ([technology-stack.md](../architecture/technology-stack.md#testing)).

## 1. Principles

1. **Financial correctness is tested hardest.** Money math, rounding, conversion, balances, budgets, recurrence, and forecast have exhaustive unit tests plus property tests.
2. **Real PostgreSQL for integration tests.** Constraints, composite FKs, locking, and `NUMERIC` behaviour are part of the design; mocks would hide them.
3. **Isolation is tested automatically**, not per endpoint by hand.
4. **Deterministic time.** An injected clock everywhere; no test depends on the wall clock or the host time zone (`pnpm validate` runs the unit tests a second time with `TZ=Pacific/Auckland` to catch accidental local-time use).
5. **Tests are part of every stage's acceptance criteria** ([implementation-stages.md](../planning/implementation-stages.md)).

## 2. Levels

| Level | Tooling | Scope | Runs |
|---|---|---|---|
| Unit | Vitest, fast-check | `@monevo/domain`, `@monevo/contracts`, server services with fakes, web hooks and utilities | `pnpm validate` |
| Component | Vitest + Testing Library + MSW | Web components and feature flows without a server | `pnpm validate` |
| Sync client | Vitest + `fake-indexeddb` + MSW | Dexie repositories, outbox, merge, conflict handling | `pnpm validate` |
| API integration | Vitest + Supertest + PostgreSQL at the minimum supported major ([postgresql.md](../infrastructure/postgresql.md#supported-versions); local `db-test` container or Testcontainers) | Every endpoint and sync mutation through `createApp`, jobs with an injected clock | `pnpm validate`; before a release also against the newest supported major |
| Storage integration | Vitest + an S3-compatible server (MinIO planned; replacement pending [OQ-23](../planning/open-questions.md#oq-23-s3-compatible-server-for-development-and-tests)) | Driver contract suite for `local` and `s3` | `pnpm validate` |
| E2E | Playwright against the built Docker image (`docker-compose.e2e.yml`: app + disposable PostgreSQL fixture + mailpit; the S3 service is pending [OQ-23](../planning/open-questions.md#oq-23-s3-compatible-server-for-development-and-tests)) | Critical user journeys, offline, PWA, multi-device sync | `pnpm test:e2e`, before stage acceptance and releases |
| Contract | OpenAPI snapshot diff | Breaking-change detection | `pnpm validate` |

## 3. What must be covered

### Domain (`@monevo/domain`)

- ≥ 90% branch coverage on money, recurrence, budget periods, balances, and forecast ([application-structure.md](../architecture/application-structure.md#package-responsibilities-and-dependency-rules)).
- Property tests: conversion round-trips within one minor unit; `sum(split) == total` after allocation; recurrence expansion is monotonic, within bounds, and month-end clamping never skips a month; budget periods tile the timeline without gaps or overlaps.
- Table tests for every formula in [financial-calculations.md](../data/financial-calculations.md), with the worked examples from that document as fixtures.

### Server

- Each command: happy path, validation (422 with field paths), version conflict (409), idempotent replay, audit row, change log row.
- **Isolation suite**: iterates the OpenAPI registry; for every route with an owned-resource parameter, user B gets 404 for user A's IDs, and list endpoints never return A's rows. New routes are covered automatically; a route can only be excluded with an explicit reason ([authorization-and-data-isolation.md](../architecture/authorization-and-data-isolation.md)).
- **API token suite**: every route declares its token permissions or is never available to tokens; missing permissions → 403; the isolation suite also runs with token authentication ([api-tokens.md](../architecture/api-tokens.md#8-testing)).
- **Admin suite**: non-admins get 403 on every admin route; admin response schemas contain no financial fields ([administration.md](../architecture/administration.md#6-testing)).
- Jobs: recurring generation idempotency under concurrent runs, DST boundaries, reminders at the user's time, deactivated users skipped.
- Security: CSRF required for cookie-authenticated unsafe methods, rate limits, upload limits, redaction ([monitoring-and-logging.md](../infrastructure/monitoring-and-logging.md#6-testing)).
- Migrations: apply from empty and from the previous release's schema (integration tests in `pnpm validate`).

### Web

- Quick and full entry, money input per locale (`1 234,56` in Polish), form validation messages from translation keys.
- Sync engine: offline create/edit/delete, replay after reconnect, conflict surfacing, re-bootstrap on `410`.
- Accessibility: `@axe-core/playwright` checks on the main screens in both themes (no serious or critical violations).

### E2E journeys (minimum set for v1.0)

Registration and first-user admin; onboarding; account and category setup; quick entry of expense/income/transfer; offline entry and sync; second device sees changes; conflict resolution; recurring transaction AUTO and CONFIRM; budget threshold notification; attachment upload and preview; report and CSV export; dashboard customization; user export/import; admin deactivate user; backup and restore drill; Polish and English UI.

## 4. Test data and environment

- Factories (`test/factories/*`) build valid entities through the domain/command layer, not raw inserts, so constraints and change logs stay realistic.
- Each integration test file gets a fresh schema (template database cloned per worker) for parallelism and isolation.
- External services are faked behind interfaces: rate provider, mailer (Mailpit in E2E), push (a fake endpoint server), OIDC (a mock issuer using `oauth4webapi` test helpers or a minimal local issuer).
- No real network calls in tests: every external service is faked as above.

## 5. Local validation

**[Accepted]** No CI platform is selected or configured ([ADR-0016](../decisions/ADR-0016-local-validation-ci-deferred.md); [OQ-07](../planning/open-questions.md#oq-07-ci-platform) is deferred). Every check runs locally through root scripts ([development-setup.md](development-setup.md#4-root-scripts)):

```
pnpm validate
 ├─ db:generate (prisma generate) · lint · format:check · typecheck · i18n:check · docs:check
 ├─ unit + component + sync client (coverage report, domain threshold enforced; unit tests again with TZ=Pacific/Auckland)
 ├─ integration (local db-test PostgreSQL from docker-compose.dev.yml, or Testcontainers; S3 server pending OQ-23)
 └─ openapi:check (snapshot diff)

pnpm test:e2e
 └─ build image (host architecture) ─► e2e (Playwright, traces on failure)

release only (manual): integration against the newest supported PostgreSQL major, multi-arch build (docker buildx), image scan (Trivy)
```

- `pnpm validate` must pass before every merge to `main`. `pnpm test:e2e` must pass before a stage is submitted for acceptance and before a release. Stage reports list what ran and the results.
- `pnpm audit --prod` runs before releases: low/moderate findings are non-blocking; high/critical findings block unless reviewed ([security.md](../architecture/security.md#dependencies)).
- Flaky tests are quarantined with an issue link, never silently retried forever.
- A CI platform can be added later as a thin wrapper that runs the same scripts and compose files, without changing the architecture or this workflow.

## 6. Manual verification

Each stage ends with a short manual acceptance pass by the user against the stage's acceptance criteria; automated checks do not replace it. Before v1.0: a security review pass against [security.md](../architecture/security.md), a restore drill, and a PWA install check on Android Chrome and desktop Chromium/Firefox, plus iOS Safari (best effort).
