# ADR-0013: Scheduled transactions and jobs

- **Status:** Proposed
- **Date:** 2026-11-18

## Context

Recurring and one-off planned transactions, automatic or confirmed execution, skipping, amount changes, idempotent generation, reminders, and a calendar with planned items are required (R-REC-*, R-CAL-*). Background work also includes alerts, push, cleanup, and backups.

## Decision

- A single **`ScheduledTransaction`** concept covers recurring and one-off planned items, with `ScheduledAmountChange` and `ScheduledOccurrence` records (skipped, modified, completed). Occurrences are **computed** by pure expansion over local dates in `@monevo/domain` (month-end clamping), not materialized ahead of time.
- AUTO generation runs every 15 minutes in the user's time zone, idempotent through a unique `(scheduled_transaction_id, occurrence_date)`.
- **pg-boss** runs all jobs (cron and on-demand) in PostgreSQL; no Redis.

Details: [scheduling-and-calendar.md](../architecture/scheduling-and-calendar.md).

## Alternatives considered

- **Materializing future occurrences as rows:** edits to the schedule require rewriting rows; unbounded series need a horizon.
- **RRULE (RFC 5545) strings:** powerful but harder to validate, explain, and edit; flat recurrence columns cover the requirements.
- **node-cron / setInterval:** not durable across restarts.
- **BullMQ:** needs Redis.

## Consequences

- The occurrence expansion is shared by the calendar, reminders, forecast, and generation; it needs thorough property tests.
- pg-boss creates its own schema (`pgboss`) in the application database.

## Status

Proposed. Confirm before the stage that first depends on it (see [open-questions.md](../planning/open-questions.md)); until then it is the default.
