// IANA time zone helpers (scheduling-and-calendar.md). Validation uses the runtime tz database
// through Intl, which exists in Node.js and every supported browser.

const MAX_TIME_ZONE_LENGTH = 64;

/** True for an IANA time zone name the runtime knows (`Europe/Warsaw`, `UTC`). */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TIME_ZONE_LENGTH) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
