import { isTimeZone } from '@monevo/domain';
import { InstantSchema, UserRoleSchema, UuidSchema } from './auth.js';
import { CurrencyCodeSchema } from './common.js';
import { z } from './zod.js';

// Profile, settings and session management (authentication.md#8-api-surface-summary,
// data-model.md#user_settings).

export const LOCALES = ['en', 'pl'] as const;
export const LocaleSchema = z.enum(LOCALES).openapi('Locale');
export type Locale = z.infer<typeof LocaleSchema>;

export const WEEK_STARTS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
export const WeekStartSchema = z.enum(WEEK_STARTS).openapi('WeekStart');

export const DATE_FORMATS = [
  'LOCALE',
  'YYYY-MM-DD',
  'DD.MM.YYYY',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
] as const;
export const DateFormatSchema = z.enum(DATE_FORMATS).openapi('DateFormat');

export const THEMES = ['LIGHT', 'DARK', 'SYSTEM'] as const;
export const ThemeSchema = z.enum(THEMES).openapi('Theme');

export const TimeZoneSchema = z
  .string()
  .refine(isTimeZone, { message: 'Unknown IANA time zone' })
  .openapi('TimeZone', { example: 'Europe/Warsaw' });

export const DisplayNameSchema = z.string().trim().min(1).max(100);

export const ProfileSchema = z
  .object({
    id: UuidSchema,
    displayName: z.string(),
    /** Omitted for API token requests (`profile:read` grants no email address). */
    email: z.string().nullable().optional(),
    role: UserRoleSchema,
    createdAt: InstantSchema,
  })
  .openapi('Profile');

export const ProfileUpdateSchema = z
  .strictObject({ displayName: DisplayNameSchema })
  .openapi('ProfileUpdate');

export const UserSettingsSchema = z
  .object({
    locale: LocaleSchema,
    timeZone: z.string(),
    baseCurrency: z.string(),
    weekStart: WeekStartSchema,
    dateFormat: DateFormatSchema,
    theme: ThemeSchema,
    onboardingCompletedAt: InstantSchema.nullable(),
    version: z.number().int(),
    updatedAt: InstantSchema,
  })
  .openapi('UserSettings');

export const UserSettingsUpdateSchema = z
  .strictObject({
    locale: LocaleSchema.optional(),
    timeZone: TimeZoneSchema.optional(),
    baseCurrency: CurrencyCodeSchema.optional(),
    weekStart: WeekStartSchema.optional(),
    dateFormat: DateFormatSchema.optional(),
    theme: ThemeSchema.optional(),
    /** Marks onboarding as completed; the base currency is locked afterwards. */
    completeOnboarding: z.literal(true).optional(),
    /** Alternative to `If-Match`. */
    version: z.number().int().min(1).optional(),
  })
  .openapi('UserSettingsUpdate');

export const SessionInfoSchema = z
  .object({
    id: UuidSchema,
    deviceLabel: z.string().nullable(),
    userAgent: z.string().nullable(),
    /** Null when the instance hides session IP addresses. */
    ipLast: z.string().nullable(),
    createdAt: InstantSchema,
    lastSeenAt: InstantSchema,
    current: z.boolean(),
  })
  .openapi('SessionInfo');

export const SessionListResponseSchema = z
  .object({ items: z.array(SessionInfoSchema) })
  .openapi('SessionListResponse');

export const RevokeOthersResponseSchema = z
  .object({ revoked: z.number().int() })
  .openapi('RevokeOthersResponse');

export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;
export type UserSettings = z.infer<typeof UserSettingsSchema>;
export type UserSettingsUpdate = z.infer<typeof UserSettingsUpdateSchema>;
export type SessionInfo = z.infer<typeof SessionInfoSchema>;
export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;
export type RevokeOthersResponse = z.infer<typeof RevokeOthersResponseSchema>;
export type WeekStart = z.infer<typeof WeekStartSchema>;
export type DateFormat = z.infer<typeof DateFormatSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
