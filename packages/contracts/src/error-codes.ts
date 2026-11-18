// Stable machine-readable error codes (api-design.md#4-error-format). Every code has a
// translation key `errors.<CODE>` in @monevo/i18n (checked by `pnpm i18n:check`).
// This file has no imports so that repository scripts can load it directly with Node.
// Codes are added by the stage that first returns them.
export const ERROR_CODES = [
  'MALFORMED_REQUEST',
  'NOT_FOUND',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'VALIDATION_FAILED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = {
  MALFORMED_REQUEST: 400,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  VALIDATION_FAILED: 422,
  INTERNAL: 500,
};
