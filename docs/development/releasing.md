# Releasing

**[Proposed]** (pending acceptance of [ADR-0019](../decisions/ADR-0019-release-management.md)) Releases are prepared locally with release-it and published either manually (the default) or by a publish-only GitHub Actions workflow ([ADR-0019](../decisions/ADR-0019-release-management.md)). This document is the canonical home for the release procedure, the image name and tags, and the release tooling variables. Merge validation stays local ([ADR-0016](../decisions/ADR-0016-local-validation-ci-deferred.md), [testing-strategy.md](testing-strategy.md#5-local-validation)).

## 1. Overview

A release has two phases:

| Phase | What happens | Where | Pushes anything? |
|---|---|---|---|
| **A. Prepare** (always the same) | `make release` runs release-it: prerequisite checks and `pnpm validate`, interactive version choice, `package.json` bump, `CHANGELOG.md` section, commit `chore(release): vX.Y.Z`, annotated tag `vX.Y.Z` | Maintainer's machine | No. Never pushes, never publishes. |
| **B. Publish** (depends on the [mode](#3-publishing-modes)) | Push the commit and tag; build and push the image `ghcr.io/<owner>/monevo:vX.Y.Z` + `latest`; create the GitHub Release | Manual: maintainer's machine. GitHub Actions: the `Release` workflow. | Yes, explicitly. |

Release notes state migrations, rollback compatibility, and required operator actions ([deployment.md](../infrastructure/deployment.md#upgrades)). Edit the generated `CHANGELOG.md` section before release-it commits it if those need to be spelled out (release-it shows the changelog and asks before committing).

Files: [`.release-it.js`](../../.release-it.js) (release-it configuration), [`Makefile`](../../Makefile) (commands), [`scripts/release/cli.mjs`](../../scripts/release/cli.mjs) (all checks and image commands, Node.js only, so the same on Linux, macOS and Windows, including `make help`), [`scripts/release/lib.mjs`](../../scripts/release/lib.mjs) (pure helpers, tested by `pnpm test:release`), [`.github/workflows/release.yml`](../../.github/workflows/release.yml) (GitHub Actions mode).

<a id="canonical-version"></a>

## 2. Canonical version

- The application version lives **only** in the root [`package.json`](../../package.json) `version` field. Workspace packages (`apps/*`, `packages/*`, `e2e`) have no version of their own.
- `0.0.0` means "nothing released yet"; the first `minor` release is `v0.1.0`.
- The version is changed **only by release-it** (`make release`). `make release-check` fails if `package.json` has a version without a matching tag.
- Versions are SemVer `X.Y.Z` (stable only; prereleases are rejected). Tags are `vX.Y.Z`, annotated, and created by release-it.
- The image receives the version as the `APP_VERSION` build argument ([configuration.md](../infrastructure/configuration.md#set-by-the-image-not-operator-configuration)); `pnpm test:e2e` passes the same value. `make version` prints it.

## 3. Publishing modes

`RELEASE_MODE` selects who performs Phase B. Values are case-insensitive and whitespace is ignored; a missing, empty, or invalid value means **`manual`** (an invalid value prints a warning).

| Mode | Who publishes | Set where |
|---|---|---|
| `manual` (default) | The maintainer, with `make publish` and `make github-release` | Nothing to set |
| `github-actions` | The `Release` workflow, when a `v*` tag is pushed | Repository variable `RELEASE_MODE` (Settings → Secrets and variables → Actions → **Variables**), and locally `RELEASE_MODE=github-actions` so that `make publish` does not publish from the machine |

The remote behaviour depends only on the **repository variable**. The local `RELEASE_MODE` only changes what `make publish` / `make github-release` do on the maintainer's machine (`make release-mode` prints it). The workflow runs for every pushed tag, but in manual mode its first job only logs a notice and every other job is skipped, so a manual release is never published twice.

## 4. Prerequisites

- Node.js 24 and pnpm (as in [development-setup.md](development-setup.md#1-prerequisites)), GNU Make (on Windows from PowerShell or Git Bash, no Unix tools needed), or run `node scripts/release/cli.mjs …` directly.
- A clean `master` that is up to date with `origin/master`, all remote tags fetched (`git fetch --tags`).
- The local test database running for `pnpm validate` (`docker compose -f docker-compose.dev.yml up -d db-test`), and Docker for `pnpm test:e2e`.
- Manual mode also needs: Docker with Buildx and QEMU emulation for the multi-platform build ([§8](#8-multi-architecture-builds)), a GitHub token to push to GHCR ([§7](#7-ghcr-authentication)), and the GitHub CLI `gh` (logged in with `gh auth login`) for `make github-release`.
- Commits since the last release follow [Conventional Commits](contribution-guidelines.md#1-workflow). Others are left out of `CHANGELOG.md`; `make release-check` lists them.

## 5. Release procedure

### Phase A: prepare (both modes)

```bash
git switch master && git pull --ff-only && git fetch --tags
make release-check        # optional dry run: prerequisites, pnpm validate, pnpm test:e2e
make release-notes        # optional: preview the next CHANGELOG section (changes nothing)
make release              # release-it: choose patch/minor/major, confirm changelog, commit and tag
git show vX.Y.Z           # review what was created locally
```

`make release` runs, in order: the `before:init` hook (`cli check --validate`: branch, clean tree, version/tag consistency, local and remote tags, upstream, commits to release, then `pnpm validate`), the version prompt (always patch/minor/major, never an automatic recommendation), the `before:bump` hook (`cli next <version>`: stable, greater than the latest release, tag unused locally and on the remote; runs before any file changes), the `package.json` bump, the `CHANGELOG.md` update, the commit, the annotated tag, and finally `after:release`, which prints the next steps. `pnpm test:e2e` is not part of `make release` (it takes several minutes): run `make release-check` first, because it must pass before every release ([testing-strategy.md](testing-strategy.md#5-local-validation)).

To undo a prepared release that was **not pushed**: `git tag -d vX.Y.Z && git reset --hard HEAD~1`.

### Phase B, manual mode

```bash
git switch --detach vX.Y.Z    # images are built only from a clean checkout of the release tag
make login                    # once per machine/token (GHCR_TOKEN or an interactive prompt)
make publish                  # multi-platform build and push of vX.Y.Z and latest (asks first)
git switch master
git push --atomic origin master vX.Y.Z
make github-release           # GitHub Release vX.Y.Z from CHANGELOG.md (asks first)
```

Pushing the branch and tag before `make publish` is also fine; the image commands check out nothing and push no Git refs. Pushing the tag first gives a short window in which the tag exists without an image, so the order above (image first) is preferred.

### Phase B, GitHub Actions mode

```bash
git push --atomic origin master vX.Y.Z
```

The `Release` workflow then runs four jobs:

1. **mode:** reads the repository variable; anything other than `github-actions` stops here.
2. **verify** (`contents: read`): checks out the tag with full history, `cli verify-tag` (tag matches `package.json`, annotated, at HEAD, the tagged commit is a release-it commit that changes `package.json` and `CHANGELOG.md` and increases the version, not older than the latest release, contained in `origin/master`), then `pnpm validate` (with Testcontainers) and `pnpm test:e2e`.
3. **publish** (`contents: read`, `packages: write`): refuses if `vX.Y.Z` already exists in GHCR, then builds `linux/amd64` and `linux/arm64` with Buildx/QEMU and pushes `vX.Y.Z` and `latest`, authenticated with the workflow's `GITHUB_TOKEN`.
4. **github-release** (`contents: write`): refuses if the release exists, then creates it from the `CHANGELOG.md` section plus GitHub's generated notes, with `--verify-tag` (never creates a tag).

The workflow never runs release-it and never changes the version, `CHANGELOG.md`, commits or tags. Releases run one at a time (`concurrency: release`, never cancelled halfway). If a job fails, fix the cause and re-run the failed jobs from the Actions page; the overwrite guards make a re-run safe. A release whose tag is wrong must be replaced by a new patch release ([§10](#10-failure-recovery)).

## 6. Commands

| Command | Does |
|---|---|
| `make help` | Lists the commands and the current variables |
| `make version` | Prints the canonical version |
| `make release-mode` | Prints the local publishing mode |
| `make release-check` | Prerequisites, then `pnpm validate` and `pnpm test:e2e` (`pnpm release:check` = prerequisites only) |
| `make release` | Phase A with release-it (`pnpm release` is the same) |
| `make release-notes` | Previews the next changelog section; `VERSION=x.y.z` prints a released section |
| `make build` | Builds the checked-out release tag for the host platform and loads it locally (`vX.Y.Z` + `latest`) |
| `make login` | `docker login` to the registry |
| `make push` | Pushes the image from `make build` (host platform only; checks it was built from the tag) |
| `make publish` | Manual: multi-platform build and push. GitHub Actions: prints what the workflow will do |
| `make github-release` | Manual: creates the GitHub Release with `gh` (the tag must be on `origin`) |
| `make inspect` | Shows labels, platform, and size of the local release image |
| `make remove` | Removes local images of this repository (asks first; the registry is untouched) |
| `make clean` | `docker builder prune` (Docker asks for confirmation) |

`make build` + `make push` exist for a quick single-platform publication or testing; a normal release uses `make publish`. Every command that pushes or deletes asks for confirmation; `YES=1` skips the prompt, and without a terminal the commands refuse instead of assuming yes.

### Variables

These configure the release tooling only, never the running application ([configuration.md](../infrastructure/configuration.md)). Pass them as `make <target> VAR=value` or as environment variables.

| Variable | Default | Used for |
|---|---|---|
| `RELEASE_MODE` | `manual` | Local publishing mode ([§3](#3-publishing-modes)) |
| `IMAGE_REGISTRY` | `ghcr.io` | Registry host |
| `IMAGE_OWNER` | owner of the `origin` GitHub remote, lowercased | Registry namespace |
| `IMAGE_NAME` | `monevo` | Image name |
| `IMAGE_PLATFORMS` | `linux/amd64,linux/arm64` | Platforms for `make publish` |
| `IMAGE_SOURCE_URL` | `https://github.com/<owner>/<repo>` from `origin` | `SOURCE_URL` build argument (OCI `source`/`url` labels) |
| `IMAGE_REF` | the `vX.Y.Z` image | Image shown by `make inspect` |
| `GHCR_TOKEN`, `GHCR_USERNAME` | unset; username = owner | `make login` without a prompt |
| `VERSION` | unset | `make release-notes VERSION=x.y.z` |
| `YES` | unset | `YES=1` skips confirmation prompts |
| `RELEASE_REMOTE`, `RELEASE_BRANCH` | `origin`, `master` | Remote and release branch checked by the tooling |

## 7. GHCR authentication

- **Manual mode:** create a GitHub personal access token (classic) with the `write:packages` scope (it implies `read:packages`). `make login` reads it from `GHCR_TOKEN` (passed to `docker login --password-stdin`, never on the command line) or asks for it. Docker stores the credential in its credential store; never commit the token or put it in `.env`.
- **GitHub Actions mode:** no secret is needed. The workflow uses its own `GITHUB_TOKEN` with `packages: write`, granted only to the publish job.
- **Package visibility:** a new GHCR package is private. After the first publication, open the package settings on GitHub, link it to the repository if it is not linked yet (the `org.opencontainers.image.source` label normally does this), and set the visibility to public if operators should pull without logging in. For a workflow-published package, the repository needs write access in the package's "Manage Actions access" settings when the package was first created manually.

## 8. Multi-architecture builds

Images are published for `linux/amd64` and `linux/arm64` (homelab ARM boards). `make publish` and the workflow use `docker buildx build --platform linux/amd64,linux/arm64 --push`; the non-native platform runs under QEMU emulation, so a release build takes noticeably longer than `make build`.

- Docker Desktop (Windows, macOS) includes QEMU, and its default `docker` Buildx driver with the containerd image store can build and push multi-platform images directly (verified locally).
- On Linux, or with the classic image store, install emulators once (`docker run --privileged --rm tonistiigi/binfmt --install arm64`) and create a builder if the default one refuses multi-platform output: `docker buildx create --name monevo --driver docker-container --use`.
- `make build` builds only the host platform and loads it into the local image store (multi-platform images cannot be loaded into the classic store).
- Check the result with `docker buildx imagetools inspect ghcr.io/<owner>/monevo:vX.Y.Z`: it lists both platforms (plus attestation manifests).

<a id="docker-images"></a>

## 9. Docker images

| Item | Value |
|---|---|
| Repository | `ghcr.io/<owner>/monevo` (`<owner>` = the GitHub owner, lowercased) |
| Tags | `vX.Y.Z` (immutable, one per release) and `latest` (the newest release). No `X.Y` or `X` tags. |
| Platforms | `linux/amd64`, `linux/arm64` |
| Build arguments | `APP_VERSION`, `GIT_COMMIT` (the tagged commit), `BUILD_DATE` (UTC ISO 8601), `SOURCE_URL` ([configuration.md](../infrastructure/configuration.md#set-by-the-image-not-operator-configuration)) |
| OCI labels | `title`, `description`, `version`, `revision`, `created`, `source`, `url` (license once [OQ-17](../planning/open-questions.md#oq-17-license) is decided) |

Rules:

- A version tag is **never overwritten**. Before pushing, the tooling checks the registry with `docker buildx imagetools inspect`; if `vX.Y.Z` exists, it stops. A registry it cannot query (for example, not logged in) also stops the push.
- Release images are built only from a clean checkout of the release tag (`make build`/`push`/`publish` check this), so `vX.Y.Z` always corresponds to that commit and its `revision` label.
- `latest` moves to every new release. `verify-tag` refuses a tag older than the newest release, so `latest` never moves backwards. Operators pin `vX.Y.Z` in production ([deployment.md](../infrastructure/deployment.md#upgrades)).
- Image contents and runtime properties are specified in [docker-compose.md](../infrastructure/docker-compose.md#1-image).

## 10. Failure recovery

| Situation | What to do |
|---|---|
| `make release` fails before the commit (checks, validation, `next`) | Nothing was changed; fix the cause and run it again. |
| Prepared locally, not pushed, needs changes | `git tag -d vX.Y.Z && git reset --hard HEAD~1`, fix, release again. |
| `make publish` fails | Check with `docker buildx imagetools inspect` whether `vX.Y.Z` reached the registry. If not, fix the cause and re-run. If it did, it is published: do not overwrite it; continue with the Git push and `make github-release`, or release a fixed patch version. |
| Tag pushed, workflow failed in `verify` | Nothing was published. Either release the fix as the next patch version (preferred), or, because nothing was published, delete the tag (`git push origin :refs/tags/vX.Y.Z`, `git tag -d vX.Y.Z`), revert the release commit with a new commit, and prepare the release again. Never rewrite pushed `master` history. |
| Workflow failed in `publish` or `github-release` | Fix the cause (permissions, registry), then "Re-run failed jobs". The guards skip nothing silently: an existing image or release fails the job, so delete a broken partial release in GitHub first if needed. |
| A published image is broken | Never replace `vX.Y.Z`. Release a fixed patch version; `latest` moves to it. |
| Wrong mode used | Manual and workflow publication cannot both succeed for the same version, because both refuse an existing image tag and an existing GitHub Release. |

## 11. Verification of the tooling

`pnpm test:release` (part of `pnpm validate`) unit-tests the pure helpers in `scripts/release/lib.mjs`: version parsing and comparison, tags, mode normalization, next-version rules, remote URL parsing, image names, Conventional Commit detection, and changelog section extraction. Changes to the release flow itself are verified in a throwaway clone with a local bare `origin` and a local registry (`docker run -d -p 5055:5000 registry:2`, then `IMAGE_REGISTRY=localhost:5055`), never against the real repository, GHCR, or GitHub Releases.
