import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  ProfileSchema,
  ProfileUpdateSchema,
  UserSettingsSchema,
  UserSettingsUpdateSchema,
  z,
} from '@monevo/contracts';
import {
  problemResponses,
  SESSION_WRITE_ERRORS,
  securityFor,
  TOKEN_ERRORS,
} from '../../openapi/helpers.js';

const json = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } } });

export function registerUsersOpenApi(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/me',
    operationId: 'getProfile',
    tags: ['me'],
    summary: 'The signed-in user’s profile',
    description: 'API tokens receive no email address.',
    ...securityFor({ permissions: ['profile:read'] }),
    responses: {
      200: { description: 'Profile', ...json(ProfileSchema) },
      ...problemResponses(...TOKEN_ERRORS),
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/me',
    operationId: 'updateProfile',
    tags: ['me'],
    summary: 'Change the display name',
    ...securityFor('session'),
    request: { body: { required: true, ...json(ProfileUpdateSchema) } },
    responses: {
      200: { description: 'Updated profile', ...json(ProfileSchema) },
      ...problemResponses(...SESSION_WRITE_ERRORS, 'VALIDATION_FAILED'),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/me/settings',
    operationId: 'getSettings',
    tags: ['me'],
    summary: 'User settings',
    description: 'The `ETag` header carries the version for `If-Match`.',
    ...securityFor({ permissions: ['profile:read'] }),
    responses: {
      200: { description: 'Settings', ...json(UserSettingsSchema) },
      ...problemResponses(...TOKEN_ERRORS),
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/me/settings',
    operationId: 'updateSettings',
    tags: ['me'],
    summary: 'Change settings or complete onboarding',
    description:
      'Needs `If-Match: "<version>"` or `version`. The base currency cannot change after onboarding (`errors[].code` `BASE_CURRENCY_LOCKED`).',
    ...securityFor('session'),
    request: {
      headers: z.object({ 'If-Match': z.string().optional() }),
      body: { required: true, ...json(UserSettingsUpdateSchema) },
    },
    responses: {
      200: { description: 'Updated settings', ...json(UserSettingsSchema) },
      ...problemResponses(
        ...SESSION_WRITE_ERRORS,
        'MALFORMED_REQUEST',
        'VERSION_CONFLICT',
        'VALIDATION_FAILED',
        'PRECONDITION_REQUIRED',
      ),
    },
  });
}
