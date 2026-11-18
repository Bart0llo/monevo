# ADR-0018: PostgreSQL 16 as the minimum supported major

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

[ADR-0015](ADR-0015-external-postgresql.md) made PostgreSQL an external database and set **PostgreSQL 17** as the minimum supported major. Many operators and managed providers still run PostgreSQL 16, which is maintained by the PostgreSQL Global Development Group until November 2028. Requiring 17 forces those operators to upgrade their database server before they can install Monevo, although nothing in Monevo needs a 17-only feature:

- Prisma 7 supports PostgreSQL 16, and the migrations use only plain SQL (tables, CHECK constraints, indexes, seed `INSERT`s) available long before 16.
- Raw SQL in the server (`current_setting('server_version_num')`, `to_regclass`, `SELECT 1`) works on every supported major.
- pg-boss requires PostgreSQL 13 or newer.
- The extensions `citext`, `pg_trgm`, and `unaccent` are trusted in 16.
- `pg_dump`/`pg_restore` of the newest supported major (18, in the image) can dump and restore 16 servers.
- The test setup uses `DROP DATABASE ... WITH (FORCE)`, available since PostgreSQL 13.

## Decision

- **PostgreSQL 16 is the minimum supported major.** The supported range is 16 to the newest major tested with the release (currently 18). The rest of the version policy in ADR-0015 is unchanged: only maintained majors that the shipped Prisma release supports.
- The startup check stays explicit: `MIN_SUPPORTED_MAJOR = 16` and `NEWEST_SUPPORTED_MAJOR = 18` in `apps/server/src/infra/database.ts`. Below 16 the server refuses to start; above 18 it starts with a warning ([postgresql.md](../infrastructure/postgresql.md#supported-versions)).
- Schema, migrations, and raw SQL must not use features that need PostgreSQL 17 or newer (for example `JSON_TABLE`, the SQL/JSON query functions, `MERGE ... RETURNING`, `uuidv7()`, `OLD`/`NEW` in `RETURNING`). A feature like that needs a new ADR, either raising the minimum or naming a compatible PostgreSQL 16 alternative.
- Integration and E2E tests run against PostgreSQL 16 (the minimum) by default, and against the newest supported major before a release.

This ADR supersedes the "PostgreSQL 17 as the minimum" part of ADR-0015. Everything else in ADR-0015 stands.

## Alternatives considered

- **Keep 17 as the minimum:** no extra test target, but excludes operators on a maintained major without a technical reason.
- **Drop the version check:** simpler, but unsupported majors would fail later with unclear errors (missing features, incompatible `pg_dump`).
- **Support 15 as well:** maintained until November 2027, but closer to end-of-life, and no operator need for it was raised. It can be added by a new ADR.

## Consequences

- PostgreSQL 16 operators can run Monevo without upgrading their database.
- Developers can't use PostgreSQL 17+ features without a new ADR. Testing against the minimum major catches accidental use.
- The minimum must be raised by November 2028 at the latest, when PostgreSQL 16 reaches end-of-life ([postgresql.md](../infrastructure/postgresql.md#supported-versions)).

## Status

Accepted (user decision, 2026-11-18).
