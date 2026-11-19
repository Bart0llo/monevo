# External PostgreSQL

**[Accepted]** Monevo uses an **externally hosted PostgreSQL** database and connects to it through `DATABASE_URL` ([ADR-0015](../decisions/ADR-0015-external-postgresql.md), [OQ-08](../planning/open-questions.md#oq-08-nodejs-and-postgresql-versions), R-INF-01). The Monevo Compose stack runs the application container only; it never requires a PostgreSQL container ([docker-compose.md](docker-compose.md)). This document is canonical for supported versions, the connection, TLS, pooling, database privileges, extensions, the backup client tools, and major upgrades. Schema conventions are in [database-architecture.md](../architecture/database-architecture.md).

"External" means only that the database is not part of the Monevo stack. It can be a managed service, a PostgreSQL server the operator already runs, or a separate container or VM on the same host. Monevo uses the standard wire protocol and SQL only, with no provider-specific configuration or features.

## Supported versions

- **Policy:** Monevo supports PostgreSQL major versions that are still maintained by the PostgreSQL Global Development Group (not end-of-life) **and** supported by the Prisma release Monevo ships with.
- **Supported majors: PostgreSQL 16, 17, and 18.** The minimum is **PostgreSQL 16** ([ADR-0018](../decisions/ADR-0018-postgresql-16-minimum.md)); 18 is the newest major tested with this release.
- Monevo never targets an end-of-life major. The minimum is raised only in a release whose notes say so, typically when that major reaches end-of-life (PostgreSQL 16: November 2028) or a needed feature requires a newer one. Lowering or raising it needs an ADR.
- **Newer majors** are supported once the integration suite passes against them. The newest supported major is listed in the release notes.
- **Startup check:** the server reads `server_version_num` at startup and compares its major with `MIN_SUPPORTED_MAJOR` and `NEWEST_SUPPORTED_MAJOR` in `apps/server/src/infra/database.ts`. Below the minimum (for example PostgreSQL 15), it refuses to start with a readable error. Above the newest supported major, it starts but logs a warning, and the admin System status reports the database as `WARN` ([administration.md](../architecture/administration.md#system-r-adm-02-r-adm-06)).
- Only Prisma-compatible features are used. Raw SQL in migrations (CHECK constraints, partial indexes, composite foreign keys, triggers) uses plain PostgreSQL features that are available in every supported major ([database-architecture.md](../architecture/database-architecture.md#5-migrations)).
- **No PostgreSQL 17+ features.** Schema, migrations, and raw SQL must work on PostgreSQL 16. Features added in 17 or later (for example `JSON_TABLE` and the SQL/JSON query functions, `MERGE ... RETURNING`, `uuidv7()`, `OLD`/`NEW` in `RETURNING`) need an ADR that either raises the minimum or names a PostgreSQL 16 alternative.

## Connection

`DATABASE_URL` (or `DATABASE_URL_FILE`) is required and has no default ([configuration.md](configuration.md#database)). Monevo hard-codes no host name, credentials, or provider.

```
postgresql://<user>:<password>@<host>:<port>/<database>?sslmode=verify-full&sslrootcert=/run/secrets/postgres-ca.pem
```

- Percent-encode reserved characters in the user name and password.
- The same URL is used by Prisma (`@prisma/adapter-pg`, node-postgres), by pg-boss, and by `pg_dump`/`pg_restore` (libpq) for backups. Use only the parameters described here, because they mean the same thing to both client libraries. Stage 1 tests the URL handling with both.
- **Reachability:** the app container must reach `<host>:<port>`. For a PostgreSQL server on the same Docker host, either attach the app to a Docker network that the database is also on (an external network in the compose file), or use the host's address (`host.docker.internal` with `extra_hosts: ["host.docker.internal:host-gateway"]`). The server must listen on that interface and allow the connection in `pg_hba.conf`.
- **Startup:** the entrypoint waits up to 60 s for the database before running migrations ([docker-compose.md](docker-compose.md#entrypoint)). After that, readiness reports the database check ([monitoring-and-logging.md](monitoring-and-logging.md)).
- One database per Monevo instance. Don't share it with other applications: restore replaces the whole database ([backups-and-restoration.md](backups-and-restoration.md#restore)).

## TLS

- **Use TLS whenever the connection leaves the host or a trusted private network.** Use `sslmode=verify-full` with the server's CA certificate (`sslrootcert=<path>`). It is the only mode that checks both the certificate chain and the host name, and it behaves the same in node-postgres and libpq.
- Avoid `sslmode=require`, `prefer`, and `verify-ca`: node-postgres and libpq interpret them differently (node-postgres may treat them as `verify-full`, while libpq skips the host-name check or the certificate check), so the server and the backup tools could behave inconsistently.
- `sslmode=disable` is acceptable only when the database is on the same host or on an isolated private network.
- Certificate files (`sslrootcert`, and for client-certificate authentication `sslcert` and `sslkey`) are mounted read-only into the container, for example under `/run/secrets/`, and must be readable by uid 1000 ([docker-compose.md](docker-compose.md#runtime-properties)). Paths in the URL refer to the container's filesystem.

## Connection pooling

Monevo opens at most:

| User | Connections |
|---|---|
| API pool | `DATABASE_POOL_SIZE` (default 10) |
| pg-boss | 3 |
| Backup or restore (`pg_dump`/`pg_restore` plus the snapshot session) | 2, only while running |
| Migrations at startup | 1, only while running |

Plan for about **16 connections plus headroom** with the defaults. The server's `max_connections` and any per-role connection limit must allow this. Details of the pools: [database-architecture.md](../architecture/database-architecture.md#6-connection-management).

- Connect **directly** or through a **session-mode** pooler. **Transaction-mode poolers** (PgBouncer `pool_mode = transaction`, or a managed "pooled" endpoint that works the same way) are **not supported**: migrations use advisory locks, and `pg_dump` and pg-boss need session state. If a provider offers both a pooled and a direct endpoint, use the direct one.
- An external pooler is not needed at the target scale: there is a single application container ([deployment.md](deployment.md#requirements)).

## Database and role

- A **dedicated database** with `UTF8` encoding, and a **dedicated login role that owns it**. The role is never a superuser ([security.md](../architecture/security.md#database)).
- The role needs `CONNECT` and `CREATE` on the database (for the `pgboss` schema and the extensions below), and it must own every object Monevo creates: migrations create them, and restore drops and re-creates them.
- Self-managed example:

```sql
CREATE ROLE monevo LOGIN PASSWORD '<long random>';
CREATE DATABASE monevo OWNER monevo ENCODING 'UTF8' TEMPLATE template0;
```

- On a managed service, create the database and role with the provider's tools, with the same ownership.
- **Network access** to the database is restricted by the operator (firewall, provider allowlist, `pg_hba.conf`) to the Monevo host. PostgreSQL is never exposed publicly without TLS and source restrictions (R-INF-02).

## Extensions

Monevo may use only these three extensions from the standard PostgreSQL distribution ([database-architecture.md](../architecture/database-architecture.md#1-conventions)):

| Extension | Used for | Justification |
|---|---|---|
| `citext` | Not used at present: since [ADR-0020](../decisions/ADR-0020-oidc-only-authentication.md) `users.email` is an informational, non-unique copy of the IdP claim | Kept on the allowed list for case-insensitive keys if one is needed later |
| `pg_trgm` | Trigram GIN index for "contains" search on transaction descriptions | Fast substring search; there is no core alternative |
| `unaccent` | Accent-insensitive search (Polish text) | Needed together with `pg_trgm` for usable search in `pl` |

`pg_trgm` and `unaccent` arrive with transaction search (Stage 4). All three are marked **trusted** in every supported major, so the owning role can create them without superuser rights. Migrations run `CREATE EXTENSION IF NOT EXISTS`. If a provider restricts extensions, the database administrator creates them beforehand and the migration step is a no-op. Adding another extension needs a written justification in [database-architecture.md](../architecture/database-architecture.md) and an entry here.

## Backup client tools

- The application image contains `pg_dump` and `pg_restore` of the **newest supported major**, pinned in the Dockerfile ([docker-compose.md](docker-compose.md#build-multi-stage)). `pg_dump` can dump servers of its own or an older major, so one client covers the whole supported range.
- If the server's major is newer than the client (for example, a provider upgraded the database before a Monevo release supports that major), backups fail with a clear error and the admin System status warns. The fix is a Monevo release with newer client tools.
- Provider-native backups (snapshots, point-in-time recovery) are a useful extra, but Monevo backups remain the supported restore path because they keep the database and attachments consistent ([backups-and-restoration.md](backups-and-restoration.md)).

## Major upgrades

The database operator or provider upgrades PostgreSQL (`pg_upgrade`, the provider's upgrade function, or dump and restore). Monevo does not upgrade the database itself. The procedure:

1. Check that the target major is within the supported range of the running Monevo version, and not newer than its backup client tools.
2. Take a Monevo backup and copy it off the host ([backups-and-restoration.md](backups-and-restoration.md)).
3. Stop the app container, upgrade the database, update `DATABASE_URL` if the host or port changed, and start the app.
4. Check the admin System status (database version, pending migrations = 0).

Alternative: create a new empty database on the new server, point `DATABASE_URL` at it, and restore the backup with the CLI ([backups-and-restoration.md](backups-and-restoration.md#restore)).

## Deployment checklist

- [ ] The PostgreSQL major is within the [supported range](#supported-versions).
- [ ] A dedicated UTF8 database is owned by a dedicated non-superuser role.
- [ ] TLS with `sslmode=verify-full` whenever the connection leaves the host or a trusted private network.
- [ ] Database access is restricted to the Monevo host.
- [ ] A direct or session-mode connection, with enough connections for the [pool budget](#connection-pooling).
- [ ] The three extensions are available, or were created by the database administrator.

## Testing

- Startup version check (unit tests): PostgreSQL 15 and older refuse to start; 16, 17, and 18 are accepted; above the newest supported major warns.
- Integration tests run against the minimum supported major (PostgreSQL 16: `db-test` in `docker-compose.dev.yml`, Testcontainers, and the E2E database) by default ([testing-strategy.md](../development/testing-strategy.md)). Before a release they also run against the newest supported major, for example with `TEST_DATABASE_URL` pointing at a PostgreSQL 18 server.
- URL handling: the same `DATABASE_URL` (including TLS parameters) is accepted by node-postgres and passed correctly to `pg_dump`/`pg_restore`.
- Container smoke test: the `pg_dump --version` major equals the newest supported major.
