# Deployment

**[Accepted]** Docker Compose on a VPS, homelab, or similar host, with manual updates via Compose (R-INF-03). **[Proposed]** operating procedure. Image and compose details are in [docker-compose.md](docker-compose.md); variables in [configuration.md](configuration.md).

## Requirements

| Item | Minimum | Comfortable |
|---|---|---|
| CPU | 1 vCPU (amd64 or arm64) | 2 vCPU |
| RAM | 1 GB (app ~250 MB + PostgreSQL) | 2 GB |
| Disk | 5 GB + attachments + backups (backups need roughly `(DB + attachments) × keepLast`) | SSD |
| Software | Docker Engine 24+ with the Compose plugin | |
| Network | A domain name and a reverse proxy with TLS (required for PWA install, service workers, Web Push and `Secure` cookies) | |

Target scale: a household or small group (≤ 10 users). One app container, no horizontal scaling ([ADR-0001](../decisions/ADR-0001-express-modular-monolith.md)).

## First installation

1. Create a directory (e.g. `/opt/monevo`) with `docker-compose.yml` and `.env.example` from the release.
2. `cp .env.example .env`, set `APP_URL`, `POSTGRES_PASSWORD`, the matching `DATABASE_URL`, and `APP_ENCRYPTION_KEY` (`docker compose run --rm app node dist/cli.js generate-key`). Store `.env` securely and **keep a copy outside the server** ([backups-and-restoration.md](backups-and-restoration.md#what-is-not-in-a-backup)).
3. Configure the [reverse proxy](#reverse-proxy).
4. `docker compose up -d`, then `docker compose logs -f app` until `server listening`.
5. Create the admin: either open `APP_URL` and register (the first user becomes admin), or, recommended for an internet-facing instance, run `docker compose exec app node dist/cli.js create-admin --email you@example.com` **before** exposing the site, or set `BOOTSTRAP_ADMIN_EMAIL` ([authentication.md](../architecture/authentication.md#7-admin-bootstrap)).
6. In the admin panel: check System status, set branding, confirm the backup schedule, and optionally configure OIDC.
7. Run a manual backup and download it once to confirm the procedure works.

## Reverse proxy

The app speaks plain HTTP on port 3000. The proxy must:

- Terminate TLS for `APP_URL`'s host and redirect HTTP to HTTPS.
- Forward `X-Forwarded-For`, `X-Forwarded-Proto`, and `Host`. Set `TRUST_PROXY` to the proxy's address (or network) so client IPs are correct for rate limiting.
- Pass WebSocket upgrades for `/api/v1/realtime` and keep idle connections ≥ 60 s.
- Allow request bodies of at least `MAX_IMPORT_BYTES` (100 MB by default); backup uploads for restore may be larger (or copy archives into the volume instead).
- Not cache `/api/*`, `index.html`, `sw.js`, or the manifest (the app sends correct `Cache-Control`; just don't override it).
- Serve at the domain root. A sub-path deployment (`https://host/monevo/`) is not supported in v1, because the `__Host-` cookie prefix requires `Path=/` and the service worker scope assumes the root.

Caddy example (complete):

```
money.example.com {
    reverse_proxy app:3000
}
```

Traefik and nginx examples ship in the repository's `deploy/` folder in Stage 1; nginx needs `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";` and `client_max_body_size 100m;`.

If the proxy runs in its own compose project, join the app to the proxy's external network and do not publish port 3000 on the host. Otherwise publish it only on `127.0.0.1:3000`.

### LAN-only or no domain

Without HTTPS, browsers disable service workers and push on non-localhost origins, and `Secure` cookies fail. Options: a local CA (Caddy `tls internal`, with the CA installed on devices), a real domain with DNS-01 certificates pointing to a private IP, or a VPN/tunnel. `INSECURE_COOKIES=true` exists only for development.

## Volumes and bind mounts

| Data | Default volume | Back up? |
|---|---|---|
| PostgreSQL | `pgdata` | via Monevo backups (not by copying the directory of a running server) |
| Attachments | `attachments` | via Monevo backups |
| Backups | `backups` | **copy off the host** (S3 target or the host's own backup tool, e.g. restic/borg over the volume directory) |

Named volumes are recommended. For bind mounts, create the directories and `chown -R 1000:1000` them for `attachments` and `backups` (the app runs as uid 1000); PostgreSQL manages its own directory permissions.

Putting `backups` on a different disk than `pgdata` and `attachments` is recommended.

## Upgrades

Monevo is updated manually (no self-update, out of scope).

1. Read the release notes. They state whether the release contains migrations and whether a rollback without restore is possible ([database-architecture.md](../architecture/database-architecture.md#5-migrations)).
2. Take a manual backup (admin UI or `docker compose exec app node dist/cli.js backup`) and copy it off the host. The app also takes an automatic [pre-upgrade backup](backups-and-restoration.md#pre-upgrade-backup) when migrations are pending.
3. Change the image tag in `docker-compose.yml` (pin exact versions; avoid `:latest` in production), then `docker compose pull && docker compose up -d`.
4. Watch `docker compose logs -f app`: migrations, then `server listening`. Check the admin System tab (version, pending migrations = 0, jobs).
5. Clients pick up the new web app on their next load (the service worker shows an "update available" prompt). The API keeps `v1` compatibility, so older cached clients keep working ([api-design.md](../architecture/api-design.md)).

### Rollback

- If the release notes say the migration is backwards-compatible: put the previous tag back and `docker compose up -d`.
- Otherwise: put the previous tag back and restore the pre-upgrade backup with the CLI ([backups-and-restoration.md](backups-and-restoration.md#restore)). Data entered after the upgrade is lost, except unsynced client outboxes, which are offered for review.

### PostgreSQL major upgrades

Changing `postgres:17` to a new major needs a dump/restore (or `pg_upgrade`); the app image's `postgresql-client` must match. This is a documented, deliberate operation in the release notes of the Monevo version that switches majors ([OQ-08](../planning/open-questions.md#oq-08-nodejs-and-postgresql-versions)), never an automatic one. The supported path: Monevo backup → stop → new empty `pgdata` with the new major → CLI restore.

## Operational checklist

- [ ] `APP_URL` is HTTPS and the site loads with a valid certificate.
- [ ] Port 5432 is not reachable from outside (`db` has no published ports).
- [ ] `.env` and `APP_ENCRYPTION_KEY` are stored outside the server.
- [ ] Registration is `DISABLED` after creating the intended users (default after the first admin).
- [ ] Backups succeed (admin Backups tab) and copies leave the host.
- [ ] A restore was tested once on a scratch host.
- [ ] Host OS and Docker get security updates; the Monevo image is updated for security releases.
