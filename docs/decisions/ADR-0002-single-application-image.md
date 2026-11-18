# ADR-0002: Single application image

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

The brief requires Docker Compose with one application image containing the frontend and backend, PostgreSQL in a separate container, and only the application port exposed (R-INF-01, R-INF-02).

## Decision

Build one multi-stage image (`node:24-slim` runtime, non-root, tini, read-only root filesystem) containing the server bundle, the built web app, the CLI, and `postgresql-client` for backups. The entrypoint runs migrations (with the pre-upgrade backup) and starts the server. PostgreSQL runs from the official image on an internal network. Details: [docker-compose.md](../infrastructure/docker-compose.md).

## Alternatives considered

- **Separate web (nginx) and API images:** violates the brief and complicates same-origin cookies.
- **Bundling PostgreSQL in the app image:** violates the brief and makes upgrades and backups harder.
- **Alpine base:** smaller, but musl causes friction with native modules (argon2) and the PostgreSQL client packages.

## Consequences

- Operators manage two containers (three with optional MinIO).
- The image size includes `postgresql-client`; its major version must match the database server ([OQ-08](../planning/open-questions.md#oq-08-nodejs-and-postgresql-versions)).
- Same-origin serving means CORS stays off by default.

## Status

Accepted.
