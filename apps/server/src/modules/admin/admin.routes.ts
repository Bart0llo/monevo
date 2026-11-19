import express, { type Request, type Router } from 'express';
import {
  type AdminUser,
  AdminUserListQuerySchema,
  type AdminUserPage,
  AdminUserUpdateSchema,
  type IdentityProviderStatus,
} from '@monevo/contracts';
import { AppError } from '../../http/errors.js';
import { authOf, type Guards } from '../../http/guards.js';
import { uuidParam } from '../../http/params.js';
import type { Clock } from '../../infra/clock.js';
import type { Logger } from '../../infra/logger.js';
import type { OidcClient } from '../../infra/oidc.js';
import type { PrismaClient } from '../../infra/prisma.js';
import { revokeAllTokens } from '../api-tokens/index.js';
import { revokeAllSessions } from '../auth/index.js';
import {
  type AdminUserCursor,
  type AdminUserRecord,
  findAdminUser,
  listUsers,
  setUserRole,
  setUserStatus,
  withAdminGuard,
} from '../users/index.js';

// `/admin/*` (administration.md): operational data only, never financial data. Admin routes are
// session-only (API tokens get 403 API_TOKEN_NOT_ALLOWED).

export interface AdminRouteDeps {
  readonly prisma: PrismaClient;
  readonly oidc: OidcClient;
  readonly clock: Clock;
  readonly logger: Logger;
}

function toAdminUser(user: AdminUserRecord): AdminUser {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    activeSessionCount: user.activeSessionCount,
  };
}

export function encodeCursor(cursor: AdminUserCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt.toISOString(), cursor.id])).toString(
    'base64url',
  );
}

export function decodeCursor(value: string): AdminUserCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string'
    ) {
      const createdAt = new Date(parsed[0]);
      if (!Number.isNaN(createdAt.getTime())) return { createdAt, id: parsed[1] };
    }
  } catch {
    // Fall through to the validation error.
  }
  throw new AppError('VALIDATION_FAILED', 'One or more fields are invalid.', [
    { path: ['cursor'], code: 'INVALID_VALUE', message: 'Invalid cursor.' },
  ]);
}

export function adminRouter(deps: AdminRouteDeps, guards: Guards): Router {
  const router = express.Router();
  const { prisma, oidc, clock, logger } = deps;
  const admin = [...guards.requireAuth(), guards.requireRole('ADMIN')];
  const sensitive = [...admin, guards.requireRecentAuth()];

  function audit(req: Request, action: string, targetUserId: string, extra: object = {}) {
    logger.info(
      {
        event: 'admin.action',
        action,
        actorUserId: authOf(req).userId,
        targetUserId,
        requestId: req.requestId,
        ...extra,
      },
      `admin action: ${action}`,
    );
  }

  async function loadUser(id: string): Promise<AdminUserRecord> {
    const user = await findAdminUser(prisma, id, clock.now());
    if (!user) throw new AppError('NOT_FOUND');
    return user;
  }

  router.get('/admin/users', ...admin, async (req, res) => {
    const query = AdminUserListQuerySchema.parse(req.query);
    const rows = await listUsers(prisma, {
      after: query.cursor ? decodeCursor(query.cursor) : undefined,
      limit: query.limit + 1,
      q: query.q || undefined,
      status: query.status,
      now: clock.now(),
    });
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    const body: AdminUserPage = {
      items: items.map(toAdminUser),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
    };
    res.json(body);
  });

  router.get('/admin/users/:id', ...admin, async (req, res) => {
    res.json(toAdminUser(await loadUser(uuidParam(req, 'id'))));
  });

  router.patch('/admin/users/:id', ...sensitive, async (req, res) => {
    const id = uuidParam(req, 'id');
    const body = AdminUserUpdateSchema.parse(req.body);
    if (oidc.config.adminGroup !== undefined) throw new AppError('ROLE_MANAGED_BY_IDP');
    const target = await loadUser(id);
    if (target.role !== body.role) {
      const result = await withAdminGuard(prisma, body.role === 'USER' ? id : undefined, (tx) =>
        setUserRole(tx, id, body.role),
      );
      if (result === 'LAST_ADMIN') throw new AppError('LAST_ADMIN');
      audit(req, 'user.role_changed', id, { from: target.role, to: body.role });
    }
    res.json(toAdminUser(await loadUser(id)));
  });

  router.post('/admin/users/:id/deactivate', ...sensitive, async (req, res) => {
    const id = uuidParam(req, 'id');
    if (id === authOf(req).userId) {
      throw new AppError('FORBIDDEN', 'Administrators cannot deactivate themselves.');
    }
    const target = await loadUser(id);
    if (target.status === 'ACTIVE') {
      const now = clock.now();
      const result = await withAdminGuard(prisma, id, async (tx) => {
        await setUserStatus(tx, id, 'DEACTIVATED');
        const sessions = await revokeAllSessions(tx, id, 'DEACTIVATED', now);
        const tokens = await revokeAllTokens(tx, id, 'DEACTIVATED', now);
        return { sessions, tokens };
      });
      if (result === 'LAST_ADMIN') throw new AppError('LAST_ADMIN');
      audit(req, 'user.deactivated', id, {
        revokedSessions: result.sessions,
        revokedTokens: result.tokens,
      });
    }
    res.json(toAdminUser(await loadUser(id)));
  });

  router.post('/admin/users/:id/activate', ...admin, async (req, res) => {
    const id = uuidParam(req, 'id');
    const target = await loadUser(id);
    if (target.status !== 'ACTIVE') {
      await setUserStatus(prisma, id, 'ACTIVE');
      audit(req, 'user.activated', id);
    }
    res.json(toAdminUser(await loadUser(id)));
  });

  router.get('/admin/identity-provider', ...admin, async (_req, res) => {
    const status = await oidc.status();
    const config = oidc.config;
    const body: IdentityProviderStatus = {
      providerName: config.displayName,
      issuer: config.issuer,
      clientId: config.clientId,
      clientType: config.clientSecret === undefined ? 'PUBLIC' : 'CONFIDENTIAL',
      scopes: [...config.scopes],
      adminGroup: config.adminGroup ?? null,
      discovery: status.discovery,
      endSessionSupported: status.endSessionSupported,
    };
    res.json(body);
  });

  return router;
}
