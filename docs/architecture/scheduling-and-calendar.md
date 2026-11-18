# Scheduling (Recurring and Planned Transactions) and Calendar

**[Accepted]** model, **[Proposed]** job runner. See [ADR-0013](../decisions/ADR-0013-scheduled-transactions-and-jobs.md). Covers R-REC-*, R-CAL-*, and the "planned transactions" aspect of R-FC-01.

## 1. One concept for all future items

A **ScheduledTransaction** describes expected future transaction(s):
- **Recurring:** has a recurrence rule (rent, salary, subscriptions).
- **One-off planned:** no recurrence, a single date (planned larger purchase, expected bonus, annual insurance bill).

There is no separate "planned expenses module" (R-CAL-03). The calendar, forecast, reminders, and "upcoming" list all read scheduled transactions. **Scheduled transactions never affect actual balances** (INV-2). Only a *completed occurrence*, which creates a real transaction, does.

```
ScheduledTransaction
  id, userId, name?, type: INCOME | EXPENSE | TRANSFER
  accountId, destinationAccountId? (transfer), categoryId?, description?, notes?, customFields
  amount (Decimal, positive), currency (original currency; defaults to account currency)
  destinationAmount? / transferRate? (cross-currency transfer; optional – resolved at execution if absent)
  recurrence?: { freq: DAILY|WEEKLY|MONTHLY|YEARLY, interval: int ≥1,
                 byWeekday?: [MO..SU] (WEEKLY), monthDay?: 1..31 | -1 (MONTHLY; -1 = last day),
                 // YEARLY uses startDate's month/day
               }
  startDate (LocalDate), endDate? (LocalDate), maxOccurrences?
  mode: AUTO | CONFIRM
  isBill (bool)                               // UI: due badge, "bills" filter
  reminderDaysBefore? (int ≥0; null = no reminder)
  savingsGoalId?                              // marks planned contributions for calendar/forecast labelling
  status: ACTIVE | PAUSED | ENDED
  version, createdAt, updatedAt

ScheduledAmountChange      // "change the amount from date X on" without rebuilding the schedule
  id, userId, scheduledTransactionId, effectiveFrom (LocalDate), amount, destinationAmount?

ScheduledOccurrence        // stored only when an occurrence has state
  id, userId, scheduledTransactionId, occurrenceDate (LocalDate)   -- UNIQUE(scheduledTransactionId, occurrenceDate)
  state: SKIPPED | MODIFIED | COMPLETED
  override?: { date?, amount?, accountId?, categoryId?, description?, … }   (MODIFIED; also kept when COMPLETED)
  transactionId?   (COMPLETED; cleared by the delete command → see "deleting a generated or confirmed transaction")
  transactionDeletedAt?   (set when the linked transaction was deleted; blocks AUTO regeneration)
  completedAt?, version
```

**Custom intervals** = `interval > 1` with any frequency (every 2 weeks, every 3 months, every 10 days) plus weekday sets. Full RFC 5545 RRULE is intentionally **not** supported, which keeps expansion simple, testable, and time-zone safe.

## 2. Occurrence expansion (pure, in `@monevo/domain`)

`expandOccurrences(schedule, amountChanges, occurrenceRecords, range): Occurrence[]` works on **LocalDates only** (no times, no time zones):

