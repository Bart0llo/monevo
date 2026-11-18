# Monevo

A self-hosted, offline-first personal finance PWA. Multi-user, with each user's financial data kept private.

> Status: in development. Stage 1 (foundation) is complete and accepted; Stage 2 has not started. Not ready for real financial data yet.

## Run with Docker

Monevo is one application container. PostgreSQL is external: you need a reachable PostgreSQL in the supported range ([postgresql.md](docs/infrastructure/postgresql.md)).

```bash
cp .env.example .env      # set APP_URL, APP_ENCRYPTION_KEY, DATABASE_URL
docker compose up -d      # builds the image, applies migrations, starts the app on 127.0.0.1:3000
```

Put a TLS-terminating reverse proxy in front of it ([deployment.md](docs/infrastructure/deployment.md)). The API documentation is served at `/api/v1/docs`.

More: [docker-compose.md](docs/infrastructure/docker-compose.md), [configuration.md](docs/infrastructure/configuration.md), [backups-and-restoration.md](docs/infrastructure/backups-and-restoration.md).

## Develop

See [development-setup.md](docs/development/development-setup.md). In short: Node.js 24, pnpm, Docker.

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate
pnpm dev
pnpm validate        # all local checks
pnpm test:e2e        # builds the image and runs Playwright against it
```

The documentation in [docs/](docs/README.md) is the source of truth for requirements, architecture, and decisions.
