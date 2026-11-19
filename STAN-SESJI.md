# Session State: Stage 2 (Identity & Users) ACCEPTED, Stage 3 not started

## Goal
Stage 2 (OIDC-only identity, sessions, settings, admin, personal API tokens; ADR-0020) was explicitly accepted by the user on 2026-11-19. Next up is Stage 3 (currencies, rates, accounts and categories).

## Git state
Stage 2 is committed in `91f47bb`. The acceptance status updates (implementation-stages.md, README.md, this file) go in a follow-up commit.

## Done
- Stage 2 fully implemented and verified: `pnpm validate` EXIT 0, `pnpm test:e2e` 11/11 passed (2026-11-19).
- `docs/planning/implementation-stages.md`: Stage 2 marked "completed and accepted by user (2026-11-19)".
- `README.md` status line: Stages 1 and 2 complete and accepted, Stage 3 not started.

## Left to do / next step
- Stage 3 can't start until [OQ-05](docs/planning/open-questions.md#oq-05-changing-the-base-currency) (changing the base currency) is resolved. Recommendation: allow it as a confirmed recompute job. This needs a user decision.
- After that, plan and implement Stage 3 per `docs/planning/implementation-stages.md`.

## Codebase facts
- Run eslint from the repo root; run `pnpm exec prettier --write <files>` after edits (docs/ is prettier-ignored).
- e2e uses nodenext: relative imports need `.js` extensions. Mock IdP form labels: Username, Name, Email, Groups; buttons Sign in / Deny.
- Integration tests: db-test container `monevo-dev-db-test-1` on 127.0.0.1:5433.

## Pitfalls
- Never put code or non-ASCII through bash heredocs; use Write/Edit.
- Background runs: echo `EXIT $?` into the task output; the reported task exit code belongs to the echo.
- Don't touch the `ac-test-pg` container or the AccountCenter repo.