- `DAILY`: `startDate + k·interval days`.
- `WEEKLY`: for weeks `startWeek + k·interval`, each weekday in `byWeekday` (default: the weekday of startDate). Weeks are aligned to the user's week start.
- `MONTHLY`: month `startMonth + k·interval`, day = `monthDay` (default startDate's day). **If the month is shorter, clamp to its last day** (31st → Feb 28/29). `-1` = always the last day.
- `YEARLY`: same month/day every `interval` years. Feb 29 clamps to Feb 28 in non-leap years.
- Stop at `endDate` (inclusive) or after `maxOccurrences` (counting skipped occurrences, since they are still occurrences).
- Amount for occurrence date `d`: the latest `ScheduledAmountChange` with `effectiveFrom ≤ d`, else the base amount. A `MODIFIED` override wins over both.
- `MODIFIED` with an `override.date` moves the occurrence's *effective date* but keeps its identity (`occurrenceDate` = original computed date).
- Output: `{ occurrenceDate, effectiveDate, amount, state: PLANNED | DUE | OVERDUE | SKIPPED | COMPLETED, transactionId? }`, with state computed relative to `today(userTz)`.

Because expansion is pure and shared, the calendar and forecast work **offline** on the client using synced schedules, and the server uses the identical code. Property tests (fast-check) cover clamping, leap years, interval math, end conditions, and amount changes.

## 3. Execution

### AUTO mode
A pg-boss cron job, `schedules.generate`, runs **every 15 minutes** (and on startup):
1. For each user, compute `today` in the user's time zone.
2. Find active AUTO schedules with occurrences where `effectiveDate ≤ today` that are not `COMPLETED`/`SKIPPED`, starting from `max(startDate, schedule.createdAt local date)` (no back-filling of occurrences before the schedule existed unless the user chose "include past occurrences" at creation).
3. For each occurrence, in its **own DB transaction**:
   - `INSERT` a transaction with `source = SCHEDULE_AUTO`, `scheduledTransactionId`, `occurrenceDate`, `occurredOn = effectiveDate`.
   - `INSERT ... ON CONFLICT (scheduled_transaction_id, occurrence_date) DO NOTHING` semantics on the occurrence record, with state `COMPLETED`.
   - Plus the audit (actor `SYSTEM_SCHEDULE`), change log, and post-commit poke.
4. A unique violation on `transactions(scheduled_transaction_id, occurrence_date)` means another worker or a retry already did it. Treat it as success.

**Idempotency guarantees (R-REC-04):** the **database unique constraints** are the guarantee. In addition, pg-boss `singletonKey` prevents overlapping job runs. The job itself is safe to run any number of times, concurrently, or after a crash mid-way.

Generation happens on the **effective date** (local), not ahead of time. Rates for foreign-currency schedules are resolved at generation using the standard algorithm (missing rate → saved with a null `baseAmount`; a cross-currency transfer without a fixed rate and no available rate → the occurrence becomes `DUE` and a notification asks the user to confirm manually).

### CONFIRM mode
- No automatic transaction. Due and overdue occurrences appear in "Upcoming", the calendar, and notifications.
- **Confirm** = command `scheduling.confirmOccurrence { scheduledTransactionId, occurrenceDate, adjustments? }`. It creates the transaction (`source = SCHEDULE_CONFIRMED`) and a COMPLETED occurrence record atomically, under the same unique constraints. Two devices confirming the same occurrence offline: the second push fails the unique check and gets the result `ALREADY_COMPLETED` with the existing transaction ID. The client shows "already confirmed on another device" and, if amounts differ, offers to open the existing transaction (see [sync conflicts](offline-and-synchronization.md#conflict-matrix)).
- **Skip** = creates or updates the occurrence record to `SKIPPED`. **Unskip** deletes the record (if there is no override) or restores `MODIFIED`.
- Confirm early (before the date) is allowed. `occurredOn` defaults to the occurrence date, and the user may pick today.

### Deleting a generated or confirmed transaction
The occurrence record's `transactionId` is set to NULL and its state reverts: the UI asks "Mark this occurrence as skipped, or keep it as due?". If no answer is given (for example a REST client), the record keeps `transactionDeletedAt` set and its effective state becomes `DUE`/`OVERDUE`. AUTO mode **will not** regenerate an occurrence whose record has `transactionDeletedAt` set; it shows as overdue until the user confirms or skips it. This prevents a delete → regenerate loop.

### Editing a schedule
- Editing fields applies to **future, non-completed** occurrences. Completed transactions are never modified retroactively.
- Changing the recurrence rule or `startDate`: existing occurrence records for dates that are no longer produced by the rule are kept if COMPLETED (history) and deleted if SKIPPED or MODIFIED (the UI warns).
- Amount change "from date X" → `ScheduledAmountChange`. "Only this occurrence" → `MODIFIED` record.

## 4. Reminders

- `reminderDaysBefore = N`: a reminder notification is sent on `effectiveDate − N` at the user's **reminder time** (`user_settings.reminderTime`, default 09:00) in the user's time zone. N = 0 means on the due day.
- Job `schedules.remind` runs **every 15 minutes**. For each user whose local time has passed `reminderTime` today, it enqueues reminders for occurrences with `effectiveDate − N = today(local)` and not completed or skipped.
- Dedup: `notifications` has a unique `dedupKey = reminder:{scheduleId}:{occurrenceDate}:{N}`. Re-runs are no-ops.
- Overdue CONFIRM occurrences produce one "overdue" notification (dedupKey `overdue:{scheduleId}:{occurrenceDate}`) on the day after the due date.
- AUTO-generated transactions produce an optional "transaction created" notification (preference, default off).

## 5. Time zones

Rules (also see [internationalization.md](../development/internationalization.md#time-zones)):
1. Occurrence dates, `startDate`, `endDate`, and `occurredOn` are **LocalDates without a time zone**. A rent on "the 10th" is the 10th wherever the user is.
2. "Today" is always computed as `today(user.timeZone)` on the server and `today(device tz → setting)` on the client. The client uses the **user setting**, not the device time zone, for financial dates so all devices agree. The UI warns when the device time zone differs.
3. Instants (reminder fire times, `occurredAt`, `createdAt`) are UTC `timestamptz`. They are converted with `@date-fns/tz` (IANA database), so DST transitions are handled: if a 09:00 reminder falls in a DST gap, use the next valid instant. If ambiguous, use the first.
4. Changing the user's time zone changes when "today" begins for future jobs. It never changes stored LocalDates.

<a id="calendar"></a>

## 6. Calendar

`GET /api/v1/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&accounts=…` (max range 93 days for day/week/month views) returns a list of **items** with a mandatory `kind`:

| kind | Source | Visual |
|---|---|---|
| `TRANSACTION` | completed transactions (`occurredOn` in range) | solid |
| `OCCURRENCE` | expanded scheduled occurrences (PLANNED/DUE/OVERDUE; COMPLETED ones are represented by their TRANSACTION, SKIPPED shown only when "show skipped" is on) | outlined/dashed + "planned" icon; bills with a due badge; overdue in warning color |
| `GOAL_DEADLINE` | savings goal deadlines | flag icon |
| `GOAL_CONTRIBUTION` | occurrences of schedules with `savingsGoalId` (also listed as OCCURRENCE; deduplicated by the client into one item with a goal badge) | piggy-bank badge |

Plus per-day `actualNet` (from transactions) and, optionally, `projectedEndBalance` (from the forecast engine, `kind = PROJECTION` series), always labelled as projected.

Offline, the client computes the same items from IndexedDB with `@monevo/domain` (the endpoint exists for Android and integrations, and for parity tests).

Views: **Month** (grid with dots and day totals), **Week** (7 columns with item lists), **Day** (agenda with actions). The week start follows the user setting.
