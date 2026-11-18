# Monevo release and Docker image commands (docs/development/releasing.md).
# All logic lives in scripts/release/cli.mjs (Node.js 24), so the targets behave the same on Linux,
# macOS and Windows (Git Bash). Nothing here pushes Git commits or tags.
#
# Overridable variables (make <target> VAR=value, or environment):
#   RELEASE_MODE     local publishing mode: manual (default) or github-actions. Only affects
#                    `make publish` / `make github-release` on this machine; GitHub Actions reads
#                    the repository variable RELEASE_MODE instead.
#   IMAGE_REGISTRY   registry host (default ghcr.io)
#   IMAGE_OWNER      registry namespace (default: owner of the `origin` GitHub remote, lowercased)
#   IMAGE_NAME       image name (default monevo)
#   IMAGE_PLATFORMS  platforms for `make publish` (default linux/amd64,linux/arm64)
#   VERSION          version for `make release-notes VERSION=x.y.z` (released section of CHANGELOG.md)
#   YES=1            skip confirmation prompts (push, publish, github-release, remove)

RELEASE_MODE ?= manual
IMAGE_REGISTRY ?= ghcr.io
IMAGE_OWNER ?=
IMAGE_NAME ?= monevo
IMAGE_PLATFORMS ?= linux/amd64,linux/arm64
VERSION ?=
export RELEASE_MODE IMAGE_REGISTRY IMAGE_OWNER IMAGE_NAME IMAGE_PLATFORMS

RELEASE := node scripts/release/cli.mjs

.DEFAULT_GOAL := help
.PHONY: help version release-mode release-check release release-notes build login push publish \
	github-release inspect remove clean

help: ## Show available commands
	@echo "Monevo release commands (docs/development/releasing.md)"
	@echo ""
	@awk 'BEGIN {FS = ":.*## "} /^[a-z-]+:.*## / {printf "  make %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "Variables: RELEASE_MODE=$(RELEASE_MODE) IMAGE_REGISTRY=$(IMAGE_REGISTRY) IMAGE_OWNER=$(if $(IMAGE_OWNER),$(IMAGE_OWNER),<from origin>) IMAGE_NAME=$(IMAGE_NAME)"

version: ## Print the current application version (root package.json)
	@$(RELEASE) version

release-mode: ## Print the local publishing mode (manual or github-actions)
	@$(RELEASE) mode

release-check: ## Verify release prerequisites, then run pnpm validate and pnpm test:e2e
	@$(RELEASE) check --validate --e2e

release: ## Prepare a release with release-it: version, CHANGELOG.md, commit, tag (no push)
	pnpm exec release-it

release-notes: ## Preview the notes of the next release (or VERSION=x.y.z for a released one)
ifeq ($(strip $(VERSION)),)
	@pnpm exec release-it --changelog
else
	@$(RELEASE) notes $(VERSION)
endif

build: ## Build the image of the checked-out release tag for the host platform
	@$(RELEASE) image build

login: ## Log in to the registry (uses GHCR_TOKEN if set, otherwise prompts)
	@$(RELEASE) image login

push: ## Push the image built by `make build` (vX.Y.Z and latest, host platform)
	@$(RELEASE) image push

publish: ## Publish for RELEASE_MODE: manual = multi-platform build and push; github-actions = instructions
	@$(RELEASE) image publish

github-release: ## Manual mode: create the GitHub Release from CHANGELOG.md (needs gh and the pushed tag)
	@$(RELEASE) image github-release

inspect: ## Show labels and platform of the local release image
	@$(RELEASE) image inspect

remove: ## Remove local Monevo images of this repository (asks first; registry untouched)
	@$(RELEASE) image remove

clean: ## Prune unused Docker build cache (docker asks for confirmation)
	@$(RELEASE) image clean
