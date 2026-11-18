# ADR-0011: Backup and restore

- **Status:** Proposed
- **Date:** 2026-11-18

## Context

Automatic and manual backups with schedule, retention, download, restore, and status reporting are required (R-BAK-01). Backups must include the database and attachment files and be consistent (R-BAK-02), without stopping the app.

## Decision

A pg-boss job runs `pg_dump -Fc` (consistent snapshot), **then** copies the attachments referenced by that snapshot, and writes a tar with `manifest.json` (versions, migration, checksums, counts) to `BACKUP_PATH`. Consistency relies on **immutable objects and delayed physical deletion** (grace ≥ backup interval). Optional S3 copy, retention by count and age, optional age encryption (**[Proposed]**), automatic pre-upgrade backups (**[Proposed]**). Restore via the admin UI or CLI in maintenance mode with `pg_restore --clean`, file restore, and session invalidation; backups from newer versions are refused. Details: [backups-and-restoration.md](../infrastructure/backups-and-restoration.md).

## Alternatives considered

- **Filesystem or volume snapshots:** depend on the host (LVM/ZFS), not portable.
- **Stopping the app during backups:** downtime.
- **WAL archiving / PITR (pgBackRest):** more robust but heavy for the target operators; can be added by operators independently.
- **External tools only (restic):** do not cover consistency between the DB and files, or the admin UI requirement.

## Consequences

- Deleted attachments stay in storage for the grace period.
- Admins can download all data ([OQ-04](../planning/open-questions.md#oq-04-admin-backup-access-vs-financial-privacy)).
- The image's `pg_dump`/`pg_restore` are the newest supported PostgreSQL major, so they can back up every supported server ([postgresql.md](../infrastructure/postgresql.md#backup-client-tools)).

## Status

Proposed. Confirm before the stage that first depends on it (see [open-questions.md](../planning/open-questions.md)); until then it is the default.
