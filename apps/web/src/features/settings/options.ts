import { CURRENCIES } from '@monevo/domain';
import { browserTimeZone } from '../../auth/session';

/** IANA zones known to the browser, plus the current one if the list lacks it (e.g. `UTC`). */
export function timeZoneOptions(current?: string): string[] {
  const zones = new Set(Intl.supportedValuesOf('timeZone'));
  for (const zone of [current, browserTimeZone(), 'UTC']) if (zone) zones.add(zone);
  return [...zones].sort();
}

/** Active ISO 4217 currencies as `CODE — Name` options (multi-currency.md). */
export function currencyOptions(): { value: string; label: string }[] {
  return CURRENCIES.filter((currency) => currency.active).map((currency) => ({
    value: currency.code,
    label: `${currency.code} — ${currency.name}`,
  }));
}
