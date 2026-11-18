import { describe, expect, it } from 'vitest';
import {
  CurrencyCodeSchema,
  DecimalStringSchema,
  ERROR_CODES,
  ERROR_STATUS,
  ProblemSchema,
  problemTypeUri,
} from '../index.js';

describe('error codes', () => {
  it('maps every code to an HTTP error status', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
      expect(ERROR_STATUS[code]).toBeLessThan(600);
    }
  });

  it('uses UPPER_SNAKE codes', () => {
    for (const code of ERROR_CODES) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it('builds problem type URIs', () => {
    expect(problemTypeUri('VALIDATION_FAILED')).toBe(
      'https://monevo.app/problems/validation-failed',
    );
  });
});

describe('ProblemSchema', () => {
  it('accepts the documented example shape', () => {
    const parsed = ProblemSchema.safeParse({
      type: problemTypeUri('VALIDATION_FAILED'),
      title: 'Validation failed',
      status: 422,
      code: 'VALIDATION_FAILED',
      requestId: 'abc',
      errors: [{ path: ['postings', 1, 'amount'], code: 'AMOUNT_PRECISION', message: 'x' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown codes', () => {
    const parsed = ProblemSchema.safeParse({
      type: 'x',
      title: 'x',
      status: 500,
      code: 'NOPE',
      requestId: 'abc',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('shared scalars', () => {
  it('validates decimal strings', () => {
    expect(DecimalStringSchema.safeParse('12.50').success).toBe(true);
    expect(DecimalStringSchema.safeParse('1e3').success).toBe(false);
    expect(DecimalStringSchema.safeParse(12.5).success).toBe(false);
  });

  it('validates currency codes', () => {
    expect(CurrencyCodeSchema.safeParse('PLN').success).toBe(true);
    expect(CurrencyCodeSchema.safeParse('XAU').success).toBe(false);
  });
});
