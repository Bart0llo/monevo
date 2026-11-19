import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  ApiTokenCreatedResponseSchema,
  ApiTokenCreateSchema,
  ApiTokenListResponseSchema,
  ApiTokenRenameSchema,
  ApiTokenSchema,
  z,
} from '@monevo/contracts';
import {
  problemResponses,
  SESSION_ERRORS,
  SESSION_WRITE_ERRORS,
  securityFor,
} from '../../openapi/helpers.js';

const json = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } } });
const idParams = z.object({ id: z.uuid() });

export function registerApiTokensOpenApi(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/me/api-tokens',
    operationId: 'listApiTokens',
    tags: ['api-tokens'],
    summary: 'Personal API tokens (active, and revoked or expired within 90 days)',
    ...securityFor('session'),
    responses: {
      200: { description: 'Tokens', ...json(ApiTokenListResponseSchema) },
      ...problemResponses(...SESSION_ERRORS),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/me/api-tokens',
    operationId: 'createApiToken',
    tags: ['api-tokens'],
    summary: 'Create a token; the secret is returned only in this response',
    description: 'Requires a re-authentication at the identity provider within 15 minutes.',
    ...securityFor('session'),
    request: { body: { required: true, ...json(ApiTokenCreateSchema) } },
    responses: {
      201: { description: 'Created', ...json(ApiTokenCreatedResponseSchema) },
      ...problemResponses(
        ...SESSION_WRITE_ERRORS,
        'REAUTH_REQUIRED',
        'VALIDATION_FAILED',
        'API_TOKEN_LIMIT_REACHED',
      ),
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/me/api-tokens/{id}',
    operationId: 'renameApiToken',
    tags: ['api-tokens'],
    summary: 'Rename a token',
    ...securityFor('session'),
    request: { params: idParams, body: { required: true, ...json(ApiTokenRenameSchema) } },
    responses: {
      200: { description: 'Renamed', ...json(ApiTokenSchema) },
      ...problemResponses(...SESSION_WRITE_ERRORS, 'NOT_FOUND', 'VALIDATION_FAILED'),
    },
  });
  registry.registerPath({
    method: 'delete',
    path: '/me/api-tokens/{id}',
    operationId: 'revokeApiToken',
    tags: ['api-tokens'],
    summary: 'Revoke a token (idempotent)',
    ...securityFor('session'),
    request: { params: idParams },
    responses: {
      204: { description: 'Revoked' },
      ...problemResponses(...SESSION_WRITE_ERRORS, 'NOT_FOUND'),
    },
  });
}
