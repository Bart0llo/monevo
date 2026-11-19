import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  AuthConfigResponseSchema,
  AuthSessionResponseSchema,
  LOGIN_ERROR_CODES,
  LogoutResponseSchema,
  OidcStartQuerySchema,
  RevokeOthersResponseSchema,
  SessionListResponseSchema,
  z,
} from '@monevo/contracts';
import {
  problemResponses,
  SESSION_ERRORS,
  SESSION_WRITE_ERRORS,
  securityFor,
} from '../../openapi/helpers.js';

const json = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } } });
const loginErrors = LOGIN_ERROR_CODES.map((code) => `\`${code}\``).join(', ');

export function registerAuthOpenApi(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/auth/config',
    operationId: 'getAuthConfig',
    tags: ['auth'],
    summary: 'Sign-in configuration (identity provider name)',
    ...securityFor('public'),
    responses: { 200: { description: 'Configuration', ...json(AuthConfigResponseSchema) } },
  });
  registry.registerPath({
    method: 'get',
    path: '/auth/oidc/start',
    operationId: 'startOidc',
    tags: ['auth'],
    summary: 'Start sign-in (or re-authentication) at the identity provider',
    description:
      'Browser navigation. Redirects to the identity provider; `intent=reauth` needs a session and forces a fresh sign-in.',
    ...securityFor('public'),
    request: { query: OidcStartQuerySchema },
    responses: {
      302: {
        description: 'Redirect to the identity provider, or to `/login?error=idp_unavailable`',
      },
      ...problemResponses('UNAUTHENTICATED', 'RATE_LIMITED'),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/auth/oidc/callback',
    operationId: 'oidcCallback',
    tags: ['auth'],
    summary: 'Redirect URI registered at the identity provider',
    description: `Browser navigation. Redirects to the requested page, or to \`/login?error=<code>\` with one of ${loginErrors}.`,
    ...securityFor('public'),
    responses: {
      302: { description: 'Redirect' },
      ...problemResponses('RATE_LIMITED'),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/auth/session',
    operationId: 'getAuthSession',
    tags: ['auth'],
    summary: 'The current session, user and CSRF token',
    ...securityFor('session'),
    responses: {
      200: { description: 'Session', ...json(AuthSessionResponseSchema) },
      ...problemResponses(...SESSION_ERRORS),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/auth/logout',
    operationId: 'logout',
    tags: ['auth'],
    summary: 'Sign out; returns the identity provider logout URL to navigate to',
    ...securityFor('session'),
    responses: {
      200: { description: 'Signed out', ...json(LogoutResponseSchema) },
      ...problemResponses(...SESSION_WRITE_ERRORS),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/me/sessions',
    operationId: 'listSessions',
    tags: ['sessions'],
    summary: 'Active sessions (devices)',
    ...securityFor('session'),
    responses: {
      200: { description: 'Sessions', ...json(SessionListResponseSchema) },
      ...problemResponses(...SESSION_ERRORS),
    },
  });
  registry.registerPath({
    method: 'delete',
    path: '/me/sessions/{id}',
    operationId: 'revokeSession',
    tags: ['sessions'],
    summary: 'Revoke a session',
    ...securityFor('session'),
    request: { params: z.object({ id: z.uuid() }) },
    responses: {
      204: { description: 'Revoked' },
      ...problemResponses(...SESSION_WRITE_ERRORS, 'NOT_FOUND'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/me/sessions/revoke-others',
    operationId: 'revokeOtherSessions',
    tags: ['sessions'],
    summary: 'Revoke every session except the current one',
    ...securityFor('session'),
    responses: {
      200: { description: 'Revoked', ...json(RevokeOthersResponseSchema) },
      ...problemResponses(...SESSION_WRITE_ERRORS),
    },
  });
}
