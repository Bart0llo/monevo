# ADR-0003: PostgreSQL and Prisma

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

The brief fixes PostgreSQL and Prisma. Financial data needs exact decimals, strong constraints, and transactional integrity. Some constraints (CHECKs, partial indexes, composite foreign keys) exceed Prisma's schema language.

## Decision

Use **PostgreSQL 17** as the system of record and **Prisma 7** with `@prisma/adapter-pg`. Prisma migrations are generated and then **hand-edited SQL** adds CHECK constraints, partial indexes, composite FKs `(id, user_id)`, and triggers where needed. Amounts are `NUMERIC(19,4)`, rates `NUMERIC(24,12)`. Forward-only migrations run at container start. Reports use parameterized raw SQL. Details: [database-architecture.md](../architecture/database-architecture.md).

## Alternatives considered

- **Drizzle or Kysely:** better SQL control, but Prisma is required.
- **Constraints only in application code:** insufficient for financial integrity.
- **SQLite:** not allowed and weaker for concurrency.

## Consequences

- Migration SQL must be reviewed; Prisma schema and SQL constraints must stay in sync (tests cover the constraints).
- Prisma-generated types never leak into contracts or the web app (R-API-03).

## Status

Accepted.
