# Frontend Architecture

**[Accepted]** React + TypeScript + Mantine + Recharts + i18next + PWA + IndexedDB. **[Proposed]** libraries and structure (see [technology-stack.md](technology-stack.md)).

## 1. Shape

A single-page application built with Vite and served by Express from the same origin. Layout and folders are in [application-structure.md](application-structure.md#frontend-feature-folder-convention).

```
main.tsx
 └─ <AppProviders>   MantineProvider(theme, colorScheme) · I18nextProvider · QueryClientProvider
                     · AuthProvider · LocalDbProvider · SyncProvider · Notifications/Modals
     └─ <RouterProvider>  public routes (login)
                          protected routes (AppShell layout → features)  · admin routes (role guard)
```

## 2. Data access strategy

There are two clearly separated kinds of data:

| Kind | Examples | Source of truth in the UI | Library |
|---|---|---|---|
| **Synced entities** | accounts, categories, transactions, schedules, budgets, pots, goals, templates, settings, dashboard, rates, notifications | **IndexedDB replica** (reads via Dexie `useLiveQuery`), writes via local repositories → outbox | Dexie + sync engine |
| **Server-only data** | reports, server forecast, transaction history, sessions, admin, exports/backups, attachment lists | Server (cached) | TanStack Query (persisted to IndexedDB for offline display with a "data as of" label) |

Feature code never calls `fetch` directly. It uses:
- `data/repositories/<entity>.ts` → `list/get/useX` hooks (live queries) and `create/update/remove` (optimistic local write + outbox enqueue).
- `data/api/*.ts` → typed API client generated from or typed by `@monevo/contracts` (thin `fetch` wrapper adding CSRF header, problem+json parsing into `ApiError` with `code`).

Derived values (balances, budget progress, calendar items, local forecast) are computed by `@monevo/domain` in memoized selectors over live query results. Expensive computations (forecast over 365 days, large transaction sets) run in a **Web Worker** (Comlink) **[Proposed]** to keep the UI responsive.

## 3. Sync engine (client)

See [offline-and-synchronization.md](offline-and-synchronization.md#10-client-design). Lives in `data/sync/`:
- `SyncEngine` (single instance per tab, leader-elected via Web Locks): push loop, pull loop, backoff, socket hint handling.
- `useSyncStatus()` → `{ state: 'synced'|'syncing'|'offline'|'error', pendingCount, conflictCount, lastSyncAt }`.
- The conflicts UI is under `features/sync/`.

## 4. Auth on the client

- On load, `GET /api/v1/auth/session` → user, settings, CSRF token. If offline and a replica exists for the last user, enter **offline mode** using cached user info (actions queue, and server calls are skipped). Any 401 when online → login screen (the outbox is preserved for the same user).
- `/login` is the only public route: one "Sign in with {provider}" button that navigates to `GET /api/v1/auth/oidc/start` ([authentication.md](authentication.md#2-oidc-login)). The OIDC callback is handled by the server, which redirects back to `returnTo` or to `/login?error=<code>`. There are no registration, password reset, or email verification pages.
- Role guard for `/admin/*` routes (UX only; the server enforces it).

## 5. Forms and validation

- `@mantine/form` with a Zod resolver using `@monevo/contracts` schemas (the same rules as the server).
- Money input component: a locale-aware text input that normalizes to a decimal string. It validates precision against the currency exponent and never uses `Number` parsing.
- Server `422` errors are mapped to form fields via `errors[].path`.

## 6. Routing (indicative)

```
/login /onboarding
/                   dashboard
/transactions       list (filters in URL query params for shareable/back-button state)
/transactions/new   full entry (quick entry is a modal available everywhere)
/transactions/:id   detail (drawer on desktop, page on mobile)
/accounts[/:id]  /categories  /budgets[/:id]  /savings[/goals/:id|/pots/:id]
/scheduled[/:id]  /calendar?view=month&date=  /forecast  /reports/:type
/templates  /settings/*  /sync  /admin/*
```
Routes are lazy-loaded per feature (code splitting) to keep the initial bundle small for mobile.

## 7. UI composition

- Mantine `AppShell` (navbar desktop, footer nav mobile), `Drawer`/`Modal` for entry forms, `Spotlight` **[Proposed]** for quick navigation and search.
- Theme: `createTheme` with brand tokens ([design-system.md](../product/design-system.md)). Color scheme via `useMantineColorScheme`, persisted in user settings (synced) and also in `localStorage` for pre-auth screens.
- Charts: Recharts (or `@mantine/charts` wrappers) inside a shared `ChartCard` that handles loading, empty, missing-rate warnings, and accessible table fallbacks. Forecast series use dashed strokes, and actual series use solid strokes (enforced by `ChartCard` props `kind: 'actual'|'forecast'`).
- Icons: Tabler. The category icon picker uses a curated subset (lazy-loaded).
- Dashboard: see [reporting-and-dashboard.md](reporting-and-dashboard.md#dashboard).

## 8. i18n and formatting

See [internationalization.md](../development/internationalization.md). All strings come from `t('…')`. Amounts are formatted via `formatMoney(decimalString, currency, locale)` from `lib/format`. Dates use `formatLocalDate` with the user's locale and time zone.

## 9. PWA and service worker

- `vite-plugin-pwa` in `injectManifest` mode with a custom `sw.ts`:
  - Precache the app shell (hashed assets, index.html).
  - Runtime cache: `/api/v1/attachments/*/content` (cache-first, LRU 50 MB, only after the user has opened it), icons.
  - **Never** cache other `/api/*` responses in the SW (data offline is handled by IndexedDB).
  - `push` event → show a notification (payload: title/body keys already localized by the server, or a generic message) → `notificationclick` → focus or open the deep link.
- Update flow: `registerSW({ onNeedRefresh })` → a Mantine notification "New version available", reload on confirm. Blocked while forms are dirty.
- Manifest: name and icons from branding, `display: standalone`, theme colors per scheme.

## 10. Performance budget

- Initial JS ≤ 300 KB gzip for the shell route. Feature routes are lazy.
- The transaction list is virtualized (`@tanstack/react-virtual` **[Proposed]**) for 10k+ rows.
- Dexie indexes: `transactions` by `[occurredOn+id]`, `accountIds` (multi-entry via a derived field), `categoryId`, `scheduledTransactionId`.

## 11. Testing

Vitest + Testing Library for components and hooks. `fake-indexeddb` for repositories and the sync engine. MSW **[Proposed]** for API mocking in component tests. Playwright for E2E (see [testing-strategy.md](../development/testing-strategy.md)).
