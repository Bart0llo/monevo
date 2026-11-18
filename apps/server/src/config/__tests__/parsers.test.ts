import { describe, expect, it } from 'vitest';
import { parseBoolean, parseSize, parseTrustProxy } from '../parsers.js';

describe('parseSize', () => {
  it.each([
    ['0', 0],
    ['1024', 1024],
    ['25MB', 25_000_000],
    ['25 MB', 25_000_000],
    ['1KB', 1000],
    ['2GB', 2_000_000_000],
    ['1KiB', 1024],
    ['1MiB', 1_048_576],
    ['2GiB', 2_147_483_648],
    ['10mb', 10_000_000],
    ['5B', 5],
  ])('%s → %d', (input, expected) => {
    expect(parseSize(input)).toBe(expected);
  });

  it.each(['', 'MB', '1.5MB', '-1', '10TB', 'ten', '99999999999999999GiB'])('rejects %j', (input) => {
    expect(parseSize(input)).toBeUndefined();
  });
});

describe('parseBoolean', () => {
  it('accepts only true and false', () => {
    expect(parseBoolean('true')).toBe(true);
    expect(parseBoolean('false')).toBe(false);
    for (const input of ['TRUE', '1', 'yes', '', 'on']) expect(parseBoolean(input)).toBeUndefined();
  });
});

describe('parseTrustProxy', () => {
  it('parses booleans, hop counts and address lists', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('2')).toBe(2);
    expect(parseTrustProxy('loopback,  10.0.0.0/8 ,')).toBe('loopback, 10.0.0.0/8');
  });
});
