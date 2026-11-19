# Feature Catalogue

This document describes the behaviour of each feature from the user's point of view. Technical design lives in the architecture documents linked from each section, and requirement IDs refer to [requirements.md](requirements.md).

## Accounts
*R-ACC-01..05 · design: [financial-domain-model.md](../architecture/financial-domain-model.md)*

- Create an account with: name, currency (ISO 4217), kind (a suggested kind or custom label), icon, color, opening balance and opening date, an "include in net worth" display preference (default on; see below), and sort order.
- **Currency is immutable** once the account has any posting. To change it, the user creates a new account and transfers the balance.
- **Archive policy [Proposed]:**
  - Any account can be archived at any time. Archived accounts are hidden from entry pickers and default lists, and cannot receive new transactions or allocations. Their history stays visible in reports and the transaction list.
  - The balance of an archived account **still counts** in net worth (money does not vanish because an account is hidden). When archiving an account with a non-zero balance, the UI warns and suggests a transfer or adjustment first.
  - Unarchiving is always possible.
  - **Deletion** is only allowed for accounts with no postings, no pots, no scheduled transactions, and no goal links. Otherwise the user must archive. This avoids implicit mass deletion of financial history.
- "Include in net worth": a display-only preference that lets a user exclude an account from the *dashboard total* widget. It **never** affects reports or calculations other than that widget's displayed total, and it defaults to on. *(Kept minimal; this is not an asset module.)*
- Balance, allocated amount (pots), and available balance are shown per account.

## Categories
*R-CAT-01..02*

- Categories start empty, and the onboarding screen invites the user to create a few. Each category has: name, type (`INCOME`/`EXPENSE`), icon (from a bundled icon set), color, optional parent (one level of subcategories only), and sort order.
- **Reorganize:** drag to reorder, move a subcategory to another parent of the same type, promote a subcategory to top level, demote a childless top-level category under a parent. Type changes are only allowed when the category has no transactions, budgets, templates, or scheduled transactions referencing it.
- **Delete:** if referenced by transactions, the user chooses to (a) reassign to another category of the same type, or (b) leave them uncategorized. Deleting a parent applies the same choice to its subcategories. Budgets drop the deleted category from their sets, and templates and scheduled transactions lose the category reference (the user is warned).
- A transaction's category must match its type: income uses income categories, expense uses expense categories. Transfers and adjustments have no category.

## Transactions
*R-TX-01..12 · design: [financial-domain-model.md](../architecture/financial-domain-model.md)*

### Types
- **Income / Expense:** one account, an amount, optionally in a foreign currency (original amount and currency + rate → account amount).
- **Transfer:** source account and amount, destination account and amount. Different currencies require a transfer rate. The user may enter the rate or both amounts (the rate is then derived). Same-currency transfers have equal amounts.
- **Adjustment [Proposed]:** sets or corrects a balance (for example "my bank says 1 234.56"). The UI asks for the target balance and computes the difference. It is excluded from income and expense statistics.

### Quick entry
A minimal sheet or dialog reachable from a floating action button and a keyboard shortcut. It contains:
type toggle (expense/income/transfer) → amount (numeric keypad on mobile) → category (recent and frequent first) → account (last used preselected) → save. Optional one-line description. Templates appear as chips at the top: tapping one pre-fills everything except the amount. The date defaults to today, with a small "yesterday / pick" control. If the selected account's currency differs from the entered currency, the rate is fetched or derived automatically, and quick entry shows the converted amount.

