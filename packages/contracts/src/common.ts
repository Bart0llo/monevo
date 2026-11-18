import { isCurrencyCode, isDecimalString } from '@monevo/domain';
import { z } from './zod.js';

/** Money and rate values travel as decimal strings, never JSON numbers (multi-currency.md). */
export const DecimalStringSchema = z
  .string()
  .refine(isDecimalString, { message: 'Expected a decimal string' })
  .openapi('DecimalString', { example: '1234.50' });

export const CurrencyCodeSchema = z
  .string()
  .refine(isCurrencyCode, { message: 'Unknown ISO 4217 currency code' })
  .openapi('CurrencyCode', { example: 'PLN' });
