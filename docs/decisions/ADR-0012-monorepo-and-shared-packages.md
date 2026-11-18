# ADR-0012: Monorepo and shared packages

- **Status:** Proposed
- **Date:** 2026-11-18

## Context

The server and web app share DTO schemas, money and date logic, recurrence expansion, forecast and merge logic, and translations. Duplicating them would cause financial inconsistencies between online and offline results.

## Decision

A **pnpm workspaces monorepo**: `apps/server`, `apps/web`, `packages/contracts` (Zod DTOs, error codes, sync envelopes), `packages/domain` (pure financial and date logic), `packages/i18n` (translations), and `e2e/`. Packages are consumed as TypeScript source (`workspace:*`), not published. Details: [application-structure.md](../architecture/application-structure.md). Confirm with [OQ-02](../planning/open-questions.md#oq-02-package-manager-and-repository-layout).

## Alternatives considered

- **npm workspaces:** fewer tools, weaker dependency isolation.
- **Nx or Turborepo:** useful caching, but unnecessary at this size (can be added later).
- **Separate repositories:** require publishing and version coordination of the shared packages.

## Consequences

- One CI pipeline and one lockfile.
- Dependency rules between packages must be enforced (lint).

## Status

Proposed. Confirm before the stage that first depends on it (see [open-questions.md](../planning/open-questions.md)); until then it is the default.
