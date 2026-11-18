# Backups and Restoration

**[Accepted]** requirements R-BAK-01 and R-BAK-02. **[Proposed]** design, recorded in [ADR-0011](../decisions/ADR-0011-backup-and-restore.md). This document is canonical for the backup procedure; the admin UI is described in [administration.md](../architecture/administration.md#backups-r-bak-01).

An instance **backup** (operator concern, whole instance) is different from a user **export** (per user, see [import-export.md](../architecture/import-export.md)).

## What a backup contains

```
monevo-backup-<UTC yyyymmddThhmmssZ>-<shortId>.tar[.age]
├── manifest.json
├── database.dump            # pg_dump -Fc (custom format), whole application database incl. pgboss schema
└── attachments/             # only for the local driver, or for S3 with includeS3Attachments=true
    └── users/<userId>/attachments/<attachmentId>
```

`manifest.json`:

```json
{
  "format": "monevo-backup",
  "formatVersion": 1,
  "createdAt": "2026-11-18T02:30:00Z",
  "trigger": "SCHEDULED",
  "app": { "version": "1.0.0", "commit": "abc1234" },
  "database": { "serverVersion": "17.6", "latestMigration": "20261118_add_x", "sha256": "…", "sizeBytes": 12345678 },
  "attachments": { "included": true, "driver": "local", "count": 812, "totalBytes": 734003200, "listSha256": "…" },
  "counts": { "users": 4, "transactions": 48211, "attachments": 812 }
}
```

`attachments.listSha256` is the SHA-256 of the sorted list of `storageKey + sha256 + size` lines, so a restore can verify file completeness without trusting the tar. Each file's own `sha256` is already in the `attachments` table.

### What is not in a backup

- `APP_ENCRYPTION_KEY` and other environment secrets. Without the key, encrypted settings (OIDC client secret set via UI, VAPID private key, remote backup credentials) cannot be decrypted after a restore on a new host. **The operator must store the `.env` (or secrets) separately**, e.g. in a password manager.
- `BACKUP_ENCRYPTION_PASSPHRASE` (by definition).
- Older backups and user export files under `BACKUP_PATH`.
- S3 attachments when `backups.includeS3Attachments = false` (then the operator relies on bucket versioning or the provider's own backups; the admin UI shows a warning).

## Consistency model

R-BAK-02 requires the database and the files to match. A global lock is not needed because of two storage rules ([file-storage.md](../architecture/file-storage.md#deletion)):

1. **Objects are immutable.** A storage key is written once and never overwritten.
2. **Physical deletion is delayed** by at least the backup interval (`max(7 days, backup interval)`) through the `storage_deletions` outbox.

Procedure: **first** `pg_dump` (a consistent MVCC snapshot), **then** copy attachments listed in that dump. Every attachment row in the snapshot refers to an object that existed when the dump started and cannot have been physically deleted yet. Objects created after the snapshot are simply not copied (the dump does not reference them). Rows with status `PENDING` are skipped.

## Backup procedure

Job `backups.run` (pg-boss, singleton: only one backup at a time; also triggered by the admin "Run now", the CLI `backup`, and the pre-upgrade hook):

1. Insert a `backups` row (`RUNNING`, trigger) ([data-model.md](../data/data-model.md#backups)).
2. Check free space in `BACKUP_PATH` (estimate = DB size + attachment total × 1.1). Fail early with a clear error if insufficient.
3. `pg_dump --format=custom --no-owner --no-privileges` using `postgresql-client-17` in the app image, streaming into a temp dir under `BACKUP_PATH/.tmp/`. A long `statement_timeout` is used for this connection.
4. Read the attachment list from the dump's snapshot (`pg_dump --snapshot` shares an exported snapshot with the listing query, so the list matches the dump exactly). Copy each `READY` object through the storage driver into `attachments/`, verifying size and SHA-256 while streaming. A missing or mismatching object fails the backup (listed in the error) instead of producing a silently incomplete archive.
5. Write `manifest.json`, build the tar, optionally encrypt ([Encryption](#encryption)), `fsync`, and atomically rename to the final name. Files are created with mode `0600`.
6. Optional remote copy to the S3 target (`remoteStatus`); a remote failure does not fail the local backup but is reported.
7. Mark the row `SUCCEEDED` with size and manifest, then apply **retention**: delete archives (local and remote) beyond `keepLast` and older than `maxAgeDays`, but never the newest successful backup and never `PRE_UPGRADE` backups younger than 30 days.
8. On any failure: mark `FAILED` with an error message, delete temp files, log `event: backup.failed`, and create an admin-visible status (the admin System and Backups tabs show the last failure). There are no email alerts (out of scope).

The job runs at low priority: it uses its own DB connection, streams everything (constant memory), and does not block API requests.

Schedule and retention defaults are in [configuration.md](configuration.md#runtime-settings-app_settings).

## Download

`GET /api/v1/admin/backups/:id/download` requires the ADMIN role and recent authentication ([administration.md](../architecture/administration.md#2-access-control)). The archive streams with `Content-Disposition: attachment`. Archives are never under a static path. Each download is logged (`event: admin.action`, `action: backup.download`).

A downloaded backup contains every user's financial data. This is accepted as operator trust; see [OQ-04](../planning/open-questions.md#oq-04-admin-backup-access-vs-financial-privacy).

## Encryption

**[Proposed]**, see [OQ-14](../planning/open-questions.md#oq-14-backup-encryption).

- Format: [age](https://age-encryption.org/) with a scrypt passphrase recipient, via a maintained library (no custom crypto, R-SEC-03). The archive becomes `….tar.age`; the manifest is inside the encrypted payload, plus a small plaintext sidecar `….manifest.json` with **non-sensitive** fields only (format, createdAt, app version, sizes) so the UI can list backups without decrypting.
- Enabled by `BACKUP_ENCRYPTION_PASSPHRASE` (env) or the admin setting `backups.encryption` with a passphrase entered in the UI (stored encrypted with `APP_ENCRYPTION_KEY`). The env passphrase is preferred because it is not inside the database being backed up.
- Restore asks for the passphrase if it differs from the configured one.
- **Losing the passphrase makes the backup unrecoverable.** The UI requires the admin to confirm this when enabling encryption.
- Encryption protects archives at rest and off-site (S3 target, downloaded copies). It does not stop an admin who knows the passphrase.

## Pre-upgrade backup

**[Proposed]** (`backups.preUpgrade`, default on).

Migrations run in the container entrypoint before the server starts ([docker-compose.md](docker-compose.md#entrypoint)). The entrypoint runs `node dist/cli.js migrate`, which:

1. Compares applied migrations with the migrations in the image. If none are pending, it exits immediately.
2. If migrations are pending and the database already contains data, it takes a backup with trigger `PRE_UPGRADE` (same procedure as in [Backup procedure](#backup-procedure), run inline rather than via pg-boss, because the server is not up yet). Progress is logged to stdout.
3. If the backup fails, the migration is **not** applied and the container exits with a non-zero code and a clear log message. The operator can fix the cause (often disk space) or override once with `MONEVO_SKIP_PRE_UPGRADE_BACKUP=true` on the next start.
4. Runs `prisma migrate deploy`.

This is in addition to the operator's own pre-upgrade backup recommended in [deployment.md](deployment.md#upgrades).

## Restore

Two paths share one implementation (`backups.restore` service):

| Path | When | How |
|---|---|---|
| **Admin UI** | Normal operation, the archive is listed or uploaded | Backups tab → Restore (recent auth + typed confirmation of the instance name) |
| **CLI** | Disaster recovery, the UI is unavailable or the database is empty or broken | `docker compose exec app node dist/cli.js restore <archive> [--yes]`, or `docker compose run --rm app node dist/cli.js restore …` when the server cannot start |

Uploading an archive for restore is possible in the UI (streamed into `BACKUP_PATH`, max size unlimited but disk-space checked).

Steps:

1. **Validate** the archive: readable (decrypt if needed), `format`/`formatVersion` known, manifest checksums match the dump and attachment list. **Refuse** if `app.version` or `latestMigration` is **newer** than the running application (downgrades are not supported): the operator must first upgrade the image. Older backups are accepted; migrations run after the restore.
2. Enter instance **maintenance mode** (`503 MAINTENANCE`, jobs paused, `system:maintenance` socket event; [administration.md](../architecture/administration.md#4-maintenance-mode)).
3. Take a safety backup of the current state (trigger `MANUAL`, labelled `pre-restore` in the manifest) unless the database is empty or `--skip-safety-backup` is given in the CLI.
4. `pg_restore --clean --if-exists --no-owner --single-transaction` into the database. If it fails, the transaction rolls back and the instance stays on the previous data; maintenance mode is lifted and the error is reported.
5. Run `prisma migrate deploy` (for backups from an older version).
6. Restore attachments: write files from the archive into the storage driver (keys are identical; existing identical objects are skipped by size + SHA-256). Objects not referenced by the restored database are **not** deleted immediately: the orphan sweep (`storage.orphanSweep`) runs right after the restore with its normal 24 h age guard, and the `storage_deletions` rows from the dump continue normally.
7. Recompute `users.storage_used_bytes` from the restored `attachments` table.
8. **Invalidate all sessions** (`revokedReason = RESTORE`) and disconnect all sockets. Every device must log in again and re-bootstrap its local database (the sync cursor of the old data is meaningless; the restore sets `system.instanceEpoch` in `app_settings` to the pre-restore value + 1, which is higher than any epoch a client can hold so clients with an older epoch get `410 SYNC_RESYNC_REQUIRED`). Unsynced client outbox entries are kept on the device and shown to the user as conflicts to review after login ([offline-and-synchronization.md](../architecture/offline-and-synchronization.md)).
9. **Re-scan `BACKUP_PATH`**: the restored `backups` table reflects the moment of the backup, so the service re-adds rows (status `SUCCEEDED`, manifest from the archive or sidecar) for archives found on disk that are missing from the table, and marks rows whose files no longer exist as missing.
10. Leave maintenance mode, resume jobs, and log `event: backup.restored` with the archive name and manifest summary.

Restore with the S3 driver and `includeS3Attachments = false`: step 6 is skipped, and the admin is shown how many referenced objects are missing in the bucket (a `HEAD` per key, run as a background verification).

### Restoring on a new host

1. Install as in [deployment.md](deployment.md) with the **same `APP_ENCRYPTION_KEY`** (and backup passphrase if encrypted).
2. Copy the archive into the backups volume.
3. `docker compose run --rm app node dist/cli.js restore /data/backups/<archive> --yes`, then `docker compose up -d`.

## Testing

- Integration (real Postgres + local driver and MinIO): backup then restore round-trip equals the original (row counts, checksums, files); attachments deleted after the dump are still in the archive; a corrupted dump or file fails validation; a backup from a newer migration is refused.
- Retention with an injected clock.
- Pre-upgrade hook: pending migration → backup created; backup failure → migration not applied.
- Restore invalidates sessions and forces client re-bootstrap (E2E).
- A restore drill is part of the Stage 15 acceptance criteria and the release checklist ([implementation-stages.md](../planning/implementation-stages.md#stage-15-backups-restore-and-admin-operations)).
