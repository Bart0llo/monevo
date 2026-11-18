# Money and Multi-Currency

**[Accepted]**, see [ADR-0007](../decisions/ADR-0007-money-and-multi-currency.md). This is the canonical document for money representation, precision, rounding, exchange rates, and conversion.

## 1. Representing money

| Layer | Representation |
|---|---|
| PostgreSQL | Amounts: `NUMERIC(19,4)`. Rates: `NUMERIC(24,12)`. Currency: `CHAR(3)` (ISO 4217 code, uppercase), FK to `currencies`. |
| Prisma | `Decimal` (decimal.js instance). |
| Domain (TS) | `Money { amount: Decimal; currency: CurrencyCode }` from `@monevo/domain`. All arithmetic goes through domain helpers. |
| JSON / API / IndexedDB | **Decimal strings** with a `.` separator and no exponent notation (`"1234.50"`, `"-20.00"`, `"4.321500000000"`). Never JSON numbers. |
| UI input | The locale-aware string is normalized to a decimal string, then parsed into `Decimal`. `parseFloat` is never used. |
| UI output | `Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: exponent, maximumFractionDigits: exponent })`, fed via `Decimal#toFixed(exponent)`, which is converted to a number **only** at the formatting boundary. Values are bounded by NUMERIC(19,4), so this is lossless for display. A string-based formatter is used if the value exceeds `Number.MAX_SAFE_INTEGER`/10⁴. |

Why `NUMERIC` and not integer minor units: currencies have different exponents (0–4), cross-currency math needs intermediate precision, Prisma maps `NUMERIC` to decimal.js natively, and `NUMERIC(19,4)` covers every ISO 4217 currency exponent (max 4) with ~10¹⁵ range. Integer minor units would require per-currency scaling at every boundary, which is a known bug source. See the ADR for alternatives.

### Currency reference data
`currencies` table: `code`, `exponent`, `name` (English, UI uses `Intl.DisplayNames` for localized names), `active`. It is seeded by migration from ISO 4217 (reference data, not user data, so this is not in conflict with "no seeded categories"). It is mirrored by a static table in `@monevo/domain` so the client can work offline. Custom or crypto currencies are **[Out of scope]**.

## 2. Precision and rounding

| Rule | Value |
|---|---|
| Stored amount precision | Rounded to the currency's ISO exponent (PLN/EUR/USD 2, JPY/HUF 0 or per ISO, KWD 3). |
| Stored rate precision | 12 decimal places, up to 12 integer digits. |
| Intermediate precision | decimal.js configured with `precision: 34` (decimal128-like). There is no rounding inside a computation chain. |
| Rounding mode | **`ROUND_HALF_UP`** (commercial rounding, away from zero for .5 on absolute value: `Decimal.ROUND_HALF_UP` applies to magnitude). |
| When rounding happens | Only when (a) storing an amount, (b) producing a converted amount, (c) presenting. Rates are rounded to 12 dp when stored or derived. |
| Aggregation | Sums of stored (already rounded) amounts. **Never** re-convert and re-round individual items during aggregation when a stored snapshot exists. |

`ROUND_HALF_UP` is chosen over banker's rounding because it matches user expectations and common Polish/EU accounting practice, and the per-item rounding error is bounded (≤ half a minor unit per stored amount). The decision is centralized in `@monevo/domain/money` (`roundToCurrency`), so changing it would be a one-line change plus an ADR update.

## 3. Exchange rate semantics

- A rate for pair `(from, to)` on `rateDate` means **1 unit of `from` = `rate` units of `to`**.
- `convert(amount, from → to, rate) = roundToCurrency(amount × rate, to)`.
- **Inverse:** `rate(to → from) = 1 / rate(from → to)`, computed at full precision, then rounded to 12 dp.
- **Cross rates (triangulation):** if `A → B` isn't available but `A → P` and `P → B` are for the same date and source, then `rate(A→B) = rate(A→P) × rate(P→B)`, rounded to 12 dp, source = that provider (pivot recorded in `metadata`).
- Rates are stored per **calendar date** (`LocalDate`), not per instant. A transaction uses the rate for its `occurredOn`.

## 4. Rate storage

```
ExchangeRate: id, userId? (null = provider/global), fromCurrency, toCurrency, rateDate (DATE),
              rate NUMERIC(24,12), source: PROVIDER | MANUAL, providerId? ('frankfurter', 'nbp', …),
              fetchedAt?, createdAt
Unique: (coalesce(userId, nil), source, providerId, fromCurrency, toCurrency, rateDate)
```
- **Provider rates are global reference data** (not private). They are shared across users to avoid refetching. They store the provider's published direction. Inverses and crosses are computed on read.
- **Manual rates are user-owned** (`userId` set). They are visible only to that user and editable by them.
- Rates are never deleted when transactions reference them, because transactions hold their own snapshots. Deleting or editing a stored rate does **not** change existing transactions (INV-6).

## 5. Rate resolution algorithm

