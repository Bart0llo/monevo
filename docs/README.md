# Monevo Documentation

This directory is the **source of truth** for Monevo, a self-hosted personal finance application. (Monevo is a working name; see [open questions](planning/open-questions.md#oq-01-product-name).) If the code and these documents disagree, treat it as a defect. Either the code is wrong, or the decision changed and the documents must be updated in the same change.

Start with the root [`CLAUDE.md`](../CLAUDE.md) for the short operational summary.

## Status markers

Every document uses the same markers to keep requirements, decisions, and ideas apart:

| Marker | Meaning |
|---|---|
| **[Accepted]** | A confirmed product requirement or a finalized technical decision. Do not change it without an ADR update. |
| **[Proposed]** | A recommended technical decision that has not been explicitly confirmed. Follow it by default; it may be revised before or during the relevant stage. |
| **[Deferred]** | Planned for after the initial version. Do not build it now, but don't block it architecturally. |
| **[Out of scope]** | Explicitly excluded from the initial version. Do not build it. |
| **[Open]** | An unresolved question, tracked in [planning/open-questions.md](planning/open-questions.md). |

## Map

### Product: what and why
- [product/vision.md](product/vision.md): purpose, principles, target users, positioning against Cashew
- [product/requirements.md](product/requirements.md): numbered requirements (the canonical scope list, including out-of-scope items)
- [product/features.md](product/features.md): feature catalogue by module, with behaviour details
- [product/user-experience.md](product/user-experience.md): navigation, screens, quick/full entry, dashboard, calendar, themes
- [product/terminology.md](product/terminology.md): glossary (**read this first**, because terms are used precisely)

### Architecture: how
- [architecture/overview.md](architecture/overview.md): system context, runtime topology, module map
- [architecture/technology-stack.md](architecture/technology-stack.md): fixed and proposed technology choices
- [architecture/application-structure.md](architecture/application-structure.md): monorepo layout, packages, dependency rules
- [architecture/backend-architecture.md](architecture/backend-architecture.md): Express modular monolith, layers, jobs, events
- [architecture/frontend-architecture.md](architecture/frontend-architecture.md): React/Mantine app, local DB, state, PWA
- [architecture/database-architecture.md](architecture/database-architecture.md): PostgreSQL/Prisma conventions, constraints, migrations
- [architecture/api-design.md](architecture/api-design.md): REST conventions, errors, pagination, idempotency, OpenAPI, realtime
- [architecture/authentication.md](architecture/authentication.md): local auth, OIDC, sessions, account linking
- [architecture/authorization-and-data-isolation.md](architecture/authorization-and-data-isolation.md): ownership enforcement, admin separation
- [architecture/financial-domain-model.md](architecture/financial-domain-model.md): transactions, postings, transfers, pots, goals
- [architecture/multi-currency.md](architecture/multi-currency.md): money representation, exchange rates, conversion and rounding
- [architecture/scheduling-and-calendar.md](architecture/scheduling-and-calendar.md): recurring and planned transactions, occurrences, calendar
- [architecture/forecasting.md](architecture/forecasting.md): projection engine and uncertainty handling
- [architecture/reporting-and-dashboard.md](architecture/reporting-and-dashboard.md): reports, aggregation, dashboard widgets
- [architecture/offline-and-synchronization.md](architecture/offline-and-synchronization.md): offline-first sync protocol and conflicts
- [architecture/notifications.md](architecture/notifications.md): notification center, push, alert rules, insights
- [architecture/file-storage.md](architecture/file-storage.md): attachments, storage drivers, quotas
- [architecture/import-export.md](architecture/import-export.md): user data export and import
- [architecture/administration.md](architecture/administration.md): admin panel scope and boundaries
- [architecture/security.md](architecture/security.md): security controls checklist

### Data
- [data/data-model.md](data/data-model.md): entities and columns (logical schema)
- [data/entity-relationships.md](data/entity-relationships.md): relationship diagram, cascade and deletion rules
- [data/financial-calculations.md](data/financial-calculations.md): exact formulas for balances, budgets, reports, pots, goals

### Infrastructure
- [infrastructure/docker-compose.md](infrastructure/docker-compose.md): image and compose design
- [infrastructure/deployment.md](infrastructure/deployment.md): VPS/homelab deployment, reverse proxy, upgrades
- [infrastructure/backups-and-restoration.md](infrastructure/backups-and-restoration.md): consistent DB and file backups
- [infrastructure/configuration.md](infrastructure/configuration.md): environment variables and runtime settings
- [infrastructure/monitoring-and-logging.md](infrastructure/monitoring-and-logging.md): logs, health, status

### Development
- [development/development-setup.md](development/development-setup.md): local environment
- [development/coding-conventions.md](development/coding-conventions.md): code rules (money, dates, errors, modules)
- [development/testing-strategy.md](development/testing-strategy.md): test pyramid, tools, CI
- [development/internationalization.md](development/internationalization.md): i18n, localization, time zones in UI
- [development/contribution-guidelines.md](development/contribution-guidelines.md): workflow and documentation maintenance

### Planning
- [planning/roadmap.md](planning/roadmap.md): stage overview and dependency graph
- [planning/implementation-stages.md](planning/implementation-stages.md): detailed stages with deliverables and acceptance criteria
- [planning/dependencies.md](planning/dependencies.md): proposed third-party libraries with justification
- [planning/open-questions.md](planning/open-questions.md): unresolved decisions and assumptions

### Decisions
- [decisions/README.md](decisions/README.md): ADR index and process

## Canonical locations

Some topics touch several documents. To avoid contradictions, each fact has exactly one canonical home, and other documents link to it instead of restating it:

| Topic | Canonical document |
|---|---|
| Scope (what is in or out) | [product/requirements.md](product/requirements.md) |
| Term definitions | [product/terminology.md](product/terminology.md) |
| Money precision, rounding, rates | [architecture/multi-currency.md](architecture/multi-currency.md) |
| Balance/budget/report formulas | [data/financial-calculations.md](data/financial-calculations.md) |
| Transaction/transfer/pot model | [architecture/financial-domain-model.md](architecture/financial-domain-model.md) |
| Session lifetimes and cookie settings | [architecture/authentication.md](architecture/authentication.md) |
| Sync protocol and conflict rules | [architecture/offline-and-synchronization.md](architecture/offline-and-synchronization.md) |
| Environment variables | [infrastructure/configuration.md](infrastructure/configuration.md) |
| Stage contents | [planning/implementation-stages.md](planning/implementation-stages.md) |
