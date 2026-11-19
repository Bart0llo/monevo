import { InstantSchema, UuidSchema } from './auth.js';
import { z } from './zod.js';

// Personal API tokens (api-tokens.md). The catalogue lists only permissions whose routes exist
// (api-tokens.md#4-permission-catalogue); later stages add theirs.

export const API_TOKEN_PERMISSIONS = [
  'profile:read',
  'currencies:read',
  'exchange-rates:create',
  'accounts:read',
  'accounts:create',
  'accounts:update',
  'accounts:delete',
  'categories:read',
  'categories:create',
  'categories:update',
  'categories:delete',
] as const;
export type ApiTokenPermission = (typeof API_TOKEN_PERMISSIONS)[number];
export const ApiTokenPermissionSchema = z.enum(API_TOKEN_PERMISSIONS).openapi('ApiTokenPermission');

/** "Also requires" rules: selecting the key needs every listed permission too. */
export const API_TOKEN_PERMISSION_REQUIRES: Readonly<
  Record<ApiTokenPermission, readonly ApiTokenPermission[]>
> = {
  'profile:read': [],
  'currencies:read': [],
  'exchange-rates:create': [],
  'accounts:read': [],
  'accounts:create': [],
  'accounts:update': [],
  'accounts:delete': [],
  'categories:read': [],
  'categories:create': [],
  'categories:update': [],
  'categories:delete': [],
};

/** OpenAPI extension that lists the permissions an operation requires. */
export const PERMISSIONS_EXTENSION = 'x-monevo-permissions';

export const API_TOKEN_PREFIX = 'mnv_pat_';
export const MAX_ACTIVE_API_TOKENS = 50;

export const API_TOKEN_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;
export const ApiTokenStatusSchema = z.enum(API_TOKEN_STATUSES).openapi('ApiTokenStatus');
export type ApiTokenStatus = z.infer<typeof ApiTokenStatusSchema>;

export const ApiTokenNameSchema = z.string().trim().min(1).max(100);

export const ApiTokenSchema = z
  .object({
    id: UuidSchema,
    name: z.string(),
    displayPrefix: z.string(),
    permissions: z.array(ApiTokenPermissionSchema),
    status: ApiTokenStatusSchema,
    createdAt: InstantSchema,
    expiresAt: InstantSchema.nullable(),
    lastUsedAt: InstantSchema.nullable(),
    /** Null when the instance hides IP addresses. */
    lastUsedIp: z.string().nullable(),
    revokedAt: InstantSchema.nullable(),
  })
  .openapi('ApiToken');

export const ApiTokenCreateSchema = z
  .strictObject({
    name: ApiTokenNameSchema,
    permissions: z
      .array(ApiTokenPermissionSchema)
      .min(1)
      .max(API_TOKEN_PERMISSIONS.length)
      .refine((items) => new Set(items).size === items.length, {
        message: 'Permissions must be unique',
      }),
    expiresAt: InstantSchema.nullable().optional(),
  })
  .openapi('ApiTokenCreate');

export const ApiTokenCreatedResponseSchema = z
  .object({ token: ApiTokenSchema, secret: z.string() })
  .openapi('ApiTokenCreatedResponse');

export const ApiTokenRenameSchema = z
  .strictObject({ name: ApiTokenNameSchema })
  .openapi('ApiTokenRename');

export const ApiTokenListResponseSchema = z
  .object({ items: z.array(ApiTokenSchema) })
  .openapi('ApiTokenListResponse');

/** Permissions missing from `granted` for an operation that needs `required`. */
export function missingPermissions(
  granted: readonly string[],
  required: readonly string[],
): string[] {
  const set = new Set(granted);
  return required.filter((permission) => !set.has(permission));
}

/** "Also requires" violations of a requested permission set. */
export function unmetPermissionRequirements(
  permissions: readonly ApiTokenPermission[],
): { permission: ApiTokenPermission; requires: ApiTokenPermission }[] {
  const set = new Set(permissions);
  return permissions.flatMap((permission) =>
    API_TOKEN_PERMISSION_REQUIRES[permission]
      .filter((required) => !set.has(required))
      .map((requires) => ({ permission, requires })),
  );
}

export type ApiToken = z.infer<typeof ApiTokenSchema>;
export type ApiTokenCreate = z.infer<typeof ApiTokenCreateSchema>;
export type ApiTokenCreatedResponse = z.infer<typeof ApiTokenCreatedResponseSchema>;
export type ApiTokenRename = z.infer<typeof ApiTokenRenameSchema>;
export type ApiTokenListResponse = z.infer<typeof ApiTokenListResponseSchema>;
