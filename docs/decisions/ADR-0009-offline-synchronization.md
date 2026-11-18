# ADR-0009: Offline synchronization

- **Status:** Proposed
- **Date:** 2026-11-18

## Context

The app must work offline, queue changes durably, sync automatically, show conflicts, and never silently lose financial data (R-OFF-01..06). Socket.IO may notify, but sync must not depend on it (R-OFF-04).

## Decision

- A per-user monotonic sequence (`user_sync_state.last_seq`, row-locked) and a **compacted change log** (one row per entity; tombstones kept 90 days, then `410 SYNC_RESYNC_REQUIRED`).
- **Pull** by cursor (0 = bootstrap). **Push** ordered mutations with client-generated UUIDv7 IDs; each mutation runs in its own DB transaction and is idempotent (`idempotency_records`, 30 days).
- **Field-level three-way merge** using the client's `baseValues`: concurrent changes to financial field groups become conflicts the user resolves; non-financial fields use last-writer-wins.
- Dexie (IndexedDB) on the client, a Web Locks leader tab, Socket.IO only for pokes. Attachments are online-only in v1.

Details: [offline-and-synchronization.md](../architecture/offline-and-synchronization.md).

## Alternatives considered

- **CRDTs / Automerge / Yjs:** silent automatic merges are wrong for financial values, and the data is relational.
- **Whole-record last-writer-wins:** loses data (violates R-OFF-06).
- **Off-the-shelf sync engines (PowerSync, ElectricSQL, RxDB replication):** extra infrastructure or licensing, and less control over financial conflict rules.
- **Event sourcing:** too heavy for the scale.

## Consequences

- Every synced entity needs a sync adapter and merge policy.
- The protocol is a core contract; later changes need careful versioning.

## Status

Proposed. Confirm before the stage that first depends on it (see [open-questions.md](../planning/open-questions.md)); until then it is the default.