`resolveRate(userId, from, to, date, { allowStaleDays = 7 })`:
1. `from = to` → `1`, source `IDENTITY`.
2. User **manual** rate for exact `date` (direct, or inverse).
3. **Provider** rate for exact `date` (direct, inverse, or cross via the provider's pivot currency).
4. Fetch from the configured provider for `date` **if online and the provider supports the pair and history** → cache it → use it.
5. Most recent manual or provider rate with `rateDate` in `[date − allowStaleDays, date)` → use it, flagged `stale: true` (the UI shows "rate from 2026-11-14").
6. Nothing found → **missing** (see below).

Weekends and holidays: providers publish on business days. Step 4 asks the provider for `date`; most providers return the last published rate for non-business days (Frankfurter does). The NBP adapter queries a 7-day window ending at `date` and takes the latest. The stored `rateDate` is the date requested, and `metadata.publishedDate` keeps the actual publication date.

Future dates (forecasts): the latest available rate is used, flagged as an estimate.

## 6. Attaching rates to transactions

Each posting stores two snapshots:

| Snapshot | Purpose | Resolved |
|---|---|---|
| `rateToAccount` (original → account currency) | Determines the balance effect. **Required**, since a posting cannot exist without an account amount. | From user input (`DERIVED`/`MANUAL`) or `resolveRate` (`PROVIDER`). Offline without a cached rate, the user must enter the charged amount or a rate. |
| `rateToBase` + `baseAmount` (account → base currency) | Aggregations in the base currency (budgets, reports, summaries). | `resolveRate(accountCurrency → baseCurrency, occurredOn)`. It may be missing. |

Per-transaction **override**: the user can set either rate manually in full entry (source `MANUAL`). A manual rate is sticky: later edits never auto-replace it unless the user clears it.

### When rates are re-resolved
| Event | `rateToAccount` | `rateToBase` |
|---|---|---|
| Create | resolve (unless user-entered) | resolve |
| Edit amount only | keep rate, recompute amounts | keep rate, recompute `baseAmount` |
| Edit `occurredOn` or account/currency | re-resolve if source is `PROVIDER`; keep if `MANUAL`/`DERIVED` (derived is recomputed from the entered amounts) | re-resolve if `PROVIDER`; keep if `MANUAL` |
| Stored rate table changes | **never** | **never** (except filling missing) |
| Base currency change operation | n/a | recomputed for all postings (explicit operation, see OQ-05) |

### Missing rates
- If `baseAmount` cannot be resolved, the posting is saved with `baseAmount = null`, `rateToBaseSource = null`. The balance (account currency) is still correct.
- Base currency aggregates **exclude** postings with null `baseAmount` and return `missingRateCount` plus the affected date range, so the UI shows "Totals exclude 3 transactions without an exchange rate. Resolve."
- "Resolve missing rates" (online): for each affected posting, run `resolveRate` and set the snapshot (allowed by INV-6 because it fills a gap rather than changing history). The user may also enter manual rates per date and pair.
- A daily job also retries resolution for missing snapshots up to 30 days old **[Proposed]**. This is a retry of on-demand fetching for specific dates, not general background rate fetching (R-CUR-05).

## 7. Converting stock values (balances)

- **Flows** (income, expense, budgets, category reports, savings flows) use stored `baseAmount` snapshots. They are historically stable.
- **Stocks** (account balance, net worth "as of date D") are converted at the rate valid **on D**: `balanceInBase(account, D) = convert(balance(account, D), account.currency → base, resolveRate(…, D, stale allowed))`. For "now", D = today in the user's time zone. Because provider rates for past dates are immutable once stored, historical net worth charts are stable too. Missing rates are excluded with a warning, the same as for flows.
- Net worth is **never** computed by summing `baseAmount`s of postings (that would mix historical rates into a current valuation).

## 8. Rate providers

```ts
interface RateProvider {
  id: string;                                  // 'frankfurter' | 'nbp' | …
  capabilities(): { historical: boolean; pivot?: CurrencyCode; currencies: CurrencyCode[] | 'dynamic' };
  getRates(params: { base?: CurrencyCode; symbols: CurrencyCode[]; date: LocalDate }):
    Promise<{ date: LocalDate; publishedDate: LocalDate; pivot: CurrencyCode; rates: Record<CurrencyCode, Decimal> }>;
}
```
- **Default [Proposed]: Frankfurter** (ECB reference rates, ~30 currencies, historical, free, no API key, self-hostable).
- **Second: NBP** (Polish National Bank, tables A and B, PLN pivot, historical, free). Table B covers many exotic currencies but is published weekly.
- The admin selects the active provider. Multiple-provider fallback chains are **[Deferred]**.
- Provider responses are parsed from **strings** where possible (JSON numbers from providers are converted via `new Decimal(String(n))` immediately, since a provider's float has already lost precision; accepted, because rates are rounded to 12 dp anyway).
- Requests contain only currency codes and dates (no user data). There is a timeout of 5 s, and failures fall through to step 5/6 of resolution.

## 9. Base currency

- Chosen at onboarding, stored in `user_settings.baseCurrency`, and recorded in each posting's `baseCurrency`.
- Budgets' limit amounts are in the base currency.
- **Changing base currency** is an explicit, confirmed operation. It recomputes `baseAmount`/`rateToBase` for all postings using historical rates for each `occurredOn` (missing ones become null), converts budget limits and category spending alert amounts at today's rate (the user reviews them), and bumps every affected entity version (a full resync for clients). See [OQ-05](../planning/open-questions.md#oq-05-changing-the-base-currency).
- Aggregation queries filter `posting.baseCurrency = user.baseCurrency` as a safety net: rows that don't match (they should not exist after the operation) are treated as missing.
