# Session State: Stage 1 (Foundation): complete, awaiting user acceptance (session 12)

## Goal
Stage 1 per `docs/planning/implementation-stages.md#stage-1-foundation`. No Stage 2+ work. No commits unless the user asks.

## Git
Branch `master` (agreed workflow; no feature branches). `stage-1-foundation` was deleted (it pointed at the same commit `56c59d2`). All Stage 1 review work is uncommitted on `master`, plus the untracked `.gitattributes`. About 67 files appear modified in `git status` with blobs identical to HEAD (line-ending stat leftovers).

## Done (uncommitted)
- Windows/fresh-clone validation fixes, flake fixes, owed docs, OQ-23 (session 12 part 1).
- Lint: `import-x/order`, `boundaries/dependencies` (package rules + backend module entry points: other code reaches `apps/server/src/modules/<m>` only through `index.ts`; same-module imports free), `boundaries/no-unknown-files`. Verified with temporary violation files (deleted).
- `HTTP_COMPRESSION` implemented: `compression` 1.8.2 (+ `@types/compression`), config key `httpCompression`, `app.ts` mounts it when true, startup log field, 3 new tests, `.env.example` comment, dependencies.md row.
- Final results: `pnpm validate` PASS (229 unit ×2, 10 integration, openapi up to date, docs:check 791 links). `pnpm test:e2e` PASS (smoke test + Playwright 5/5). Dev stack shut down again; `ac-test-pg` untouched.

## Remaining
- User acceptance of Stage 1; commit only if the user asks.

## Known limitations
- Test files in `domain`/`web` cannot import Node core modules (no test exemption in the boundaries config); none do today.

## Pitfalls
- eslint-plugin-boundaries reads the legacy `import/resolver` setting; element patterns need `partialMatch: false` with full repo-relative paths.
- Don't add server env vars that aren't in configuration.md.
