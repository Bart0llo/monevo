import express, { type Router } from 'express';
import { ApiTokenCreateSchema, ApiTokenRenameSchema } from '@monevo/contracts';
import { AppError } from '../../http/errors.js';
import { type Guards, sessionOf } from '../../http/guards.js';
import { uuidParam } from '../../http/params.js';
import { readShowSessionIp } from '../../infra/app-settings.js';
import type { Clock } from '../../infra/clock.js';
import type { Logger } from '../../infra/logger.js';
import type { PrismaClient } from '../../infra/prisma.js';
import { listTokens, renameToken, revokeToken } from './api-tokens.repo.js';
import { createApiToken, TOKEN_RETENTION_MS, toApiTokenDto } from './api-tokens.service.js';

// `/me/api-tokens` (api-tokens.md#5-token-management): session only.

export interface ApiTokenRouteDeps {
  readonly prisma: PrismaClient;
  readonly clock: Clock;
  readonly logger: Logger;
}

export function apiTokensRouter(deps: ApiTokenRouteDeps, guards: Guards): Router {
  const router = express.Router();
  const { prisma, clock, logger } = deps;

  router.get('/me/api-tokens', ...guards.requireAuth(), async (req, res) => {
    const { userId } = sessionOf(req);
    const now = clock.now();
    const showIp = await readShowSessionIp(prisma);
    const tokens = await listTokens(prisma, userId, new Date(now.getTime() - TOKEN_RETENTION_MS));
    res.json({ items: tokens.map((token) => toApiTokenDto(token, now, showIp)) });
  });

  router.post(
    '/me/api-tokens',
    ...guards.requireAuth(),
    guards.requireRecentAuth(),
    async (req, res) => {
      const { userId } = sessionOf(req);
      const body = ApiTokenCreateSchema.parse(req.body);
      const created = await createApiToken(
        prisma,
        userId,
        body,
        clock.now(),
        await readShowSessionIp(prisma),
      );
      logger.info(
        {
          event: 'api_token.created',
          userId,
          apiTokenId: created.token.id,
          permissions: created.token.permissions,
          requestId: req.requestId,
        },
        'API token created',
      );
      res.status(201).json(created);
    },
  );

  router.patch('/me/api-tokens/:id', ...guards.requireAuth(), async (req, res) => {
    const { userId } = sessionOf(req);
    const id = uuidParam(req, 'id');
    const body = ApiTokenRenameSchema.parse(req.body);
    const token = await renameToken(prisma, userId, id, body.name);
    if (!token) throw new AppError('NOT_FOUND');
    res.json(toApiTokenDto(token, clock.now(), await readShowSessionIp(prisma)));
  });

  router.delete('/me/api-tokens/:id', ...guards.requireAuth(), async (req, res) => {
    const { userId } = sessionOf(req);
    const id = uuidParam(req, 'id');
    if (!(await revokeToken(prisma, userId, id, clock.now()))) throw new AppError('NOT_FOUND');
    logger.info(
      { event: 'api_token.revoked', userId, apiTokenId: id, requestId: req.requestId },
      'API token revoked',
    );
    res.status(204).end();
  });

  return router;
}
