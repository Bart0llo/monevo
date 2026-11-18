# Internationalization

**[Accepted]** Polish and English at first release, all UI strings via translation keys, localized formats, language independent of base currency, per-user time zone (R-GEN-07, R-GEN-08, R-GEN-09). **[Proposed]** implementation.

## 1. Languages and locales

| Setting (`user_settings`) | Example | Drives |
|---|---|---|
| `locale` | `pl`, `en` | UI language and number/date formats (BCP 47 tag; `en` and `pl` in v1) |
| `dateFormat` | `LOCALE` (default), or an explicit pattern choice | date display override |
| `weekStart` | `MONDAY` … `SUNDAY`, default from the locale | calendars, weekly budgets, weekly recurrence alignment |
| `timeZone` | IANA, e.g. `Europe/Warsaw` | "today", reminders, jobs ([§5](#time-zones)) |
| `baseCurrency` | `PLN` | totals; **independent** of the language |

Initial language: the browser's `navigator.languages`, falling back to English. Supported UI languages: `pl`, `en`. Formatting follows the same tag through `Intl`. Region variants (e.g. `en-GB` vs `en-US` number and date conventions) are a possible later addition that needs no schema change; in v1 the `dateFormat` and `weekStart` overrides cover the common differences.

## 2. Translation resources

- **i18next** + react-i18next on the web; the same JSON resources power server-rendered texts (push payloads) via `@monevo/i18n` ([notifications.md](../architecture/notifications.md)).
- Layout: `packages/i18n/locales/<lang>/<namespace>.json`. Namespaces per feature (`common`, `transactions`, `budgets`, `scheduling`, `reports`, `admin`, `errors`, `notifications`, …), lazy-loaded per route on the web.
- Keys are semantic and nested: `transactions.form.amount.label`, never English sentences as keys.
- **Typed keys:** a generated `.d.ts` makes `t('…')` fail type-checking for unknown keys.
- **Interpolation and plurals:** ICU-style plurals via i18next's `_one/_few/_many/_other` suffixes (Polish needs `few` and `many`). Never concatenate translated fragments.
- **Error messages:** API problems carry a stable `code` and `details`; the client maps `errors.<CODE>` to text. Server `title`/`detail` texts are English and for developers only ([api-design.md](../architecture/api-design.md)).
- User-entered content (account names, categories, descriptions) is never translated. There are no seeded categories (out of scope), so no translated defaults exist.

### Tooling

`pnpm i18n:check` (part of `pnpm validate`): every key used in code exists in `en` and `pl`; no unused keys; placeholders match across languages; plural forms complete for each language. English is the source language; a missing Polish key fails validation.

## 3. Number and money formatting

- `Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: exponent, maximumFractionDigits: exponent })` with the **ISO 4217 exponent** from `@monevo/domain`, not `Intl`'s default (they differ for some currencies).
- Formatting takes the decimal string and formats it without converting to a float for values within ±2^53 minor units; beyond that, a string-based formatter is used. Helper: `formatMoney(decimalString, currency, locale)`.
- **Parsing** user input: accept the locale's decimal separator (`,` in Polish) and also `.`; ignore grouping spaces (including narrow no-break space `U+202F`) and apostrophes; reject ambiguous input such as `1.234,5.6`. The result is a decimal string passed straight to the money type ([coding-conventions.md](coding-conventions.md#2-money-non-negotiable)).
- Percentages and plain numbers use `Intl.NumberFormat` with the same locale.

## 4. Dates and times

- LocalDates (`YYYY-MM-DD`) are formatted with `Intl.DateTimeFormat(locale, { dateStyle })` after constructing a date **at noon UTC** for display only (avoids off-by-one), or with date-fns `format` and the date-fns locale for custom patterns.
- Instants (`createdAt`, `occurredAt`, reminder times) are formatted in the **user's `timeZone` setting**, not the device time zone.
- Relative times ("3 minutes ago") via `Intl.RelativeTimeFormat`.
- Mantine `DatesProvider` receives the locale, `firstDayOfWeek` from `weekStart`, and the user's time zone.

## 5. Time zones

<a id="time-zones"></a>Canonical scheduling rules are in [scheduling-and-calendar.md](../architecture/scheduling-and-calendar.md#5-time-zones). UI rules:

1. **Financial dates use the user setting.** "Today" on every device is `today(user.timeZone)`, so a phone abroad and a desktop at home agree on which day a transaction belongs to. New transactions default `occurredOn` to that date.
2. **Device mismatch warning.** When the device time zone differs from the setting, a dismissible banner offers to update the setting (e.g. after moving) or to keep it (e.g. while travelling).
3. **Changing the time zone** affects only future "today" calculations, reminder instants, and job timing; stored LocalDates never change.
4. **Offline:** the client computes "today" with the cached setting and the device clock. Clock skew is not corrected offline; the server is authoritative for job timing.
5. **DST:** reminder instants in a DST gap move to the next valid instant; in an overlap, the first occurrence is used. The UI shows reminder times as the wall-clock time the user chose.
6. Onboarding pre-fills `timeZone` from `Intl.DateTimeFormat().resolvedOptions().timeZone` ([user-experience.md](../product/user-experience.md)).

## 6. Adding a language

1. Add `packages/i18n/locales/<lang>/` with all namespaces (copy `en`).
2. Add the language to the supported list and its date-fns locale and Mantine dayjs locale import.
3. Check plural rules (`Intl.PluralRules`) and run `pnpm i18n:check`.
4. Review layouts for longer strings (German-length text is a useful stress test even without German).

No code changes are needed beyond registration; this is how the architecture "allows more languages" (R-GEN-07).

## 7. Testing

- Unit: money parse/format in `pl` and `en` (grouping, separators, negative amounts, zero-decimal currencies like JPY, three-decimal like KWD); LocalDate display never shifts a day across time zones.
- E2E runs the core journey in both Polish and English.
- `i18n:check` in `pnpm validate`.
