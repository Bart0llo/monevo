# ADR-0010: File storage abstraction

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Attachments must live outside PostgreSQL in a local Docker volume or S3-compatible storage behind an abstraction (R-ATT-03), with quotas (R-ATT-02) and secure upload and download (R-ATT-04).

## Decision

A `StorageDriver` interface (`put` stream, `get` stream, `delete`, `head`) with `local` and `s3` drivers, selected by `STORAGE_DRIVER`. Keys are server-generated (`users/{userId}/attachments/{attachmentId}`) and **objects are immutable**. Metadata and quotas live in PostgreSQL (`attachments`, `users.storage_used_bytes` reserved under a row lock). Physical deletion goes through a `storage_deletions` outbox with a grace period. Details: [file-storage.md](../architecture/file-storage.md).

## Alternatives considered

- **Files in PostgreSQL (bytea / large objects):** excluded by the brief; bloats the database and backups.
- **Presigned S3 URLs:** bypass per-request authorization and do not work for the local driver.
- **A third-party storage abstraction (e.g. flydrive):** small benefit over a four-method interface.

## Consequences

- Switching drivers on an existing instance needs a migration tool (deferred).
- The delayed deletion makes backups consistent ([ADR-0011](ADR-0011-backup-and-restore.md)) at the cost of keeping deleted files for the grace period.

## Status

Accepted.
