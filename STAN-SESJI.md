# Session State: Stage 2 (Identity & Users): OIDC-only — COMPLETE, awaiting acceptance

## Goal
Stage 2 of Monevo with OIDC-only authentication via Account Center (user decision 2026-11-19, ADR-0020 supersedes ADR-0005; OQ-03/06/22 resolved). Local auth (argon2, SMTP, registration, password reset, email verification, BOOTSTRAP_ADMIN_EMAIL, password reauth) is cancelled.

Constraints: branch `master` only; no branch/commit/push/tag. Stay in Stage 2. Don't touch the `ac-test-pg` container, the AccountCenter repo, or existing ADR texts (status lines only).

## Git state
Session 9 (2026-11-19): nothing committed. `master`, HEAD `6fc1a48`. All Stage 2 work is uncommitted, waiting for the user's review.

## Done (all items 1–11)
- Docs sweep + ADR-0020, deps, schema + migration `20261119000000_identity`, config/env/compose, server code, CLI + `sessions.purge` job, `tools/mock-idp/`, web code, web unit tests, E2E specs, docs.
- Session 9:
  - Fixed E2E selectors: `e2e/tests/support/auth.ts` (exact labels `Username`/`Name`, exact `Sign in` button); `e2e/tests/auth.spec.ts` (admin page uses the heading role for "Identity provider").
  - Formatted with prettier: docker-compose.e2e.yml, packages/contracts/src/{index,me,problem}.ts.
  - `docs/planning/implementation-stages.md`: Stage 2 `**Status:** completed, awaiting acceptance`.
  - **`pnpm test:e2e`: 11/11 passed, EXIT 0.**
  - **`pnpm validate`: EXIT 0.** Unit tests: i18n 4, eslint-plugin 35, domain 66, contracts 7, server 155, web 26; test:release 26; integration 94; i18n/docs/openapi checks passed.
  - Stage notification sent (completed, acceptance pending).

## Left to do
- Nothing in Stage 2. Wait for the user's manual review and acceptance. Don't start Stage 3 until Stage 2 is accepted.

## Codebase facts
- Run eslint from the repo root; run `pnpm exec prettier --write <files>` after edits (docs/ is prettier-ignored).
- e2e uses nodenext: relative imports need `.js` extensions. Mock IdP form labels: Username, Name, Email, Groups; buttons Sign in / Deny.
- Integration tests: db-test container `monevo-dev-db-test-1` on 127.0.0.1:5433.

## Pitfalls
- Never put code or non-ASCII through bash heredocs; use Write/Edit.
- Background runs: echo `EXIT $?` into the task output; the reported task exit code belongs to the echo.
