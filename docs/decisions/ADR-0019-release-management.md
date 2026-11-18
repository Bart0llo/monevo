# ADR-0019: Release management and image publishing

- **Status:** Proposed
- **Date:** 2026-11-18

## Context

[ADR-0016](ADR-0016-local-validation-ci-deferred.md) introduced no CI platform and postponed the image registry and automated image publishing until a CI platform is chosen. Releases need a repeatable procedure before the first public version: one canonical version, a changelog, immutable tags, and published multi-architecture images that operators can `docker compose pull`. This ADR proposes how releases are prepared and published, while keeping merge validation local.

## Decision

- **Preparation (Phase A) is always local, with release-it.** `make release` checks prerequisites and runs `pnpm validate`, asks for the next version (patch/minor/major), bumps the root `package.json`, updates `CHANGELOG.md` from Conventional Commits, and creates the commit `chore(release): vX.Y.Z` and the annotated tag `vX.Y.Z` on `master`. It never pushes, never publishes to npm, and never creates a GitHub Release.
- **The canonical version** is the root `package.json` `version`; workspace packages have none. Only release-it changes it.
- **Publishing (Phase B) has two modes**, selected by `RELEASE_MODE`:
  - `manual` (default; also for a missing, empty, or invalid value): the maintainer runs `make publish` (multi-platform build and push) and `make github-release`.
  - `github-actions`: opt-in through the GitHub repository variable `RELEASE_MODE`. A **publish-only** workflow (`.github/workflows/release.yml`), triggered by a pushed `v*` tag, verifies the tag and release commit, runs `pnpm validate` and `pnpm test:e2e`, pushes the image, and creates the GitHub Release. It never runs release-it or changes the version, changelog, commits, or tags.
- **Registry: GitHub Container Registry**, image `ghcr.io/<owner>/monevo`, tags `vX.Y.Z` (immutable, never overwritten) and `latest`, platforms `linux/amd64` and `linux/arm64`.
- **If accepted, this amends ADR-0016** in its registry and publishing point only. ADR-0016 otherwise stands: there is no CI merge gate, `pnpm validate` and `pnpm test:e2e` are run locally, and [OQ-07](../planning/open-questions.md#oq-07-ci-platform) stays deferred for CI on merges. The release workflow is not a general CI pipeline and does not run on branches or pull requests.

The procedure, commands, variables, and recovery steps are canonical in [releasing.md](../development/releasing.md).

## Alternatives considered

- **Fully automated releases in CI (semantic-release, release-please):** versions and tags created remotely, but the history before the first release does not follow Conventional Commits, and it would make GitHub Actions mandatory, against ADR-0016.
- **Manual-only publishing:** no workflow at all, but every release would depend on a maintainer's machine with QEMU and a registry token.
- **Docker Hub or a self-hosted registry:** pull rate limits (Docker Hub) or extra infrastructure to run; GHCR is tied to the repository and needs no extra account.
- **`X.Y` and `X` moving tags:** convenient automatic updates, but Monevo updates are manual and may contain migrations ([deployment.md](../infrastructure/deployment.md#upgrades)); exact versions plus `latest` are enough.

## Consequences

- Every release has the same local preparation step, whichever mode publishes it; a release can always be published manually if GitHub Actions is unavailable.
- GitHub Actions is optional: with the repository variable unset, the workflow only logs a notice for each tag.
- Release images are built from a clean checkout of the tag, and an existing version tag is never overwritten, so `vX.Y.Z` always identifies one commit.
- Commits must follow Conventional Commits to appear in `CHANGELOG.md`.
- [docker-compose.md](../infrastructure/docker-compose.md#1-image) and [deployment.md](../infrastructure/deployment.md#upgrades) use the GHCR image name and tags.

## Status

Proposed (2026-11-18), pending the user's acceptance. Until it is accepted, ADR-0016 stands unchanged, and the tooling described in [releasing.md](../development/releasing.md) is not used for a real release.
