# Forecasting

**[Proposed]** design for R-FC-01..03. The engine is a pure function in `@monevo/domain/forecast`, executed by the server endpoint `GET /api/v1/forecast` and (offline) by the client against IndexedDB data.

## Principles

1. **Projection, not prediction.** Output is labelled `projected`. The API response wraps everything in `{ kind: "FORECAST", generatedAt, assumptions, … }` and never mixes actual and projected values in one field.
2. **Starts from actuals.** The starting point is the actual balance at today's end of day (user time zone). Everything after it is projection.
3. **Deterministic and explainable.** The same inputs give the same output. Each projected movement can be traced to its source (an occurrence, a future-dated transaction, or the spending estimate).
4. **Never persisted** into financial tables (INV-2). Results may be cached in memory per user for ≤ 5 minutes, keyed by the user's sync seq.

## Inputs

| Input | Use |
|---|---|
| Current balances per account (as of today) | starting points |
| Future-dated actual transactions (`occurredOn > today`) | certain movements (they are already recorded) |
| Scheduled transactions + amount changes + occurrence records | planned movements (income, bills, recurring, one-off planned expenses, planned transfers/goal contributions) |
| Overdue unconfirmed CONFIRM occurrences | assumed to still happen; placed on **tomorrow** (D+1) and flagged |
| Savings goals | projected progress, on-track evaluation, and planned contributions (schedules with `savingsGoalId`) |
| Pots | `available` projection (balance − allocated); pots don't change totals |
| Exchange rates | latest available rate per pair for the base currency totals (flagged estimate) |
| Optional: spending estimate | scenario 2 only (below) |

## Algorithm

```
forecast(userId, horizon [today+1 .. end], accounts?, scenario):
  start[a] = balance(a, today)
  events = futureDatedTransactions ∪ expandOccurrences(all active schedules, today+1..end)
           ∪ overdueOccurrences moved to today+1
  if scenario = WITH_ESTIMATED_SPENDING: events ∪= dailySpendingEstimate(...)
  for each day d in horizon:
     for each event on d: apply signed amount to its account(s) (transfers: both legs)
     series[a][d] = running balance (account currency)
     total[d] = Σ convert(series[a][d] → base, latestRate)  (missing rate → excluded + flagged)
  summarize: expectedIncome, expectedExpense (base), lowestBalance per account and total (+date),
             accounts projected < 0 or < alert threshold, goal projections
```

- Transfers between included accounts are neutral for the total. If only one leg's account is selected, it shows as an outflow or inflow for that selection.
- Cross-currency schedule items without a fixed rate use the latest rate (flagged).
- Results are in the account currency per account and in the base currency for totals.

## Scenarios

| Scenario | Includes | Purpose |
|---|---|---|
| `SCHEDULED_ONLY` (default) | future-dated transactions + scheduled occurrences | "What is certain or planned" |
| `WITH_ESTIMATED_SPENDING` | + an estimate of unplanned discretionary spending | a more realistic view |

**Spending estimate [Proposed]:** for each expense category, take the median daily spend over the last 90 days, **excluding** transactions that came from schedules (to avoid double counting with planned items), and spread it evenly per day. It is shown as a separate shaded band and listed as an assumption. If there are fewer than 30 days of history, the estimate is disabled with an explanation. Budgets are not used as spending estimates in v1 (they are limits, not predictions). This choice is noted for revisit.

## Missing and uncertain information

| Situation | Handling |
|---|---|
| Missing rate for a currency | Account excluded from the base total, warning + assumption entry. The per-account series still shown. |
| Overdue CONFIRM occurrence | Assumed on D+1, listed in assumptions ("3 overdue items assumed to be paid tomorrow"). |
| Schedule with `endDate` beyond the horizon, or infinite | Expanded only within the horizon. |
| Paused schedule | Excluded, listed in assumptions. |
| No scheduled items | The forecast is a flat line and the UI explains why. |
| Horizon | Max 730 days (2 years). Default 90. |

## Output contract (sketch)

```json
{
  "kind": "FORECAST",
  "generatedAt": "2026-11-18T10:00:00Z",
  "baseCurrency": "PLN",
  "scenario": "SCHEDULED_ONLY",
  "range": { "from": "2026-11-19", "to": "2027-02-16" },
  "startingActual": { "date": "2026-11-18", "total": "12450.20", "accounts": [{ "accountId": "…", "balance": "…" }] },
  "series": { "total": [{ "date": "…", "projected": "…" }], "accounts": { "<id>": [ … ] } },
  "summary": { "expectedIncome": "…", "expectedExpense": "…", "lowest": { "date": "…", "projected": "…" } },
  "warnings": [{ "code": "PROJECTED_NEGATIVE", "accountId": "…", "date": "…" }],
  "goals": [{ "goalId": "…", "projectedAtDeadline": "…", "onTrack": false }],
  "assumptions": [{ "code": "OVERDUE_ASSUMED", "count": 3 }, { "code": "RATE_ESTIMATED", "pairs": ["EUR/PLN"] }]
}
```

## UI presentation rules

- Dashed lines, a "Forecast" legend label, and a visual boundary at "today". Actual history (if shown on the same chart) uses solid lines.
- Tooltip: "Projected balance (estimate)". Never "balance".
- Assumptions are always visible near the chart.

## Future extension

An optional AI-assisted analysis ([Deferred]) could consume the same forecast output and report endpoints. The engine stays deterministic, and AI would only add commentary.
