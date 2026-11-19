import { z } from './zod.js';

// Authentication DTOs (authentication.md#8-api-surface-summary). OIDC-only (ADR-0020).

export const InstantSchema = z.iso.datetime().openapi({ example: '2026-11-19T10:00:00.000Z' });
export const UuidSchema = z.uuid();

export const USER_ROLES = ['USER', 'ADMIN'] as const;
export const UserRoleSchema = z.enum(USER_ROLES).openapi('UserRole');
export type UserRole = z.infer<typeof UserRoleSchema>;

export const USER_STATUSES = ['ACTIVE', 'DEACTIVATED'] as const;
export const UserStatusSchema = z.enum(USER_STATUSES).openapi('UserStatus');
export type UserStatus = z.infer<typeof UserStatusSchema>;

/** `/login?error=<code>` values set by the OIDC callback (authentication.md#endpoints). */
export const LOGIN_ERROR_CODES = [
  'idp_unavailable',
  'login_failed',
  'access_denied',
  'account_deactivated',
  'reauth_mismatch',
] as const;
export type LoginErrorCode = (typeof LOGIN_ERROR_CODES)[number];

export const OIDC_INTENTS = ['login', 'reauth'] as const;
export type OidcIntent = (typeof OIDC_INTENTS)[number];

/** Recent-authentication window for sensitive actions (authentication.md#recent-authentication). */
export const RECENT_AUTH_WINDOW_MS = 15 * 60 * 1000;

export const AuthConfigResponseSchema = z
  .object({ providerName: z.string() })
  .openapi('AuthConfigResponse');

export const OidcStartQuerySchema = z.object({
  intent: z.enum(OIDC_INTENTS).default('login'),
  returnTo: z.string().max(2000).optional(),
  locale: z.string().max(35).optional(),
  timeZone: z.string().max(64).optional(),
});

export const SessionUserSchema = z
  .object({
    id: UuidSchema,
    displayName: z.string(),
    email: z.string().nullable(),
    role: UserRoleSchema,
  })
  .openapi('SessionUser');

export const AuthSessionResponseSchema = z
  .object({
    user: SessionUserSchema,
    csrfToken: z.string(),
    recentAuthUntil: InstantSchema.nullable(),
    onboardingRequired: z.boolean(),
  })
  .openapi('AuthSessionResponse');

export const LogoutResponseSchema = z
  .object({ endSessionUrl: z.string().nullable() })
  .openapi('LogoutResponse');

export type AuthConfigResponse = z.infer<typeof AuthConfigResponseSchema>;
export type OidcStartQuery = z.infer<typeof OidcStartQuerySchema>;
export type SessionUser = z.infer<typeof SessionUserSchema>;
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;
