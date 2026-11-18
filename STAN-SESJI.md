# Session State: Release management (release-it + manual / GitHub Actions publishing)

## Goal
Implement release tooling per the user's spec: release-it is the mandatory Phase A (version, CHANGELOG, commit, annotated tag `vX.Y.Z`, never push); Phase B publishing is manual (default) or GitHub Actions (repo variable `RELEASE_MODE=github-actions`). GHCR image `ghcr.io/<owner>/monevo:vX.Y.Z` + `latest`. Root Makefile. Docs. Verify without creating real commits/tags/releases/pushes. Then final report (12 points in the user's prompt) and stop.

Constraints: branch `master` only, no commits, no branch switching, no pushes, no real release. Project rules: docs are source of truth; changing an `[Accepted]` decision needs an ADR.

## Done (all uncommitted in working tree)
- `release-it@21.1.2` + `@release-it/conventional-changelog@12.0.2` root devDependencies (`package.json`, `pnpm-lock.yaml`).
- Canonical version: root `package.json` `"version": "0.0.0"` (unreleased; first `minor` = v0.1.0). Removed redundant `"version": "0.1.0"` from apps/server, apps/web, packages/{contracts,domain,i18n}, e2e (lockfile unaffected; tools/eslint-plugin-monevo kept its own). `scripts/test-e2e.mjs` now reads APP_VERSION from root package.json.
- Root scripts: `release`, `release:check`, `test:release` (added to `validate` after `pnpm test`).
- `.release-it.js` (ESM, commented): hooks `before:init` = `cli check --validate`, `before:bump` = `cli next ${version}`, `after:release` = `cli after-release ${version}`; hooks and git requirements disabled for preview flags (`--changelog`, `--release-version`). git: requireBranch master, clean, upstream, requireCommits, commitMessage `chore(release): v${version}`, tagName `v${version}`, annotated, tagMatch stable, push false. npm publish false; github/gitlab release false. Changelog plugin: preset conventionalcommits with `effect` (v10 API, NOT `hidden: true`), header single-line `# Changelog` (multi-line header duplicates on Windows due to CRLF join), `ignoreRecommendedBump: true` (interactive patch/minor/major).
- `CHANGELOG.md` seeded with `# Changelog` only; added to `.prettierignore`.
- `scripts/release/lib.mjs` (pure helpers) + `scripts/release/__tests__/lib.test.mjs` (25 tests pass) + `scripts/release/vitest.config.mjs`.
- `scripts/release/cli.mjs`: version, mode, check [--validate] [--e2e], next, after-release, verify-tag, notes, image {info,build,login,push,publish,inspect,remove,clean,assert-unpublished,github-release}. Confirmation prompts (YES=1 to skip; non-TTY fails safe). Overwrite guard via `docker buildx imagetools inspect` ("not found" = unpublished).
- `Makefile` (all 13 required targets + `github-release`); vars RELEASE_MODE, IMAGE_REGISTRY, IMAGE_OWNER (derived from origin), IMAGE_NAME, IMAGE_PLATFORMS, VERSION, YES. `.editorconfig` `[Makefile] indent_style = tab`.
- `Dockerfile`: ARG/LABEL block moved after the apt layer (cache), new `ARG SOURCE_URL` for `org.opencontainers.image.source`/`.url` (removed hardcoded GitHub URL).
- `.github/workflows/release.yml`: on tags `v*`; jobs mode (vars.RELEASE_MODE gate, perms {}) → verify (contents: read; checkout fetch-depth 0, re-fetch annotated tag, pnpm install, `verify-tag`, `pnpm validate` with TESTCONTAINERS=true, Playwright chromium, `pnpm test:e2e`) → publish (packages: write; QEMU+buildx, login GITHUB_TOKEN, assert-unpublished, build-push-action amd64+arm64, tags vX.Y.Z+latest, build args) → github-release (contents: write; refuse if exists, notes from CHANGELOG + `--generate-notes`, `--verify-tag`). concurrency group `release`, no cancel. Action majors: checkout v7, setup-node v7, pnpm/action-setup v6, docker/* v4, build-push v7.
- `eslint.config.js`: `.release-it.js` added to the CODE-block `ignores` (boundaries). `pnpm exec eslint .` passes; `pnpm format:check` passes.

## Verification results so far (throwaway clone in scratchpad/reltest, bare local origin)
- release-it config loads; `--changelog` / `--release-version` preview change nothing in the real repo.
- Minor release 0.0.0→0.1.0 and patch 0.1.0→0.1.1: package.json bumped, CHANGELOG sections correct (header once, hidden types omitted), commit `chore(release): vX`, annotated tag, nothing pushed.
- Rejected: prerelease (before:bump, no files changed), re-release with no commits, same/lower version, existing local or remote-only tag, dirty tree, wrong branch, remote tags missing locally.
- verify-tag: passes for a valid pushed release; fails for tag/version mismatch, lightweight tag, non-release commit, HEAD not at tag, tag older than latest, branch not pushed, non-semver tag.
- Modes: empty/invalid → manual (warning for invalid); workflow gate bash simulated for "", manual, github-actions, GitHub-Actions, " github-actions ", auto → correct.
- make version/release-mode/help/build/inspect/push/publish/github-release behaviours verified; local registry `localhost:5055`: first push OK, second push and publish refused (no overwrite). OCI labels verified (version, revision = tag commit, created, source).
- actionlint 1.7.12 passes (shellcheck not installed → run: blocks not shellchecked).
- DONE: multi-platform `make publish YES=1` (v0.1.2 to localhost:5055) exit 0; the pushed index contains linux/amd64 + linux/arm64 (+ attestation manifests). Multi-arch via buildx/QEMU is practical locally (Docker Desktop, docker driver with containerd store); document that other setups may need a `docker-container` buildx builder.

## Left to do
Nothing. All work is done and verified (2026-11-18); everything is uncommitted and waiting for the user's acceptance.
- Cleanup done: monevo-reltest-registry removed, example-owner test images removed, scratchpad/reltest deleted.
- Docs written: docs/development/releasing.md (new), docs/decisions/ADR-0019-release-management.md (new, Accepted, amends ADR-0016), ADR index + ADR-0016 status, overview.md key decisions, docker-compose.md, deployment.md, configuration.md (SOURCE_URL + release tooling pointer), contribution-guidelines.md (master), testing-strategy.md, development-setup.md, dependencies.md, docs/README.md (map + canonical row), open-questions.md OQ-07 note, README.md.
- Checks: docs:check, format:check, test:release (25), full pnpm validate (exit 0), pnpm test:e2e (6 passed).
- Possible next step (only if the user asks): commit with Conventional Commits, set the repository variable RELEASE_MODE if github-actions mode is wanted, then do the first release, v0.1.0.

## Pitfalls
- Bash output is often compressed; use Read for files/logs.
- Prettier rewrites files: run `pnpm exec prettier --write` on edited non-docs files (docs/ is prettier-ignored).
- Don't touch the unrelated `ac-test-pg` container. Don't commit. Don't push anything to GitHub/GHCR.
- In the clone, `.release-it.js` was edited to drop `--validate` (clone only).