### Full entry
All fields: type, account(s), amount and currency, original currency with rate override, date and optional time, category/subcategory, description, notes, custom fields, attachments, "save as template", "make recurring" (creates a scheduled transaction from this one, see [scheduling](../architecture/scheduling-and-calendar.md)), and the transfer fee option (creates a linked expense; see [financial-domain-model.md](../architecture/financial-domain-model.md#transfer-fees)).

### Templates
Name, type, default account(s), category, description, notes, custom field values, optional default amount and currency. They can be used from quick entry, full entry, and the template list. Using a template never auto-saves: it pre-fills a form.

### Custom fields
The user defines fields (name, type: `TEXT`, `NUMBER`, `DATE`, `BOOLEAN`, `SELECT` with options), an optional per-type applicability (income/expense/transfer), and order. Values are shown in full entry and as optional list columns. Custom fields are **not** filterable in v1 (R-TX-10 lists the filter set), and they are not tags.

### Editing, deletion, history
- Every field is editable. Editing a foreign-currency transaction keeps a manual rate if one was set; otherwise, changing the date re-resolves the rate (see [multi-currency.md](../architecture/multi-currency.md#when-rates-are-re-resolved)).
- Delete is permanent and requires confirmation that states "this cannot be undone". Attachments are deleted with the transaction.
- **History** tab on each transaction: a chronological list of changes (field, old → new, when, by whom/what: user via device X, recurring automation, import). A global **"Recent changes"** view lists history across transactions, including deletions, so deleted items remain discoverable as minimal records.

### List, search, customization
- A virtualized list grouped by day, with daily totals in the base currency. Infinite scroll uses cursor pagination.
- Filters: amount (exact or min/max, on the absolute account amount or base amount, user toggle), date range presets and custom, accounts (multi), categories (multi, including subcategories), description text (contains, case- and diacritic-insensitive), and type.
- Sort by date, amount, category, account, or description, ascending or descending.
- Column chooser (desktop table mode): date, description, category, account, amount, base amount, original amount, custom fields, attachment indicator. The preference is stored in the user settings, not as named saved views.

## Multi-currency
*R-CUR-01..07 · design: [multi-currency.md](../architecture/multi-currency.md)*

- The user picks a base currency at onboarding. Changing it later is a deliberate operation (see [OQ-05](../planning/open-questions.md#oq-05-changing-the-base-currency)).
- Rates screen: view stored rates by pair and date, add or edit manual rates, and fetch from the provider for a date (online only).
- Transactions show the original and converted amounts and the rate source badge (Provider / Manual / Derived).
- When a conversion to base currency is missing, the transaction is marked "rate missing". Totals show a warning with a one-click "resolve missing rates" action.

## Budgets
*R-BUD-01..03 · formulas: [financial-calculations.md](../data/financial-calculations.md#budgets)*

- Create unlimited budgets: name, icon, color, period (`WEEKLY`, `MONTHLY`, `YEARLY`, `CUSTOM` one-off date range, or `CUSTOM` repeating every N days from an anchor date), categories (one or more expense categories; selecting a parent includes its subcategories), an optional account filter, limit mode (manual amount, or auto = average spending of the last N completed periods × adjustment %), rollover on or off, and alert thresholds.
- Budget cards show spent, remaining, % used, a daily allowance for the rest of the period, and a pace indicator (spent vs. expected linear spend).
- History view: per-period spent vs. limit.
- Budgets can overlap (the same category in several budgets). There is no forced methodology. Budgets are always in the base currency.

## Alert rules
*R-BUD-03 · design: [notifications.md](../architecture/notifications.md)*

Three rule types, each enabled or disabled individually:
1. **Budget threshold:** budget X reaches P% (default suggestions 80% and 100%).
2. **Account balance below:** account X balance < amount (in the account currency).
3. **Category spending above:** category X (optionally with subcategories) spending in the current week, month, or year > amount (base currency).

Each rule fires at most once per period or crossing (see the dedup rules in [notifications.md](../architecture/notifications.md#alert-evaluation)).

## Savings pots and goals
*R-SAV-01..02 · design: [financial-domain-model.md](../architecture/financial-domain-model.md#savings-pots)*

- **Pots:** created inside an account (same currency). Allocate into or release from them with optional notes. The account shows balance / allocated / available. Pots never add to totals. Over-allocation (allocated > balance) is allowed but flagged.
- **Goals:** name, icon, color, target amount (in the base currency or the linked account/pot currency), optional deadline, and a progress source: one pot **or** one account (a dedicated savings account). Progress, the required contribution per month or week to reach the deadline, and contribution history (pot allocations, or inflows to the account) are shown. Goals can be paused, completed, or archived.
- Goal events in the calendar: deadline, and optional planned contributions (scheduled transfers into a savings account, or scheduled allocations; see scheduling).

## Recurring and planned transactions
*R-REC-01..05 · design: [scheduling-and-calendar.md](../architecture/scheduling-and-calendar.md)*

- One concept, the **scheduled transaction**, covers recurring payments and income, one-off planned expenses or income, and bills with deadlines.
- Fields: everything a transaction has (type, accounts, amount, currency, category, description, custom fields), plus a recurrence (none = one-off; daily/weekly/monthly/yearly with interval N; weekly on chosen weekdays; monthly on day X or "last day"), start date, optional end date or occurrence count, mode (`AUTO`/`CONFIRM`), reminder (off, or N days before, at the user's configured reminder time), and whether it is a bill (shows a "due" badge).
- Per occurrence: skip, modify once (amount/date/fields), confirm early, or confirm with changes.
- Change the amount "from date X on" without touching earlier occurrences.
- "Upcoming" list: due and overdue occurrences with quick confirm/skip.

## Calendar
*R-CAL-01..03 · design: [scheduling-and-calendar.md](../architecture/scheduling-and-calendar.md#calendar)*

Month, week, and day views. Each day shows completed transactions (solid style) and planned occurrences (outlined or dashed style with a "planned" icon), bills (due badge, overdue in warning color), expected income, and goal events. Selecting a day lists its items with actions (confirm, skip, open). A projected end-of-day balance (from the forecast) can be toggled on and is labelled "projected".

## Forecasting
*R-FC-01..03 · design: [forecasting.md](../architecture/forecasting.md)*

The forecast screen has a horizon selector (30/90/180/365 days or custom), account selection, a scenario toggle (Scheduled only / With estimated spending), a line chart of projected total and per-account balances (dashed, labelled "forecast", with a band for the estimate scenario), expected income vs. expense for the period, lowest projected balance and date, warnings (an account projected below zero or below an alert threshold), and a list of assumptions (missing rates, overdue items assumed pending, goals with planned contributions).

## Reports
*R-REP-01..06 · design: [reporting-and-dashboard.md](../architecture/reporting-and-dashboard.md)*

Report types: **Income vs. expense over time**, **Spending by category** (pie/donut plus a table, with drill-down into subcategories and transactions), **Category trend**, **Month comparison** (two or more months side by side), **Year comparison**, **Savings** (net savings, savings rate, pot and goal progress), **Net worth over time**, **Recurring expenses review** (active recurring expenses, monthly/yearly cost equivalents, changes). Common filters: date range, accounts, categories, type. Users can save named report configurations, and export report data as CSV/JSON (and the chart as PNG, rendered client-side).

## Dashboard
*R-DASH-01 · design: [reporting-and-dashboard.md](../architecture/reporting-and-dashboard.md#dashboard)*

Widgets: total balance (net worth), account balances, budgets overview, single budget, spending by category (chart type selectable), income vs. expense, recent transactions, upcoming payments, savings goals, forecast mini-chart, net worth trend, notifications/insights. The user can add, remove, show or hide, drag to reorder, resize (S/M/L/full width), and configure per widget (period, accounts, categories, chart type).

## Notifications and insights
*R-NOT-01..05 · design: [notifications.md](../architecture/notifications.md)*

- Notification center (bell icon): unread count, mark read, mark all read, delete, and a deep link to the related item.
- Preferences per notification type: in-app on/off, push on/off. The reminder time of day is configurable.
- Push: an opt-in prompt from settings (never on first load). Devices are listed and removable.
- Insights panel: possible duplicates, unusually high expenses, budget overruns, missing recurring payments, balance discrepancies. Each can be dismissed or opened. Nothing changes automatically.

## Attachments
*R-ATT-01..05 · design: [file-storage.md](../architecture/file-storage.md)*

Drag and drop or pick multiple files in full entry and transaction detail, with upload progress. A thumbnail or preview is shown for images and PDFs, and a generic icon otherwise. The user can download or delete, and sees a quota usage bar in settings. Uploads require connectivity in v1 (see [OQ-09](../planning/open-questions.md#oq-09-offline-attachment-uploads)).

## Sync status
*R-OFF-01..06 · design: [offline-and-synchronization.md](../architecture/offline-and-synchronization.md)*

A header indicator shows: synced, syncing, offline (N pending), or error/conflicts. The sync panel shows the pending changes list, last successful sync, "sync now", errors with explanations, and a **conflict resolution** view (side-by-side comparison; keep mine, keep server, or edit merged).

## Settings
Profile (display name; the email address is shown read-only and managed in Account Center), language, time zone, base currency, week start, date format preference, theme (light/dark/system), reminder time, notification preferences, push devices, active sessions (revoke), personal API tokens (create with name, permissions, and optional expiration; list with created, expires, last used, and status; rename; revoke; see [api-tokens.md](../architecture/api-tokens.md#5-token-management)), custom fields, templates, export/import, storage usage.

## Import / export
*R-EXP-01..03 · design: [import-export.md](../architecture/import-export.md)*

Export: choose JSON (complete, re-importable) or CSV (spreadsheet-friendly, zipped per entity), and pick the scope (all, or selected accounts with their transactions, categories, budgets). Import: upload a Monevo JSON export → validation report (errors and warnings per record) → preview counts → confirm → result summary.

## Administration
*R-ADM-01..06 · design: [administration.md](../architecture/administration.md)*

Users (list, status, role, created, last login, storage used, quota override, activate/deactivate, role unless managed by the IdP group), settings (default quota, max upload size, instance name/logo/accent, rate provider; identity provider status read-only), storage (driver status, total used), backups (schedule, retention, run now, list, download, restore, status), and system (version, uptime, DB and migration status, job status).
