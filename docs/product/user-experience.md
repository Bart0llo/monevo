# User Experience

## Design direction

- **Inspired by Cashew, not copied.** Use the same calm, card-based, colorful-category feel, with large readable amounts, quick entry always one tap away, and category colors and icons as the main visual language. All branding (name, logo, palette, typography, illustrations) is original.
- **Mantine UI** is the component system. A custom Mantine theme defines the brand palette, radius, spacing, and typography. Light and dark color schemes are both first-class. "System" follows `prefers-color-scheme`. The visual direction, tokens and styling rules are in [design-system.md](design-system.md).
- **Branding is configurable** by the operator: instance display name, logo, and primary accent color (validated for contrast). Defaults are Monevo's own branding.
- Numbers use tabular figures. Positive inflows and negative outflows use color **and** sign or icon (never color alone, for accessibility).
- **Planned and projected values always look different from actual values:** dashed or outlined styling, a "planned"/"forecast" label, and muted color. Actual values never use dashed styles.

## Navigation

Desktop (≥ `md` breakpoint): a left navigation rail (Mantine `AppShell` navbar). Mobile: a bottom navigation bar with 4 items plus "More", and a floating action button for quick entry.

"More" opens a bottom sheet. Until later stages add their screens, it lists only the destinations that exist (Accounts, Reports, Settings); the quick entry button arrives with quick entry itself.

Primary destinations:
1. **Home** (configurable dashboard)
2. **Transactions** (list, search, filters)
3. **Budgets**
4. **Calendar**
5. **More:** Accounts, Savings (pots and goals), Scheduled (recurring and planned), Forecast, Reports, Categories, Templates, Settings, Admin (admins only)

Global elements: the quick entry FAB and a keyboard shortcut (`N`), the sync status indicator, the notification bell, and the user menu.

## Onboarding

On the first sign-in (right after the user is provisioned from the identity provider):
1. Language (pre-filled from the browser), time zone (pre-filled from `Intl.DateTimeFormat().resolvedOptions().timeZone`), and base currency (suggested from locale, e.g. `pl` → PLN).
2. Create the first account (name, currency, opening balance).
3. Optionally create a few categories. The UI offers *one-click suggestions to create*, which the user explicitly accepts, rather than a silent seed (R-CAT-01).
4. Land on the default dashboard layout.

## Key screens

| Screen | Essentials |
|---|---|
| Home | Widget grid (see [reporting-and-dashboard.md](../architecture/reporting-and-dashboard.md#dashboard)). Edit mode toggles drag handles, resize, and the add-widget drawer. |
| Transactions | Filter bar (collapsible on mobile), list grouped by day (mobile) or table with chosen columns (desktop), bulk-free (no bulk edit in v1), tap to open the detail drawer with History and Attachments tabs. |
| Transaction entry | Quick entry (sheet on mobile, modal on desktop) and full entry (full page on mobile, large modal or page on desktop). Template chips at the top. |
| Accounts | Cards with balance, allocated, available. Archived accounts in a collapsed section. Account detail = filtered transaction list + pots + balance chart. |
| Budgets | Cards with progress rings or bars, pace indicator. Detail with period history and contributing transactions. |
| Savings | Goals (progress, deadline, required pace) and pots grouped by account. |
| Scheduled | Upcoming/overdue occurrences on top, then rules list (recurring) and planned one-offs. |
| Calendar | Month grid with per-day dots and totals. Week columns. Day agenda. Toggle for projected balance. |
| Forecast | Horizon and scenario controls, chart, warnings, assumptions list. |
| Reports | Report type picker, filter panel, chart + table, save configuration, export. |
| Settings | Sections as listed in [features.md](features.md#settings). |
| Sync panel | Status, pending queue, conflicts with resolution UI. |
| Admin | Users, Settings, Storage, Backups, System tabs. |

## Interaction rules

- **Optimistic UI:** offline-capable actions apply instantly, and the item shows a small "pending sync" marker until confirmed. Errors surface as a non-blocking notice with a link to the sync panel.
- **Destructive actions** (delete transaction, delete category, restore backup, revoke session, revoke API token) require confirmation that names the consequence. Transaction deletion explicitly says it is permanent.
- **Forms:** validation messages come from translation keys. Server validation errors map onto fields by path.
- **Money input:** locale-aware decimal separator (`,` for Polish), no float parsing (the input string goes straight to the decimal type), and a currency selector next to the amount when relevant.
- **Dates:** user-local calendar dates. The time picker is optional and hidden in quick entry.
- **Empty states:** every list has an explanatory empty state with a primary action (important because categories start empty).
- **Accessibility:** keyboard-navigable (Mantine defaults), visible focus, ARIA labels from translations, color contrast AA in both themes, and charts accompanied by a data table or accessible summary.
- **Responsiveness:** layouts are tested at 360px, 768px, and 1280px+. No horizontal page scroll on mobile.

## PWA behaviour

- An installable manifest (name/icons from branding, theme color per scheme).
- The app shell loads offline. The data comes from IndexedDB.
- The update flow: when a new service worker is waiting, show "New version available, reload". It never reloads silently while forms are dirty.
- The push permission is requested only from an explicit user action in settings.
