# ADR-0006: User data isolation

- **Status:** Accepted (amended by [ADR-0017](ADR-0017-personal-api-tokens.md))
- **Date:** 2026-11-18

## Context

Multiple users share one instance; each has exactly one private workspace (R-GEN-04). Every operation must enforce ownership from the authenticated identity (R-SEC-01), and admins must not see financial data (R-ADM-05).

## Decision

- Every owned table has `userId`; the user ID comes **only from the session** (`ctx.userId`).
- Repositories require `userId` and scope every query; lint bans unscoped access to owned models.
- **Composite foreign keys `(id, user_id)`** between owned tables make cross-user references impossible at the database level.
- Foreign IDs return **404**.
- An **automated isolation test suite** iterates the OpenAPI registry.
- Admin endpoints return operational data only.
- PostgreSQL row-level security is **[Deferred]** as defense in depth.

Details: [authorization-and-data-isolation.md](../architecture/authorization-and-data-isolation.md).

## Alternatives considered

- **Schema or database per user:** strong isolation but heavy migrations and operations.
- **RLS now:** valuable, but complicates Prisma connection handling and testing; deferred.
- **Checks only in route handlers:** easy to forget.

## Consequences

- Slightly more complex keys and FKs.
- Isolation regressions are caught automatically for new routes.

## Status

Accepted.
