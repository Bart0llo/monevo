# Contribution Guidelines

**[Proposed]** workflow for the project owner and AI coding agents working on Monevo.

## 1. Workflow

- Work happens in **stages** ([implementation-stages.md](../planning/implementation-stages.md)). A stage starts only when the previous one is accepted by the user, and its prerequisites (including open questions marked "before Stage N" in [open-questions.md](../planning/open-questions.md)) are resolved.
- Branches: `master` is always releasable and is the only release branch. Work on `stage-<n>-<slug>` or `feat/<slug>`/`fix/<slug>` branches; merge after `pnpm validate` passes locally (and `pnpm test:e2e` before a stage is submitted for acceptance). No CI platform is configured yet ([ADR-0016](../decisions/ADR-0016-local-validation-ci-deferred.md)).
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) (`feat(transactions): …`, `fix(sync): …`, `docs: …`). One logical change per commit. Never commit secrets, `.env` files, or real financial data.
- Pull requests describe what changed, which requirement IDs and docs it touches, how it was tested, and any open question it depends on.
- Releases: prepared with `make release` (release-it: version, `CHANGELOG.md`, commit, annotated SemVer tag `vX.Y.Z`), then published manually or by the release workflow ([releasing.md](releasing.md)). Release notes state migrations, rollback compatibility, and required operator actions ([deployment.md](../infrastructure/deployment.md#upgrades)).

## 2. Definition of done (per change)

- [ ] `pnpm validate` passes locally (lint, format, typecheck, unit, integration, OpenAPI, i18n, and docs checks).
- [ ] New behaviour has tests at the right level ([testing-strategy.md](testing-strategy.md)); bug fixes have a regression test.
- [ ] New owned endpoints are covered by the isolation suite (automatic) and have OpenAPI registrations.
- [ ] User-visible strings exist in `en` and `pl`.
- [ ] Documentation is updated in the same change (§3).
- [ ] No out-of-scope features ([requirements.md](../product/requirements.md#out-of-scope)).

## 3. Documentation maintenance

The `docs/` tree is the source of truth ([docs/README.md](../README.md)). Rules:

1. **Same change.** Code that changes a documented behaviour, schema, endpoint, variable, or decision updates the docs in the same commit or PR. A mismatch between code and docs is a defect.
2. **One canonical home.** Each fact lives in one document ([canonical locations](../README.md#canonical-locations)); others link to it. Don't copy numbers or rules between documents.
3. **Status markers.** Use `[Accepted]`, `[Proposed]`, `[Deferred]`, `[Out of scope]`, `[Open]` as defined in the README. Changing an `[Accepted]` decision requires an ADR (new or superseding).
4. **ADRs.** Significant or hard-to-reverse decisions get an ADR in [decisions/](../decisions/README.md). ADRs are append-only: supersede rather than rewrite, except for typo fixes and status changes.
5. **Open questions.** A newly discovered uncertainty goes into [open-questions.md](../planning/open-questions.md) with a recommendation. When it is resolved, record the answer there and update the affected docs (and ADR if any).
6. **Schema.** New or changed tables and columns update [data-model.md](../data/data-model.md) and, for relationships or deletion behaviour, [entity-relationships.md](../data/entity-relationships.md).
7. **Variables.** New environment variables or runtime settings update [configuration.md](../infrastructure/configuration.md).
8. **Links.** Relative links only; anchors must exist. `pnpm docs:check` (part of `pnpm validate`) verifies paths and anchors, accepting heading slugs and explicit `<a id="…">` anchors.
9. **`CLAUDE.md`** stays short: it summarizes and links, it does not duplicate. Update it when a top-level rule changes.

## 4. Working with AI coding agents

- Agents read [`CLAUDE.md`](../../CLAUDE.md) first, then the documents for the stage at hand.
- Agents do not make product decisions that the docs leave open; they raise them as open questions.
- Agents follow the stage boundaries and do not implement later-stage features early.
- Agents report verification results faithfully (what ran, what passed, what was skipped).
