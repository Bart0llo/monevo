# ADR-0015: External PostgreSQL

- **Status:** Accepted (amended by [ADR-0018](ADR-0018-postgresql-16-minimum.md): minimum 16)
- **Date:** 2026-11-18

## Context

The original brief placed PostgreSQL in its own container in the Monevo Compose stack (R-INF-01, [ADR-0002](ADR-0002-single-application-image.md)) and pinned PostgreSQL 17 ([ADR-0003](ADR-0003-postgresql-and-prisma.md)). While resolving [OQ-08](../planning/open-questions.md#oq-08-nodejs-and-postgresql-versions), the user decided that PostgreSQL is hosted externally: operators may already run a database server or use a managed service, and the application should not own the database's lifecycle.

## Decision

- PostgreSQL is an **externally hosted database**. Monevo connects to it through the configurable `DATABASE_URL`. The Monevo Compose stack runs the application container and contains **no mandatory PostgreSQL service**. No database host name, credentials, or provider-specific configuration is hard-coded.
- Supported versions: maintained (not end-of-life) PostgreSQL majors that the shipped Prisma release supports, with **PostgreSQL 17 as the minimum**. The project is not pinned to one major.
- Only Prisma-compatible features and the trusted standard extensions `citext`, `pg_trgm`, and `unaccent` are used. Any further extension needs a written justification.
- The application image ships `pg_dump`/`pg_restore` of the newest supported major, which can back up every supported server major.
- Details (connection, TLS, pooling, privileges, upgrades): [postgresql.md](../infrastructure/postgresql.md).

This ADR supersedes the "PostgreSQL runs from the official image on an internal network" and "client major must match the server" parts of ADR-0002, and the fixed "PostgreSQL 17" in ADR-0003. Everything else in those ADRs stands. It amends R-INF-01 and R-INF-02 ([requirements.md](../product/requirements.md#infrastructure)).

## Alternatives considered

- **PostgreSQL container in the Monevo stack** (the original plan): simplest single-host setup, but forces operators who already run PostgreSQL or a managed service to run a second server, and ties database upgrades to Monevo releases.
- **Optional bundled PostgreSQL profile in the production compose file:** convenient, but makes two supported topologies. Development and E2E compose files still provide disposable PostgreSQL containers as test fixtures only.
- **Pinning one major:** simpler testing, but it goes against managed providers' upgrade schedules and soon becomes outdated.

## Consequences

- Operators must provide a reachable PostgreSQL server, a database, and an owning role, and secure the connection (TLS, network restrictions). The documentation gives the requirements and a checklist.
- Monevo can no longer guarantee by itself that the database port is private; R-INF-02 becomes the operator's responsibility for the database side.
- Transaction-mode connection poolers are not supported (advisory locks, `pg_dump`, pg-boss).
- Integration tests run against the minimum supported major, and against the newest supported major before releases.
- Backups (`pg_dump`/`pg_restore` through the same `DATABASE_URL`) and restore are unchanged in design.

## Status

Accepted (user decision on OQ-08, 2026-11-18). Amended by [ADR-0018](ADR-0018-postgresql-16-minimum.md): the minimum supported major is PostgreSQL 16.
