// Calendar dates (`LocalDate`, "YYYY-MM-DD") as in coding-conventions.md#3-dates-and-time. A
// LocalDate is never an instant: arithmetic happens on the calendar fields, in UTC, so the host
// time zone never shifts a day.

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type LocalDate = string;

/** True for a real calendar date in `YYYY-MM-DD` form (years 1000–9999). */
export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string') return false;
  const match = LOCAL_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function assertLocalDate(value: string): void {
  if (!isLocalDate(value)) throw new RangeError(`Invalid LocalDate: ${JSON.stringify(value)}`);
}

/** The calendar date of `instant` in the IANA `timeZone`. */
export function localDateInZone(instant: Date, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** `date` plus `days` calendar days (negative to go back). */
export function addDays(date: LocalDate, days: number): LocalDate {
  assertLocalDate(date);
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** -1, 0 or 1 (ISO strings compare lexicographically). */
export function compareLocalDates(a: LocalDate, b: LocalDate): -1 | 0 | 1 {
  assertLocalDate(a);
  assertLocalDate(b);
  return a < b ? -1 : a > b ? 1 : 0;
}
