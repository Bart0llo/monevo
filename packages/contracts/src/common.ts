import { isCurrencyCode, isDecimalString, isLocalDate, isValidRateString } from '@monevo/domain';
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

/** A calendar date (`YYYY-MM-DD`), never an instant (coding-conventions.md#3-dates-and-time). */
export const LocalDateSchema = z
  .string()
  .refine(isLocalDate, { message: 'Expected a calendar date (YYYY-MM-DD)' })
  .openapi('LocalDate', { example: '2026-11-19' });

/** An exchange rate: positive decimal string, at most 12 fraction digits, below 10^12. */
export const RateStringSchema = z
  .string()
  .refine(isValidRateString, {
    message: 'Expected a positive rate with at most 12 decimal places',
  })
  .openapi('RateString', { example: '4.265000000000' });

/**
 * Curated icon keys for accounts and categories. Kebab-case, provider-neutral; the web maps each
 * key to a bundled icon. Adding a key is backwards compatible; removing one is not.
 */
export const ICON_KEYS = [
  'wallet',
  'bank',
  'cash',
  'credit-card',
  'piggy-bank',
  'coins',
  'receipt',
  'briefcase',
  'gift',
  'trending-up',
  'home',
  'bolt',
  'droplet',
  'flame',
  'wifi',
  'phone',
  'shopping-cart',
  'shopping-bag',
  'tools-kitchen',
  'coffee',
  'car',
  'gas-station',
  'bus',
  'plane',
  'bike',
  'heart',
  'pill',
  'stethoscope',
  'school',
  'book',
  'device-tv',
  'device-gamepad',
  'music',
  'movie',
  'shirt',
  'paw',
  'baby',
  'barbell',
  'beach',
  'building',
  'tag',
  'dots',
] as const;
export const IconKeySchema = z.enum(ICON_KEYS).openapi('IconKey');
export type IconKey = z.infer<typeof IconKeySchema>;

/** Theme color tokens; anything else must be an explicit `#rrggbb` hex color. */
export const COLOR_TOKENS = [
  'gray',
  'red',
  'pink',
  'grape',
  'violet',
  'indigo',
  'blue',
  'cyan',
  'teal',
  'green',
  'lime',
  'yellow',
  'orange',
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isColorValue(value: string): boolean {
  return (COLOR_TOKENS as readonly string[]).includes(value) || HEX_COLOR.test(value);
}

export const ColorSchema = z
  .string()
  .refine(isColorValue, { message: 'Expected a color token or a #rrggbb hex color' })
  .openapi('Color', { example: 'blue' });

/** A user-visible name: trimmed, 1–100 characters. */
export const EntityNameSchema = z.string().trim().min(1).max(100);
