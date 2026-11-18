# Reporting and Dashboard

**[Accepted]** server-side aggregation for reports (R-REP-05), Recharts for visualization. **[Proposed]** everything else in this document. Covers R-REP-01..06 and R-DASH-01. Formulas are canonical in [financial-calculations.md](../data/financial-calculations.md); this document covers *where* and *how* they are computed and delivered.

## 1. Where numbers are computed

| Number | Computed by | Why |
|---|---|---|
| Account balances, net worth "now", budget progress, pot/goal progress, calendar items, local forecast | **Client**, from the IndexedDB replica via `@monevo/domain` (and by the server for the REST API with the same code) | Must work offline and update instantly after an optimistic write. |
| Reports (multi-month aggregates, comparisons, trends, net worth over time, recurring review) | **Server**, SQL aggregates in the `reports` module | Large scans, consistent isolation in one place, and identical results for web, Android, and integrations (R-REP-05). |
| Dashboard widgets | Either, per widget type (see the [widget catalogue](#widget-catalogue)) | Cheap widgets are local; report-backed widgets reuse report endpoints. |

A shared fixture test asserts that the domain functions and the SQL produce identical results for the same data set (see [financial-calculations.md](../data/financial-calculations.md)).

## 2. Report catalogue

All report endpoints are `GET`, read-only, user-scoped, and live under `/api/v1/reports/*` (see [api-design.md](api-design.md#8-endpoint-map-v1-indicative)).

| Report | Endpoint | Output |
|---|---|---|
| Income vs. expense over time | `/reports/income-expense` | Series per bucket (`DAY`/`WEEK`/`MONTH`/`YEAR`): income, expense, net, savings rate |
| Spending by category | `/reports/by-category` | Per category (rolled up to parents, or drill-down to subcategories with `parentId`): amount, share, transaction count. Uncategorized is its own bucket. |
| Category trend | `/reports/category-trend` | Series per bucket for the selected categories |
| Month comparison | `/reports/compare-months` | Income, expense, and by-category for months M1..Mn, deltas (absolute and %) against M1 |
| Year comparison | `/reports/compare-years` | The same for calendar years, plus a month-by-month overlay series |
| Savings | `/reports/savings` | Net savings, savings rate per bucket, pot and goal progress snapshot |
| Net worth over time | `/reports/net-worth` | Stock series per bucket end date (stock rule, see [multi-currency.md](multi-currency.md#7-converting-stock-values-balances)) |
| Recurring expenses review | `/reports/recurring` | Active recurring expense schedules with monthly and yearly equivalents and amount-change history |

Common query parameters (validated by the report's Zod contract): `from`, `to` (LocalDate, inclusive, max range 10 years), `bucket`, `accountId` (repeatable), `categoryId` (repeatable, `includeSubcategories=true` by default), `type` where meaningful. Comparison reports take `months=YYYY-MM,…` or `years=YYYY,…` (2–12 entries).

### Response envelope

```json
{
  "kind": "REPORT",
  "report": "income-expense",
  "generatedAt": "2026-11-18T10:00:00Z",
  "baseCurrency": "PLN",
  "params": { "from": "2026-01-01", "to": "2026-10-31", "bucket": "MONTH" },
  "data": { "series": [{ "bucket": "2026-01", "income": "8200.00", "expense": "6123.45", "net": "2076.55" }] },
  "missingRateCount": 2,
  "missingRateRange": { "from": "2026-03-02", "to": "2026-03-09" }
}
```

- All amounts are decimal strings in the base currency. Any non-zero `missingRateCount` must be shown as a warning (see [multi-currency.md](multi-currency.md#missing-rates)).
- An `exchangeDifferences` total is included where relevant (income-expense, savings) as an informational line, never inside income or expense (see [financial-calculations.md](../data/financial-calculations.md#exchange-differences)).

## 3. Aggregation rules

- **Flows** (income, expense, category, savings, budgets) sum the stored `postings.base_amount` snapshots. They never re-convert at today's rate, so history does not drift (R-CUR-03).
- **Stocks** (net worth over time) compute `balance(a, D)` per account at each bucket end and convert at the rate on D. They never sum `base_amount`.
- Transfers and adjustments are excluded from all flow reports (INV-7). Transfer fees are ordinary expenses.
- Buckets are computed on `occurred_on` (LocalDate). Week buckets start on the user's week-start setting. There is no time-zone conversion in SQL, because `occurred_on` is already the user's local date.
- Every query takes `userId` as a bound parameter and filters `posting.base_currency = user.base_currency` as a safety net. Each query file has an isolation test ([authorization-and-data-isolation.md](authorization-and-data-isolation.md#layer-2-user-scoped-repositories)).
- Queries are raw parameterized SQL (`prisma.$queryRaw`) in `modules/reports/queries/*.sql.ts`. The read-only cross-module access rule is in [application-structure.md](application-structure.md#package-responsibilities-and-dependency-rules).
- Performance target: < 300 ms for a 10-year monthly report over 50k transactions, using the indexes in [database-architecture.md](database-architecture.md#4-indexes-initial-set). If a report misses the target, add an index first. Materialized aggregates are not planned for v1.

## 4. Saved report configurations

R-REP-03 (interpretation: named saved configurations).

```
ReportDefinition: id, userId, name, reportType (TEXT + CHECK, open set), config (JSONB), sortOrder,
                  version, createdAt, updatedAt
```

- `config` holds the report's query parameters plus presentation choices (chart type, visible series), validated by a per-type Zod schema with a `schemaVersion`. A relative range (`"range": { "preset": "LAST_12_MONTHS" }`) is stored as a preset, not as fixed dates.
- References to deleted accounts or categories are dropped when the definition is loaded, with a notice.
- Report definitions are **not** synced to IndexedDB (they are only useful online). They are served through `/api/v1/report-definitions` via TanStack Query.
- These are report configurations, not saved transaction filter views (those are out of scope; R-TX-10).

## 5. Export of reports

- **CSV/JSON:** every report endpoint accepts `?format=csv` (or `Accept: text/csv`). CSV uses `.` as the decimal separator, ISO dates, UTF-8 with BOM (so spreadsheet apps detect the encoding), and a header row with stable English column keys. JSON export is the normal response.
- **Chart image:** PNG rendered client-side from the Recharts SVG. There is no server-side rendering.
- **PDF:** **[Deferred]**.
- Full data export (not reports) is covered by [import-export.md](import-export.md).

## 6. Offline behaviour of reports

Reports are server-only data. The last result for each parameter set is kept in the TanStack Query cache persisted to IndexedDB (max 50 entries, 30 days). Offline, the UI shows that result with a "data as of …" label and disables parameter changes that have no cached result. Simple totals that the client can compute exactly (current month income/expense) are computed locally instead.

## Dashboard

R-DASH-01. The home screen is a per-user grid of widgets that the user can add, remove, reorder by drag and drop, resize, show or hide, and configure.

### Layout model

```
DashboardLayout: userId (PK), layout (JSONB), version, updatedAt

layout = {
  schemaVersion: 1,
  widgets: [
    { id: "uuid", type: "BUDGETS_OVERVIEW", size: "S" | "M" | "L" | "FULL", hidden: false, config: { … } }
  ]
}
```

- One row per user (`dashboard_layouts`). Array order is display order.
- `type` is an **open enum** ([api-design.md](api-design.md#9-versioning-policy)). Clients **ignore unknown widget types** (they are kept in the stored layout and not rendered), so an older client never destroys a newer client's widgets.
- `config` is validated per widget type by a Zod schema in `@monevo/contracts`. Invalid config falls back to the widget's defaults instead of failing the whole layout.
- Max 40 widgets. Layout JSON max 32 KB.
- A separate mobile ordering is **[Proposed]** as an optional `mobileOrder: string[]` (widget IDs). Until it is confirmed, mobile uses the same order with every widget forced to full width. See [open-questions.md](../planning/open-questions.md#oq-mobile-dashboard-layout).
- A new user gets a **default layout** generated on first load: total balance, accounts, budgets overview, recent transactions, upcoming payments, spending by category.

### Grid and interaction

- A CSS grid with 4 columns on desktop (`S` = 1 column, `M` = 2, `L` = 3, `FULL` = 4), 2 columns on tablet, and 1 column on mobile. Widget heights are intrinsic per type. There is **no grid-layout engine** (free x/y placement is not supported).
- Edit mode (toggle in the header) shows drag handles, a size menu, a hide toggle, a config button, and an "Add widget" drawer.
- Reordering uses `@dnd-kit/sortable` (pointer, touch, and keyboard sensors, so reordering is accessible without a mouse). Keyboard users can also use "Move up/down" menu items.
- Changes are written locally at once (optimistic) and synced.

### Sync

`DashboardLayout` is a synced entity with **whole-entity last-writer-wins** (it contains no financial data; see [offline-and-synchronization.md](offline-and-synchronization.md#8-field-level-three-way-merge)). Concurrent edits on two devices resolve to the later arrival. This is acceptable because the loss is cosmetic and recoverable.

### Widget catalogue

| Type | Data source | Config |
|---|---|---|
| `TOTAL_BALANCE` | local (net worth; respects `includeInNetWorthWidget`) | none |
| `ACCOUNT_BALANCES` | local | account selection, show available balance |
| `BUDGETS_OVERVIEW` | local | budget selection |
| `BUDGET` | local | one budget |
| `SPENDING_BY_CATEGORY` | local for current period, `/reports/by-category` for longer ranges | period preset, chart type (`DONUT`/`BAR`), accounts, categories |
| `INCOME_VS_EXPENSE` | `/reports/income-expense` (cached) | range preset, bucket, chart type (`BAR`/`LINE`) |
| `RECENT_TRANSACTIONS` | local | count (5–20), accounts |
| `UPCOMING_PAYMENTS` | local (occurrence expansion) | days ahead, bills only |
| `SAVINGS_GOALS` | local | goal selection |
| `FORECAST_MINI` | local forecast engine | horizon, scenario |
| `NET_WORTH_TREND` | `/reports/net-worth` (cached) | range preset |
| `NOTIFICATIONS_INSIGHTS` | local (synced notifications) + `/insights` | show insights |

All chart widgets use the shared `ChartCard` component (missing-rate warning, accessible table fallback, `actual`/`forecast` styling; see [frontend-architecture.md](frontend-architecture.md#7-ui-composition)). Forecast widgets always carry the "forecast" label (R-FC-03).

## 7. Testing

- Report SQL: fixture data sets with expected results (including transfers, adjustments, cross-currency, missing rates, subcategory rollup, week-start variants) shared with the domain unit tests.
- Isolation: every report endpoint is covered by the automated isolation suite.
- Dashboard: Zod schema tests for each widget config, unknown-type preservation test, drag-and-drop reorder E2E (pointer and keyboard).
