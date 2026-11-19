import { useTranslation } from 'react-i18next';
import type { Currency } from '@monevo/contracts';
import { type LocalDate, localDateInZone } from '@monevo/domain';
import { clock } from './clock';

// Display formatting for amounts, rates and currency names (multi-currency.md). Symbols and
// names come from Intl at display time and are never stored. Amounts stay decimal strings: Intl
// formats the string without converting it to a float.

type DecimalLiteral = `${number}`;

/** Formats a decimal-string amount in its currency at the currency exponent. */
export function useFormatMoney(): (amount: string, currency: string, exponent?: number) => string {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  return (amount, currency, exponent) => {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        ...(exponent === undefined
          ? {}
          : { minimumFractionDigits: exponent, maximumFractionDigits: exponent }),
      }).format(amount as DecimalLiteral);
    } catch {
      return `${amount} ${currency}`;
    }
  };
}

/** Formats a decimal-string exchange rate with 4 to 6 fraction digits. */
export function useFormatRate(): (rate: string) => string {
  const { i18n } = useTranslation();
  const format = new Intl.NumberFormat(i18n.resolvedLanguage ?? 'en', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  });
  return (rate) => format.format(rate as DecimalLiteral);
}

/** Localized currency name, falling back to the English reference name. */
export function useCurrencyName(): (currency: Pick<Currency, 'code' | 'name'>) => string {
  const { i18n } = useTranslation();
  let names: Intl.DisplayNames | undefined;
  try {
    names = new Intl.DisplayNames([i18n.resolvedLanguage ?? 'en'], { type: 'currency' });
  } catch {
    names = undefined;
  }
  return (currency) => {
    const name = names?.of(currency.code);
    return name && name !== currency.code ? name : currency.name;
  };
}

/** Formats a calendar date (`YYYY-MM-DD`) without any time-zone shift. */
export function useFormatLocalDate(): (date: string) => string {
  const { i18n } = useTranslation();
  const format = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'en', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  });
  return (date) => {
    const [year, month, day] = date.split('-').map(Number);
    if (!year || !month || !day) return date;
    return format.format(new Date(Date.UTC(year, month - 1, day)));
  };
}

/** Today's calendar date in the user's time zone. */
export function todayIn(timeZone: string): LocalDate {
  return localDateInZone(clock.now(), timeZone);
}

/** Normalizes a typed amount ("1 234,5" → "1234.5"); returns null when it isn't a number. */
export function parseAmountInput(value: string): string | null {
  // `\s` also covers the (narrow) no-break spaces that Intl uses as group separators.
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : null;
}
