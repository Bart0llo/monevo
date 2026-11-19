import type { ResponseConfig } from '@asteasolutions/zod-to-openapi';
import {
  ERROR_STATUS,
  type ApiTokenPermission,
  type ErrorCode,
  PERMISSIONS_EXTENSION,
  PROBLEM_CONTENT_TYPE,
  ProblemSchema,
} from '@monevo/contracts';

// Shared OpenAPI fragments for module registrations (api-design.md#4-error-format,
// api-tokens.md#7-api-documentation).

export const COOKIE_AUTH = 'cookieAuth';
export const API_TOKEN_AUTH = 'apiToken';

/** `security` + `x-monevo-permissions` for an operation. */
export function securityFor(
  kind: 'public' | 'session' | { permissions: readonly ApiTokenPermission[] },
): { security: Record<string, string[]>[]; [PERMISSIONS_EXTENSION]?: string[] } {
  if (kind === 'public') return { security: [] };
  if (kind === 'session') return { security: [{ [COOKIE_AUTH]: [] }] };
  return {
    security: [{ [COOKIE_AUTH]: [] }, { [API_TOKEN_AUTH]: [] }],
    [PERMISSIONS_EXTENSION]: [...kind.permissions],
  };
}

/** problem+json responses grouped by HTTP status. */
export function problemResponses(...codes: ErrorCode[]): Record<number, ResponseConfig> {
  const byStatus = new Map<number, ErrorCode[]>();
  for (const code of codes) {
    const status = ERROR_STATUS[code];
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }
  return Object.fromEntries(
    [...byStatus.entries()].map(([status, list]) => [
      status,
      {
        description: list.map((code) => `\`${code}\``).join(', '),
        content: { [PROBLEM_CONTENT_TYPE]: { schema: ProblemSchema } },
      },
    ]),
  );
}

/** Errors every authenticated operation can return. */
export const AUTH_ERRORS: ErrorCode[] = ['UNAUTHENTICATED', 'RATE_LIMITED'];
export const SESSION_ERRORS: ErrorCode[] = [...AUTH_ERRORS, 'API_TOKEN_NOT_ALLOWED'];
export const SESSION_WRITE_ERRORS: ErrorCode[] = [...SESSION_ERRORS, 'CSRF_INVALID'];
export const TOKEN_ERRORS: ErrorCode[] = [
  ...AUTH_ERRORS,
  'API_TOKEN_EXPIRED',
  'API_TOKEN_REVOKED',
  'API_TOKEN_PERMISSION_DENIED',
];
