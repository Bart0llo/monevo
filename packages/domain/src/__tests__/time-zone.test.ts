import { describe, expect, it } from 'vitest';
import { isTimeZone } from '../time-zone.js';

describe('isTimeZone', () => {
  it('accepts IANA names and UTC', () => {
    expect(isTimeZone('Europe/Warsaw')).toBe(true);
    expect(isTimeZone('America/New_York')).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
  });

  it('rejects unknown names and non-strings', () => {
    expect(isTimeZone('Mars/Olympus')).toBe(false);
    expect(isTimeZone('')).toBe(false);
    expect(isTimeZone(42)).toBe(false);
    expect(isTimeZone('x'.repeat(65))).toBe(false);
  });
});
