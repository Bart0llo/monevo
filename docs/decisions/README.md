# Architecture Decision Records

Significant or hard-to-reverse decisions are recorded here as ADRs. The summary table of decisions is also in [overview.md](../architecture/overview.md#key-architectural-decisions).

## Index

| ADR | Title | Status |
|---|---|---|
| [ADR-0001](ADR-0001-express-modular-monolith.md) | Express modular monolith | Accepted |
| [ADR-0002](ADR-0002-single-application-image.md) | Single application image | Accepted (amended by ADR-0015) |
| [ADR-0003](ADR-0003-postgresql-and-prisma.md) | PostgreSQL and Prisma | Accepted (amended by ADR-0015) |
| [ADR-0004](ADR-0004-rest-api-versioning-and-contracts.md) | REST API, versioning and contracts | Accepted |
| [ADR-0005](ADR-0005-authentication-and-sessions.md) | Authentication and sessions | Proposed (extended by ADR-0017) |
| [ADR-0006](ADR-0006-user-data-isolation.md) | User data isolation | Accepted (amended by ADR-0017) |
| [ADR-0007](ADR-0007-money-and-multi-currency.md) | Money and multi-currency | Accepted |
| [ADR-0008](ADR-0008-transaction-and-transfer-model.md) | Transaction and transfer model | Accepted |
| [ADR-0009](ADR-0009-offline-synchronization.md) | Offline synchronization | Proposed |
| [ADR-0010](ADR-0010-file-storage-abstraction.md) | File storage abstraction | Accepted |
| [ADR-0011](ADR-0011-backup-and-restore.md) | Backup and restore | Proposed |
| [ADR-0012](ADR-0012-monorepo-and-shared-packages.md) | Monorepo and shared packages | Accepted |
| [ADR-0013](ADR-0013-scheduled-transactions-and-jobs.md) | Scheduled transactions and jobs | Proposed |
| [ADR-0014](ADR-0014-virtual-savings-pots.md) | Virtual savings pots | Accepted |
| [ADR-0015](ADR-0015-external-postgresql.md) | External PostgreSQL | Accepted (amended by ADR-0018) |
| [ADR-0016](ADR-0016-local-validation-ci-deferred.md) | Local validation; CI platform deferred | Accepted (amendment proposed in ADR-0019) |
| [ADR-0017](ADR-0017-personal-api-tokens.md) | Personal API tokens | Proposed |
| [ADR-0018](ADR-0018-postgresql-16-minimum.md) | PostgreSQL 16 as the minimum supported major | Accepted |
| [ADR-0019](ADR-0019-release-management.md) | Release management and image publishing | Proposed |

## Process

1. Copy the template below to `ADR-NNNN-short-slug.md` with the next number.
2. Status starts as **Proposed**. It becomes **Accepted** when the user confirms it (or when the decision is fixed by the project brief).
3. ADRs are **append-only**. To change a decision, write a new ADR that **supersedes** the old one and set the old one's status to `Superseded by ADR-NNNN`. Only typo fixes and status changes edit an existing ADR.
4. Update the affected architecture documents and [overview.md](../architecture/overview.md#key-architectural-decisions) in the same change ([contribution-guidelines.md](../development/contribution-guidelines.md#3-documentation-maintenance)).

Statuses: `Proposed`, `Accepted`, `Accepted (amended by ADR-NNNN)` (a later ADR replaces part of it), `Proposed (extended by ADR-NNNN)` (a later ADR adds to it without replacing it), `Accepted (amendment proposed in ADR-NNNN)` (a proposed ADR would replace part of it once accepted), `Superseded by ADR-NNNN`, `Rejected`.

## Template

```markdown
# ADR-NNNN: Title

- **Status:** Proposed
- **Date:** YYYY-MM-DD

## Context
## Decision
## Alternatives considered
## Consequences
## Status
```
