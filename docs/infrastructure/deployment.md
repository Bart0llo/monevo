# Deployment

**[Accepted]** Docker Compose on a VPS, homelab, or similar host, with manual updates via Compose (R-INF-03). **[Proposed]** operating procedure. Image and compose details are in [docker-compose.md](docker-compose.md); variables in [configuration.md](configuration.md).

## Requirements

| Item | Minimum | Comfortable |
|---|---|---|
| CPU | 1 vCPU (amd64 or arm64) | 2 vCPU |
| RAM | 1 GB for the app container (~250 MB) and the OS | 2 GB |
| Disk | 5 GB + attachments + backups (backups need roughly `(DB + attachments) × keepLast`) | SSD |
| Database | An external PostgreSQL server in the supported range, with a dedicated database and owning role ([postgresql.md](postgresql.md)) | Low latency to the app host (same host or LAN) |
| Software | Docker Engine 24+ with the Compose plugin | |
| Network | A domain name and a reverse proxy with TLS (required for PWA install, service workers, Web Push and `Secure` cookies) | |

Target scale: a household or small group (≤ 10 users). One app container, no horizontal scaling ([ADR-0001](../decisions/ADR-0001-express-modular-monolith.md)).

## First installation

1. Prepare the external PostgreSQL: a dedicated database and owning role, network access from this host, and TLS if the connection leaves the host or a trusted private network ([postgresql.md](postgresql.md#deployment-checklist)).
2. Create a directory (e.g. `/opt/monevo`) with `docker-compose.yml` and `.env.example` from the release. To use the published image instead of building locally, set `image: ghcr.io/<owner>/monevo:vX.Y.Z` and remove `build:` ([releasing.md](../development/releasing.md#docker-images)).
3. [Register Monevo in Account Center](#registering-monevo-in-account-center) and note the client ID and secret.
4. `cp .env.example .env`, set `APP_URL`, `DATABASE_URL` (pointing at the external database), `APP_ENCRYPTION_KEY` (`docker compose run --rm app node dist/cli.js generate-key`), and the [OIDC variables](configuration.md#oidc) (`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, optionally `OIDC_ADMIN_GROUP`). Store `.env` securely and **keep a copy outside the server** ([backups-and-restoration.md](backups-and-restoration.md#what-is-not-in-a-backup)).
5. Configure the [reverse proxy](#reverse-proxy).
6. `docker compose up -d`, then `docker compose logs -f app` until `server listening` (the entrypoint first waits for the database and applies migrations).
7. Open `APP_URL` and sign in with Account Center. With `OIDC_ADMIN_GROUP` set, members of that group are admins; otherwise the first user who signs in becomes admin, so sign in yourself before anyone else, and restrict access with the application's allowed groups in Account Center ([authentication.md](../architecture/authentication.md#7-admin-bootstrap)).
8. In the admin panel: check System status (including the database version) and the Identity provider card, set branding, and confirm the backup schedule.
9. Run a manual backup and download it once to confirm the procedure works.

## Registering Monevo in Account Center

Monevo signs users in only through Account Center ([ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md), [authentication.md](../architecture/authentication.md#2-oidc-login)). Register it once as an OIDC application, in the Account Center admin UI or with its CLI:

| Setting | Value |
|---|---|
| Client type | Confidential (recommended; Monevo authenticates with `client_secret_basic`). A public client also works: leave `OIDC_CLIENT_SECRET` empty. PKCE S256 is used either way. |
| Redirect URI | `<APP_URL>/api/v1/auth/oidc/callback`, exactly (Account Center compares byte for byte; `http` only on loopback). |
| Post-logout redirect URI | `<APP_URL>/login`, so signing out of Monevo returns to its login page. |
| Allowed groups | The group(s) whose members may use Monevo. Account Center refuses sign-in to everyone else, so Monevo has no allow-list of its own. Without allowed groups, every Account Center user can sign in and get a Monevo account. |
| Exposed groups | Only if you use `OIDC_ADMIN_GROUP`: expose that group so it appears in the `groups` claim. |
| Scopes | `openid profile email groups` (the default `OIDC_SCOPES`). |

Account Center serves its discovery document only after an admin has generated a signing key; until then Monevo's sign-in shows "identity provider unavailable" and the admin Identity provider card reports a discovery error.

CLI example, run in the Account Center deployment (it prints the client secret once; put it in Monevo's `OIDC_CLIENT_SECRET`):

```bash
docker compose exec app node apps/api/dist/oidc/createClient.js --name Monevo   --client-id monevo   --redirect-uri https://money.example.com/api/v1/auth/oidc/callback   --post-logout-redirect-uri https://money.example.com/login   --allowed-group Monevo-Users --exposed-group Monevo-Admins
```

Then set `OIDC_ISSUER` to Account Center's issuer (its `APP_URL`), `OIDC_CLIENT_ID=monevo`, `OIDC_CLIENT_SECRET`, and optionally `OIDC_ADMIN_GROUP=Monevo-Admins` ([configuration.md](configuration.md#oidc)).

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
| Attachments | `attachments` | via Monevo backups |
| Backups | `backups` | **copy off the host** (S3 target or the host's own backup tool, e.g. restic/borg over the volume directory) |

Named volumes are recommended. For bind mounts, create the directories and `chown -R 1000:1000` them for `attachments` and `backups` (the app runs as uid 1000).

The database lives on the external PostgreSQL server and is backed up by Monevo backups ([backups-and-restoration.md](backups-and-restoration.md)); provider snapshots are an optional extra ([postgresql.md](postgresql.md#backup-client-tools)). Putting `backups` on a different disk than `attachments` (and than the database server's storage) is recommended.

## Upgrades

Monevo is updated manually (no self-update, out of scope).

1. Read the release notes. They state whether the release contains migrations and whether a rollback without restore is possible ([database-architecture.md](../architecture/database-architecture.md#5-migrations)).
2. Take a manual backup (admin UI or `docker compose exec app node dist/cli.js backup`) and copy it off the host. The app also takes an automatic [pre-upgrade backup](backups-and-restoration.md#pre-upgrade-backup) when migrations are pending.
3. Set the new tag in `docker-compose.yml` (`image: ghcr.io/<owner>/monevo:vX.Y.Z`; pin exact versions and avoid `:latest` in production, so an upgrade is always a deliberate step), then `docker compose pull` and `docker compose up -d`. Alternatively, build the image locally from a checkout of the release tag (`docker compose build`). Image names and tags: [releasing.md](../development/releasing.md#docker-images).
4. Watch `docker compose logs -f app`: migrations, then `server listening`. Check the admin System tab (version, pending migrations = 0, jobs).
5. Clients pick up the new web app on their next load (the service worker shows an "update available" prompt). The API keeps `v1` compatibility, so older cached clients keep working ([api-design.md](../architecture/api-design.md)).

### Rollback

- If the release notes say the migration is backwards-compatible: put the previous tag back and `docker compose up -d`.
- Otherwise: put the previous tag back and restore the pre-upgrade backup with the CLI ([backups-and-restoration.md](backups-and-restoration.md#restore)). Data entered after the upgrade is lost, except unsynced client outboxes, which are offered for review.

### PostgreSQL major upgrades

PostgreSQL is external, so its major upgrades are done by the database operator or provider, never automatically by Monevo. The target major must be in the range the running Monevo version supports. Procedure and requirements: [postgresql.md](postgresql.md#major-upgrades).

## Operational checklist

- [ ] `APP_URL` is HTTPS and the site loads with a valid certificate.
- [ ] The external PostgreSQL accepts connections only from the Monevo host, over TLS when the connection leaves the host or a trusted network ([postgresql.md](postgresql.md#deployment-checklist)).
- [ ] `.env` and `APP_ENCRYPTION_KEY` are stored outside the server.
- [ ] Access is restricted with the application's allowed groups in Account Center, and the admin signed in first (or `OIDC_ADMIN_GROUP` is set).
- [ ] Backups succeed (admin Backups tab) and copies leave the host.
- [ ] A restore was tested once on a scratch host.
- [ ] Host OS and Docker get security updates; the Monevo image is updated for security releases.
