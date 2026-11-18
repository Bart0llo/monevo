# Financial Calculations

The canonical formulas for every number shown to users. Money precision, rounding, and conversion rules come from [multi-currency.md](../architecture/multi-currency.md). Domain invariants come from [financial-domain-model.md](../architecture/financial-domain-model.md).

All functions below are implemented as **pure functions in `@monevo/domain`** (taking pre-fetched data) and/or as SQL in report queries. Where both exist, a shared fixture test asserts they give identical results.

Notation: `P(u)` = postings of user u. `tx(p)` = the posting's transaction. Dates are `LocalDate` in the user's time zone. Ranges are **inclusive** `[from, to]`.

## Account balances

```
balance(a, D)        = a.openingBalance + Σ { p.amount | p.accountId = a.id ∧ tx(p).occurredOn ≤ D }
currentBalance(a)    = balance(a, today(userTz))
```
- Future-dated transactions (occurredOn > today) are allowed. They are **actual** records with a future date (for example a card payment booked for tomorrow). They are excluded from `currentBalance` and included in `balance(a, D)` for D ≥ their date. The UI marks them "scheduled for <date>". *(These differ from scheduled-transaction occurrences, which aren't transactions at all.)*
- Balance in base: `balanceBase(a, D) = convert(balance(a, D), a.currency → base, rate on D)` (stock rule).

SQL shape (indexed on `postings(userId, accountId)` + join to `transactions.occurredOn`):
```sql
SELECT p.account_id, SUM(p.amount) FROM postings p JOIN transactions t ON t.id = p.transaction_id
WHERE p.user_id = $1 AND t.occurred_on <= $2 GROUP BY p.account_id;
```

## Net worth (total balance)

```
netWorth(u, D) = Σ_{a ∈ accounts(u)} balanceBase(a, D)      -- includes archived accounts
```
- Accounts with a missing rate on D are excluded and counted in `missingRateCount`.
- The dashboard "total balance" widget may hide accounts with `includeInNetWorthWidget = false`. Reports always use all accounts.
- Pots are never added (INV-8).

## Income and expense totals

```
income(u, R, filters)  = Σ { p.baseAmount | tx(p).type = INCOME  ∧ occurredOn ∈ R ∧ filters }
expense(u, R, filters) = Σ { −p.baseAmount | tx(p).type = EXPENSE ∧ occurredOn ∈ R ∧ filters }   -- positive number
net(u, R)              = income − expense
savingsRate(u, R)      = net / income   (undefined when income = 0 → shown as "—")
```
- Transfers and adjustments are excluded (INV-7).
- Postings with null `baseAmount` are excluded and reported as `missingRateCount`.
- Filters: account (posting.accountId ∈ set), category (category ∈ set, a parent selection includes its children), amount range (on |p.amount| or |p.baseAmount| per the selected mode), description (`ILIKE` with `unaccent`).
- **Refunds [Open]:** in v1, a refund is entered as INCOME (optionally in an income category such as "Refunds"). It does not reduce expense totals. See [OQ-10](../planning/open-questions.md#oq-10-refunds).

## Category breakdown

```
spendByCategory(R) = group expense(u, R) by rollup(categoryId)   -- rollup: subcategory → parent unless drill-down
share(c)           = spend(c) / Σ spend
```
Uncategorized is its own bucket (`categoryId = null`).

## Exchange differences

For a cross-currency transfer t with legs s (source) and d (destination):
```
fxDiff(t) = d.baseAmount + s.baseAmount        -- s.baseAmount is negative
```
This is not income or expense. Reports may show `Σ fxDiff` for a range as "Exchange differences" (informational). Net worth changes also include revaluation of foreign-currency balances. That is not computed as a line item in v1.

## Budgets

Budget `b` with category set `C(b)` (parents expanded to include subcategories), optional account filter `A(b)`, and periods computed by `@monevo/domain/budgetPeriods`:

| Period type | Period k |
|---|---|
| `WEEKLY` | weeks starting on the user's week start day containing the anchor, then +7k days |
| `MONTHLY` | calendar months; optional `startDay` (1–28) for payday-aligned months, e.g. the 10th to the 9th |
| `YEARLY` | calendar years (or starting on `startMonth`) |
| `CUSTOM` one-off | `[startDate, endDate]`, single period |
| `CUSTOM` repeating | `[anchor + k·N days, anchor + (k+1)·N − 1 days]` |

```
spent(b, k)      = Σ { −p.baseAmount | tx.type = EXPENSE ∧ category ∈ C(b) ∧ (A(b) empty ∨ p.accountId ∈ A(b)) ∧ occurredOn ∈ period k }
limit(b, k)      = MANUAL: b.limitAmount
                   AUTO:   roundToCurrency( avg_{j=k−N..k−1} spent(b, j) × (1 + adjustmentPct/100), base )
                           (N = lookbackPeriods, default 3; only periods with data since budget creation or user-chosen history start;
                            if no history → fallback to b.limitAmount if set, else "no limit yet")
effective(b, k)  = limit(b, k) + (rollover ? carry(b, k) : 0)
carry(b, k)      = effective(b, k−1) − spent(b, k−1)   (k > first period; may be negative = overspend carried; carry starts at 0)
remaining(b, k)  = effective − spent
usedPct(b, k)    = spent / effective × 100        (effective ≤ 0 → 100% if spent > 0)
dailyAllowance   = max(remaining, 0) / daysLeftInclusive(today, periodEnd)
pace             = spent / (effective × elapsedDays/totalDays)      (> 1 = ahead of plan)
```
- Rollover carry is limited to `maxRolloverPeriods` (default unlimited). Rollover is computed iteratively from the first period, and results are memoized per request.
- **Overlapping budgets** are independent. The same expense may count in several budgets. Reports never sum budgets together.
- Budgets use the base currency. Postings without `baseAmount` are excluded and flagged.

## Savings pots

```
potBalance(pot)         = Σ allocations.amount
allocated(a)            = Σ potBalance over active pots of a
available(a)            = currentBalance(a) − allocated(a)
overAllocated(a)        = available(a) < 0
```
Validation: a new negative allocation must satisfy `potBalance + amount ≥ 0`. Positive allocations are allowed even if they make `available` negative, with a warning before saving (the user may be allocating money that hasn't arrived yet).

## Savings goals

```
progress(g)        = source = POT ? potBalance(pot) : currentBalance(account)
pct(g)             = min(progress / target, 1) × 100   (display may exceed 100% with an "achieved" badge)
remainingAmt(g)    = max(target − progress, 0)
requiredPerMonth   = remainingAmt / max(monthsBetween(today, deadline), 1)   (also per week)
contributions(g)   = POT: allocations; ACCOUNT: postings into account (amount > 0 positive contributions, < 0 withdrawals)
onTrack(g)         = projectedProgress(deadline) ≥ target   (projection from forecast; see forecasting.md)
```

## Recurring cost equivalents (recurring expenses review)

For an active recurring `EXPENSE` schedule `s` with amount `x` (converted to base at the latest rate, labelled an estimate):
```
monthlyEquivalent = DAILY: x·365/12/interval  · WEEKLY: x·52/12/interval · (weekdays: × count)
                    MONTHLY: x/interval · YEARLY: x/(12·interval)
yearlyEquivalent  = monthlyEquivalent × 12
```
Amount-change history comes from the schedule's amount changes (see scheduling).

## Comparisons

- Month comparison: `income/expense/byCategory` for months M1..Mn, plus deltas (absolute and %) against the first selected month.
- Year comparison: the same with calendar years, plus a month-by-month overlay series.
- % change with a zero baseline is shown as "new" (not ∞).

## Totals display rules

- A total in the base currency is rounded per stored item and then summed. There is no re-rounding after summing (sums of rounded values are already at the currency exponent).
- Mixed-currency lists (for example the account list) show each item in its own currency plus the base total.
- Any total that excluded items because of missing rates **must** show the warning indicator.
