import { describe, expect, it } from 'vitest';
import { addDays, compareLocalDates, isLocalDate, localDateInZone } from '../local-date.js';

describe('isLocalDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isLocalDate('2026-11-19')).toBe(true);
    expect(isLocalDate('2024-02-29')).toBe(true);
    expect(isLocalDate('2025-02-29')).toBe(false);
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('2026-00-10')).toBe(false);
    expect(isLocalDate('2026-04-31')).toBe(false);
    expect(isLocalDate('2026-04-00')).toBe(false);
    expect(isLocalDate('0999-01-01')).toBe(false);
    expect(isLocalDate('2026-1-01')).toBe(false);
    expect(isLocalDate('2026-11-19T00:00')).toBe(false);
    expect(isLocalDate(20261119)).toBe(false);
  });
});

describe('localDateInZone', () => {
  it('uses the calendar date in the given zone', () => {
    const instant = new Date('2026-11-19T23:30:00.000Z');
    expect(localDateInZone(instant, 'UTC')).toBe('2026-11-19');
    expect(localDateInZone(instant, 'Europe/Warsaw')).toBe('2026-11-20');
    expect(localDateInZone(instant, 'America/New_York')).toBe('2026-11-19');
    expect(localDateInZone(new Date('2026-11-19T10:00:00.000Z'), 'Pacific/Auckland')).toBe(
      '2026-11-19',
    );
  });
});

describe('addDays', () => {
  it('moves across months, years and leap days', () => {
    expect(addDays('2026-11-19', -7)).toBe('2026-11-12');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-11-19', 0)).toBe('2026-11-19');
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
  });
});

describe('compareLocalDates', () => {
  it('orders dates', () => {
    expect(compareLocalDates('2026-11-18', '2026-11-19')).toBe(-1);
    expect(compareLocalDates('2026-11-19', '2026-11-19')).toBe(0);
    expect(compareLocalDates('2027-01-01', '2026-12-31')).toBe(1);
    expect(() => compareLocalDates('x', '2026-12-31')).toThrow(RangeError);
    expect(() => compareLocalDates('2026-12-31', 'x')).toThrow(RangeError);
  });
});
