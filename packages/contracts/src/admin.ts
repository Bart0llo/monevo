import { InstantSchema, UserRoleSchema, UserStatusSchema, UuidSchema } from './auth.js';
import { z } from './zod.js';

// Admin DTOs: operational data only, never financial fields (administration.md#1-boundaries).

export const PAGE_LIMIT_DEFAULT = 50;
export const PAGE_LIMIT_MAX = 200;

export const AdminUserSchema = z
  .object({
    id: UuidSchema,
    displayName: z.string(),
    email: z.string().nullable(),
    role: UserRoleSchema,
    status: UserStatusSchema,
    createdAt: InstantSchema,
    lastLoginAt: InstantSchema.nullable(),
    activeSessionCount: z.number().int(),
  })
  .openapi('AdminUser');

export const AdminUserListQuerySchema = z.strictObject({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
  q: z.string().trim().max(100).optional(),
  status: UserStatusSchema.optional(),
});

export const AdminUserPageSchema = z
  .object({ items: z.array(AdminUserSchema), nextCursor: z.string().nullable() })
  .openapi('AdminUserPage');

export const AdminUserUpdateSchema = z
  .strictObject({ role: UserRoleSchema })
  .openapi('AdminUserUpdate');

export const IdentityProviderStatusSchema = z
  .object({
    providerName: z.string(),
    issuer: z.string(),
    clientId: z.string(),
    clientType: z.enum(['CONFIDENTIAL', 'PUBLIC']),
    scopes: z.array(z.string()),
    /** Set → roles follow this IdP group (`ROLE_MANAGED_BY_IDP`). */
    adminGroup: z.string().nullable(),
    discovery: z.enum(['OK', 'ERROR']),
    /** Null while discovery fails. */
    endSessionSupported: z.boolean().nullable(),
  })
  .openapi('IdentityProviderStatus');

export type AdminUser = z.infer<typeof AdminUserSchema>;
export type AdminUserListQuery = z.infer<typeof AdminUserListQuerySchema>;
export type AdminUserPage = z.infer<typeof AdminUserPageSchema>;
export type AdminUserUpdate = z.infer<typeof AdminUserUpdateSchema>;
export type IdentityProviderStatus = z.infer<typeof IdentityProviderStatusSchema>;
