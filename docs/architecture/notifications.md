# Notifications, Alert Rules, and Insights

**[Proposed]** design for R-NOT-01..05 and R-BUD-03. Email notifications are **[Out of scope]** (R-NOT-05); transactional auth emails are a separate concern ([authentication.md](authentication.md), [OQ-03](../planning/open-questions.md#oq-03-smtp-for-authentication-emails)).

Four modules cooperate:

| Module | Responsibility |
|---|---|
| `notifications` | Notification center storage, preferences, push subscriptions, Web Push delivery. It knows nothing about budgets or schedules. |
| `alerts` | User-defined alert rules and their evaluation. Produces notifications. |
| `insights` | Anomaly detection. Produces insights (and optionally a notification that new insights exist). |
| `scheduling` | Reminders and overdue notices (see [scheduling-and-calendar.md](scheduling-and-calendar.md#4-reminders)). Produces notifications. |

## 1. Data model

```
Notification:           id, userId, type (TEXT + CHECK, open set), params (JSONB), link?, dedupKey,
                        readAt?, createdAt, version
                        UNIQUE (user_id, dedup_key)
NotificationPreference: userId, type, inApp (bool), push (bool), version     PK (user_id, type)
PushSubscription:       id, userId, sessionId?, endpoint (unique), p256dh, auth, userAgent, deviceLabel,
                        createdAt, lastSuccessAt?, failureCount
AlertRule:              id, userId, type, enabled, config (JSONB), state (JSONB), version, createdAt, updatedAt
Insight:                id, userId, type (TEXT + CHECK, open set), fingerprint, params (JSONB), link?,
                        detectedAt, dismissedAt?, resolvedAt?
                        UNIQUE (user_id, fingerprint)
```

- A notification stores a **type and parameters, not rendered text**. Each client renders it in the user's current language from `@monevo/i18n` keys (`notifications.<TYPE>.title/body`). Changing the language re-renders old notifications correctly.
- `link` is an in-app route (`/transactions/<id>`, `/budgets/<id>`, `/scheduled/<id>?occurrence=2026-12-10`), never an external URL.
- Parameters never contain secrets. They may contain amounts and names, because notifications are the user's own data.

### Notification types (initial set, open enum)

| Type | Producer | Default in-app / push |
|---|---|---|
| `PAYMENT_REMINDER` | scheduling | on / on |
| `OCCURRENCE_OVERDUE` | scheduling | on / on |
| `SCHEDULE_NEEDS_CONFIRMATION` (AUTO generation impossible, e.g. no rate) | scheduling | on / on |
| `SCHEDULED_TRANSACTION_CREATED` | scheduling | off / off |
| `BUDGET_THRESHOLD` | alerts | on / on |
| `ACCOUNT_BALANCE_BELOW` | alerts | on / on |
| `CATEGORY_SPENDING_ABOVE` | alerts | on / on |
| `INSIGHTS_AVAILABLE` (daily digest of new insights) | insights | on / off |
| `IMPORT_FINISHED`, `EXPORT_READY` | exportimport | on / off |
| `BASE_CURRENCY_CHANGE_FINISHED` | users | on / off |

R-NOT-03 maps to preferences per type (reminders, budget thresholds, custom thresholds). A missing preference row means the defaults above.

## 2. Notification center

- `GET /notifications?cursor&limit&unread=true`, `POST /notifications/read` (IDs), `POST /notifications/read-all`, `DELETE /notifications/:id`.
- Notifications are a **synced entity** (pulled through the change log) so the bell works offline. "Mark read" is queued offline. `readAt` uses LWW (non-financial).
- Retention is in [database-architecture.md](database-architecture.md#7-data-lifecycle): read notifications 180 days, unread kept.
- Realtime: after commit, `notification:new { id }` is emitted to the user's room as a hint; the client pulls.

## 3. Web Push

R-NOT-02.

- **VAPID** keys come from `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`. If they are absent, the server generates a key pair on first start and stores it encrypted in `app_settings` (see [configuration.md](../infrastructure/configuration.md)). Rotating keys invalidates all subscriptions (the browser must re-subscribe), so the admin UI warns.
- Subscription: the user opts in from Settings (never on first load). The client calls `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` and posts it to `/me/push-subscriptions`. Devices are listed and removable. A subscription is deleted when its session is revoked **[Proposed]** (so a revoked device stops receiving pushes).
- Delivery: `notification.created` → pg-boss job `push.send` → for each of the user's subscriptions, if the type's `push` preference is on → `web-push.sendNotification` with TTL 24 h and urgency `normal` (reminders `high`).
- **Payload text is rendered on the server** with `@monevo/i18n` in the user's locale, because the service worker has no access to the app's state when the page is closed. The payload is `{ title, body, link, notificationId }`, encrypted end-to-end to the browser by the Web Push protocol.
- **Privacy option:** user setting `pushContent = FULL | GENERIC`. `GENERIC` sends only "You have a new notification in Monevo" so amounts and names never transit push services ([security.md](security.md#privacy)).
- Failures: `404`/`410` → delete the subscription. Other errors → pg-boss retry (3 attempts, exponential backoff), then `failureCount++`. Subscriptions with 10 consecutive failures are removed.
- Push is best-effort. The in-app notification is the durable record.

## 4. Alert rules

R-BUD-03. A small fixed set of rule types, **not** an automation engine: rules only create notifications, never change data.

| Rule type | Config | Condition | Period / crossing |
|---|---|---|---|
| `BUDGET_THRESHOLD` | `budgetId`, `thresholdPct` (1–500) | `usedPct(b, currentPeriod) ≥ thresholdPct` | once per budget period |
| `ACCOUNT_BALANCE_BELOW` | `accountId`, `amount` (account currency) | `currentBalance(a) < amount` | once per downward crossing |
| `CATEGORY_SPENDING_ABOVE` | `categoryId`, `includeSubcategories`, `period` (`WEEK`/`MONTH`/`YEAR`), `amount` (base currency) | `expense(category set, current period) > amount` | once per period |

Formulas are in [financial-calculations.md](../data/financial-calculations.md). Budget threshold suggestions in the budget form (80% and 100%) create `BUDGET_THRESHOLD` rules.

### Alert evaluation

- **Triggers:** the job `alerts.evaluate` is enqueued after any committed transaction change (debounced per user: pg-boss `singletonKey = alerts:<userId>`, 30 s delay), after rule or budget edits, and by an **hourly sweep** that covers period rollovers and missed events.
- **Evaluation** reads current values with the same domain functions as the UI, in the user's time zone ("current period" = the period containing `today(userTz)`).
- **Dedup and re-arm:**
  - Period-based rules (`BUDGET_THRESHOLD`, `CATEGORY_SPENDING_ABOVE`) use `dedupKey = alert:<ruleId>:<periodStart>`. They fire at most once per period. Editing the threshold upward lets the rule fire again in the same period (the key includes a config hash).
  - Crossing-based rules (`ACCOUNT_BALANCE_BELOW`) keep `state = { armed: bool, lastCrossingAt }`. They fire when `armed` and the condition becomes true, then disarm. They **re-arm** when the balance is back at or above the amount. `dedupKey = alert:<ruleId>:<crossing counter>`.
  - The unique `(user_id, dedup_key)` constraint makes concurrent or repeated evaluation harmless (`INSERT … ON CONFLICT DO NOTHING`).
- Rules referencing a deleted budget, account, or category are disabled automatically and flagged in the UI. Rules referencing an archived account stay enabled but are skipped.
- Missing rates: if the evaluated total excluded items (`missingRateCount > 0`), the notification says so.
- `AlertRule` is a synced entity with whole-entity LWW (no financial data). The `state` field is server-owned and not editable by clients.

## 5. Insights

R-NOT-04. Insights are **suggestions only**: they are computed, shown, and dismissed. They never modify data, never block actions, and are not notifications (a daily `INSIGHTS_AVAILABLE` notification may point to them).

| Insight type | Detection rule [Proposed] | Fingerprint |
|---|---|---|
| `DUPLICATE` | Two or more `EXPENSE`/`INCOME` transactions in the same account with the same account amount, `occurredOn` within ±1 day, and similar descriptions (normalized trigram similarity ≥ 0.6, or both empty). Transactions generated from the same schedule occurrence are excluded (they cannot be duplicates by construction). | `dup:<sorted transaction ids>` |
| `UNUSUAL_EXPENSE` | Expense `baseAmount` > `max(3 × median, median + 3 × MAD)` of the category's expenses over the last 180 days. Requires ≥ 10 samples in the category. | `unusual:<transactionId>` |
| `BUDGET_OVERRUN` | A budget's current period `spent > effective`, or `pace > 1.2` with ≥ 25% of the period elapsed. | `overrun:<budgetId>:<periodStart>` |
| `MISSING_RECURRING` | A `CONFIRM` occurrence overdue by more than N days (default 3), or an `AUTO` income schedule whose generated transaction was deleted and not replaced. | `missing:<scheduleId>:<occurrenceDate>` |
| `BALANCE_DISCREPANCY` | An account with over-allocated pots (`available < 0`), or a `CASH` account with a negative balance. | `discrepancy:<accountId>:<kind>` |

- Job `insights.detect` runs daily (03:00 server time, users in batches) and after transaction changes (debounced 5 min per user). It also runs on demand from the insights panel.
- Insights are **upserted by fingerprint**. A dismissed insight keeps `dismissedAt` and is not re-suggested while the dismissed row exists (retention 180 days). Insights whose condition no longer holds get `resolvedAt` and are hidden.
- Insights are not synced to IndexedDB. They are fetched online (`GET /insights`, `POST /insights/:id/dismiss`) and cached by TanStack Query for offline display.
- Detection only reads data. A test asserts that the `insights` module has no write access to financial tables (it imports no command handlers).
- AI-based analysis is **[Out of scope]** for v1 (R-REP-06). Insights are deterministic rules.

## 6. Testing

- Unit: each alert rule's condition and dedup/re-arm logic, each insight detector (with property tests for the median/MAD threshold), notification rendering for every type in `en` and `pl`.
- Integration: debounced evaluation after a transaction push, period rollover via the hourly sweep with an injected clock, concurrent evaluation produces one notification, push delivery with a fake `web-push` (subscription cleanup on 410).
- E2E: push permission flow is manual-test only (browsers block automated permission prompts); the in-app center is covered by Playwright.
