import { describe, expect, it } from 'vitest';
import { parseAmountInput } from './money';

describe('parseAmountInput', () => {
  it('accepts plain and negative decimal amounts', () => {
    expect(parseAmountInput('1250.50')).toBe('1250.50');
    expect(parseAmountInput('-12')).toBe('-12');
    expect(parseAmountInput('0')).toBe('0');
  });

  it('normalizes a decimal comma and group separators, including no-break spaces', () => {
    expect(parseAmountInput('1 234,5')).toBe('1234.5');
    expect(parseAmountInput('1 234,50')).toBe('1234.50');
    expect(parseAmountInput('1 234,50')).toBe('1234.50');
  });

  it('rejects anything that is not a number', () => {
    expect(parseAmountInput('')).toBeNull();
    expect(parseAmountInput('abc')).toBeNull();
    expect(parseAmountInput('1.2.3')).toBeNull();
    expect(parseAmountInput('1e5')).toBeNull();
    expect(parseAmountInput('.5')).toBeNull();
  });
});
