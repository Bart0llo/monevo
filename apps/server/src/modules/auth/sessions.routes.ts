import express, { type Router } from 'express';
import type { RevokeOthersResponse, SessionListResponse } from '@monevo/contracts';
import {
  clearCookie,
  cookieName,
  type CookieSettings,
  SESSION_COOKIE,
} from '../../http/cookies.js';
import { AppError } from '../../http/errors.js';
import { type Guards, sessionOf } from '../../http/guards.js';
import { uuidParam } from '../../http/params.js';
import { readShowSessionIp } from '../../infra/app-settings.js';
import type { Clock } from '../../infra/clock.js';
import type { Logger } from '../../infra/logger.js';
import type { PrismaClient } from '../../infra/prisma.js';
import { listActiveSessions, revokeOtherSessions, revokeSession } from './sessions.repo.js';

// `/me/sessions` (authentication.md#4-sessions): session only, never API tokens (R-TOK-07).

export interface SessionRouteDeps {
  readonly prisma: PrismaClient;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly cookies: CookieSettings;
}

export function sessionsRouter(deps: SessionRouteDeps, guards: Guards): Router {
  const router = express.Router();
  const { prisma, clock, logger } = deps;
  const sessionCookie = cookieName(SESSION_COOKIE, deps.cookies);

  router.get('/me/sessions', ...guards.requireAuth(), async (req, res) => {
    const current = sessionOf(req);
    const showIp = await readShowSessionIp(prisma);
    const rows = await listActiveSessions(prisma, current.userId, clock.now());
    const body: SessionListResponse = {
      items: rows.map((row) => ({
        id: row.id,
        deviceLabel: row.deviceLabel,
        userAgent: row.userAgent,
        ipLast: showIp ? row.ipLast : null,
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        current: row.id === current.sessionId,
      })),
    };
    res.json(body);
  });

  router.delete('/me/sessions/:id', ...guards.requireAuth(), async (req, res) => {
    const current = sessionOf(req);
    const id = uuidParam(req, 'id');
    if (!(await revokeSession(prisma, current.userId, id, 'USER_REVOKED', clock.now()))) {
      throw new AppError('NOT_FOUND');
    }
    logger.info(
      {
        event: 'auth.session.revoked',
        userId: current.userId,
        sessionId: id,
        reason: 'USER_REVOKED',
      },
      'session revoked',
    );
    if (id === current.sessionId) clearCookie(res, sessionCookie, deps.cookies);
    res.status(204).end();
  });

  router.post('/me/sessions/revoke-others', ...guards.requireAuth(), async (req, res) => {
    const current = sessionOf(req);
    const revoked = await revokeOtherSessions(
      prisma,
      current.userId,
      current.sessionId,
      clock.now(),
    );
    logger.info(
      {
        event: 'auth.session.revoked',
        userId: current.userId,
        count: revoked,
        reason: 'USER_REVOKED',
      },
      'other sessions revoked',
    );
    const body: RevokeOthersResponse = { revoked };
    res.json(body);
  });

  return router;
}
