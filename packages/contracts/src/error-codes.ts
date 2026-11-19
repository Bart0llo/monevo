// Stable machine-readable error codes (api-design.md#4-error-format). Every code has a
// translation key `errors.<CODE>` in @monevo/i18n (checked by `pnpm i18n:check`).
// This file has no imports so that repository scripts can load it directly with Node.
// Codes are added by the stage that first returns them.
export const ERROR_CODES = [
  'MALFORMED_REQUEST',
  'UNAUTHENTICATED',
  'API_TOKEN_EXPIRED',
  'API_TOKEN_REVOKED',
  'FORBIDDEN',
  'CSRF_INVALID',
  'REAUTH_REQUIRED',
  'ACCOUNT_DEACTIVATED',
  'API_TOKEN_NOT_ALLOWED',
  'API_TOKEN_PERMISSION_DENIED',
  'NOT_FOUND',
  'VERSION_CONFLICT',
  'LAST_ADMIN',
  'ROLE_MANAGED_BY_IDP',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'VALIDATION_FAILED',
  'API_TOKEN_LIMIT_REACHED',
  'PRECONDITION_REQUIRED',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = {
  MALFORMED_REQUEST: 400,
  UNAUTHENTICATED: 401,
  API_TOKEN_EXPIRED: 401,
  API_TOKEN_REVOKED: 401,
  FORBIDDEN: 403,
  CSRF_INVALID: 403,
  REAUTH_REQUIRED: 403,
  ACCOUNT_DEACTIVATED: 403,
  API_TOKEN_NOT_ALLOWED: 403,
  API_TOKEN_PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  LAST_ADMIN: 409,
  ROLE_MANAGED_BY_IDP: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  VALIDATION_FAILED: 422,
  API_TOKEN_LIMIT_REACHED: 422,
  PRECONDITION_REQUIRED: 428,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** Field-level `errors[].code` values with a translation key `fieldErrors.<CODE>` (common namespace). */
export const FIELD_ERROR_CODES = ['BASE_CURRENCY_LOCKED'] as const;
export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number];
