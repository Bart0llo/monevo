# ADR-0016: Local validation; CI platform deferred

- **Status:** Accepted (amendment proposed in [ADR-0019](ADR-0019-release-management.md): image registry and release publishing)
- **Date:** 2026-11-18

## Context

R-INF-04 asked for CI to run the automated tests, and [OQ-07](../planning/open-questions.md#oq-07-ci-platform) recommended GitHub Actions. For the initial development phase, the user decided not to introduce any CI platform: no cloud CI dependency, no usage limits, and no paid runners.

## Decision

- **No CI platform is selected or configured** (no GitHub Actions, Woodpecker CI, Forgejo Actions, or other service, and no CI configuration files in the repository). OQ-07 is **Deferred**.
- All automated checks run **locally** through root scripts ([testing-strategy.md](../development/testing-strategy.md#5-local-validation)):
  - `pnpm validate`: lint, format check, typecheck, i18n check, docs check, unit/component/sync tests, integration tests, and the OpenAPI snapshot diff. It must pass before every merge.
  - `pnpm test:e2e`: builds the image and runs Playwright. It must pass before a stage is submitted for acceptance and before a release.
- Stage reports state which checks ran and their results.
- Where earlier documents or ADRs (for example [ADR-0004](ADR-0004-rest-api-versioning-and-contracts.md) and [ADR-0012](ADR-0012-monorepo-and-shared-packages.md)) mention a "CI" check, it means these local scripts until a CI platform is chosen.
- Image registry and automated image publishing are decided together with the CI platform. Until then, images are built locally ([docker-compose.md](../infrastructure/docker-compose.md)).

## Alternatives considered

- **GitHub Actions (Forgejo-compatible syntax):** the previous recommendation, postponed to avoid cloud CI dependencies and limits during early development.
- **Self-hosted CI (Woodpecker, Forgejo runner):** no usage limits, but infrastructure to run and maintain now.

## Consequences

- Checks are enforced by discipline and the definition of done, not by a merge gate.
- Adding CI later is a thin wrapper that calls the same `pnpm` scripts and `docker compose -f docker-compose.e2e.yml`, so the application architecture and the developer workflow do not change.
- Multi-architecture image builds and vulnerability scans run locally (`docker buildx`, Trivy) for releases.
- R-INF-04 is amended: the automated tests run through the local validation scripts until a CI platform is chosen ([requirements.md](../product/requirements.md#infrastructure)).

## Status

Accepted (user decision on OQ-07, 2026-11-18). Revisit when the project needs a shared merge gate or automated releases.
