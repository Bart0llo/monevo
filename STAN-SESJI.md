# Session State: Monevo "Passbook" UI redesign (ACCEPTED by the user 2026-11-18; awaiting commit approval, session 5)

## Project context (carried over from Stage 1)
- Stage 1 (Foundation) is completed and **accepted** (2026-11-18), committed through `e980af5`. Stage 2 has NOT started and must not start until the user asks and OQ-03, OQ-06, OQ-22 are resolved.
- Stage 0 status line in implementation-stages.md still says "awaiting final acceptance"; left unchanged pending the user's confirmation.
- Branch `master` (agreed workflow; no feature branches). No commits unless the user asks.
- Known limitation: test files in `domain`/`web` cannot import Node core modules (no test exemption in the boundaries config); none do today.

## Goal (redesign)
Redesign the EXISTING frontend only (shell, nav, placeholder pages, not-found, error state, theme tokens, shared components, light/dark, responsive) in the "Passbook" direction. Constraints: no backend/schema/infra changes, no future-stage features (no FAB, no fake data), do not run the impeccable launcher binary.

## Done
- Sessions 1-3: skills in `.claude/skills/` (gitignored; `skills-lock.json` at the root), theme tokens, shell (desktop ink rail, mobile top + bottom bar with More sheet, skip link), shared components (PageHeader, StatePanel, PlannedBadge), RouteError, NotFoundPage, i18n en+pl, brand icons, `@fontsource-variable/hanken-grotesk`, docs (`docs/product/design-system.md`), unit and e2e tests. After screenshots: C:\Users\bart0llo\AppData\Local\Temp\claude\f652989a1f371f26\a58e3654-3d07-4387-86d6-2234289d2351\scratchpad\shots\after-*.png
- Session 4: `pnpm test:e2e` 6/6, stage notification sent, report delivered.
- Session 5 (final review, user-requested):
  - OFL-1.1 accepted for font dependencies: dependencies.md policy updated; OQ-17 got a recorded **partial** decision (fonts only). OQ-17 itself (project license) stays Open. Package `license` field, `metadata.json` and bundled `LICENSE` all say OFL-1.1.
  - `.claude/**` ESLint ignore verified: flat config ignores `.gitignore`, so `eslint .` linted the 5 third-party skill scripts (529 errors). With the ignore, ESLint lints exactly the 95 JS/TS files git sees (none missed).
  - Review fixes: `--mv-planned` light `#6d7690` -> `#636c86` (badge text was 4.18:1, now 4.83:1); hard-coded `#ffffff` in shell.css -> new `--mv-cover-fg-strong` token; design-system.md dark `--mv-planned` value corrected to `#949db2`; `.gitignore` trailing newline; this file back to LF.
  - design-system.md status -> **[Accepted]** at the user's request.

## Remaining
- Redesign accepted by the user (2026-11-18). Commit only when the user asks (attribution trailer).

## Pitfalls
- Bash output is sometimes compressed or mangled; use the Read tool for files and logs.
- Mantine Drawer does not open in a hidden preview tab (rAF throttled).
- Run `pnpm exec prettier --write` on edited files; eslint import-x/order via `pnpm exec eslint apps/web --fix`.
- eslint-plugin-boundaries reads the legacy `import/resolver` setting; element patterns need `partialMatch: false` with full repo-relative paths.
- Don't add server env vars that aren't in configuration.md.
- Don't touch backend code or the unrelated `ac-test-pg` container or its volumes.
