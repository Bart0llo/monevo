import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  AdminSettingsSchema,
  AdminSettingsUpdateSchema,
  AdminUserListQuerySchema,
  AdminUserPageSchema,
  AdminUserSchema,
  AdminUserUpdateSchema,
  type ErrorCode,
  IdentityProviderStatusSchema,
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
const READ_ERRORS: ErrorCode[] = [...SESSION_ERRORS, 'FORBIDDEN'];
const WRITE_ERRORS: ErrorCode[] = [...SESSION_WRITE_ERRORS, 'FORBIDDEN', 'NOT_FOUND'];

export function registerAdminOpenApi(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/admin/users',
    operationId: 'adminListUsers',
    tags: ['admin'],
    summary: 'Users (operational data only)',
    ...securityFor('session'),
    request: { query: AdminUserListQuerySchema },
    responses: {
      200: { description: 'Page of users', ...json(AdminUserPageSchema) },
      ...problemResponses(...READ_ERRORS, 'VALIDATION_FAILED'),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/admin/users/{id}',
    operationId: 'adminGetUser',
    tags: ['admin'],
    summary: 'One user',
    ...securityFor('session'),
    request: { params: idParams },
    responses: {
      200: { description: 'User', ...json(AdminUserSchema) },
      ...problemResponses(...READ_ERRORS, 'NOT_FOUND'),
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/admin/users/{id}',
    operationId: 'adminUpdateUser',
    tags: ['admin'],
    summary: 'Change a user’s role',
    description:
      'Requires a recent re-authentication. Refused while roles follow the identity provider group (`OIDC_ADMIN_GROUP`).',
    ...securityFor('session'),
    request: { params: idParams, body: { required: true, ...json(AdminUserUpdateSchema) } },
    responses: {
      200: { description: 'User', ...json(AdminUserSchema) },
      ...problemResponses(
        ...WRITE_ERRORS,
        'REAUTH_REQUIRED',
        'LAST_ADMIN',
        'ROLE_MANAGED_BY_IDP',
        'VALIDATION_FAILED',
      ),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/admin/users/{id}/deactivate',
    operationId: 'adminDeactivateUser',
    tags: ['admin'],
    summary: 'Deactivate a user and revoke their sessions and API tokens',
    description:
      'Requires a recent re-authentication. Administrators cannot deactivate themselves.',
    ...securityFor('session'),
    request: { params: idParams },
    responses: {
      200: { description: 'User', ...json(AdminUserSchema) },
      ...problemResponses(...WRITE_ERRORS, 'REAUTH_REQUIRED', 'LAST_ADMIN'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/admin/users/{id}/activate',
    operationId: 'adminActivateUser',
    tags: ['admin'],
    summary: 'Reactivate a user',
    ...securityFor('session'),
    request: { params: idParams },
    responses: {
      200: { description: 'User', ...json(AdminUserSchema) },
      ...problemResponses(...WRITE_ERRORS),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/admin/identity-provider',
    operationId: 'adminGetIdentityProvider',
    tags: ['admin'],
    summary: 'Identity provider configuration and status (read-only)',
    ...securityFor('session'),
    responses: {
      200: { description: 'Status', ...json(IdentityProviderStatusSchema) },
      ...problemResponses(...READ_ERRORS),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/admin/settings',
    operationId: 'adminGetSettings',
    tags: ['admin'],
    summary: 'Instance runtime settings',
    description: 'Settings set by an environment variable are reported with `lockedByEnv: true`.',
    ...securityFor('session'),
    responses: {
      200: { description: 'Settings', ...json(AdminSettingsSchema) },
      ...problemResponses(...READ_ERRORS),
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/admin/settings',
    operationId: 'adminUpdateSettings',
    tags: ['admin'],
    summary: 'Change instance runtime settings',
    description:
      'Changing a setting enforced by an environment variable returns `SETTING_LOCKED_BY_ENV`.',
    ...securityFor('session'),
    request: { body: { required: true, ...json(AdminSettingsUpdateSchema) } },
    responses: {
      200: { description: 'Settings', ...json(AdminSettingsSchema) },
      ...problemResponses(
        ...SESSION_WRITE_ERRORS,
        'FORBIDDEN',
        'SETTING_LOCKED_BY_ENV',
        'VALIDATION_FAILED',
      ),
    },
  });
}
