import express, { type Router } from 'express';
import type { Config } from './config/env.js';
import { DEFAULT_RATE_LIMITS, type IdentityRateLimits } from './http/rate-limit.js';
import type { Clock } from './infra/clock.js';
import type { Logger } from './infra/logger.js';
import type { OidcClient } from './infra/oidc.js';
import type { PrismaClient } from './infra/prisma.js';
import { adminRouter } from './modules/admin/index.js';
import { apiTokensRouter } from './modules/api-tokens/index.js';
import {
  authRouter,
  createGuards,
  createLoginService,
  createOidcStateSealer,
  createRevalidator,
  createSessionService,
  sessionsRouter,
} from './modules/auth/index.js';
import { meRouter } from './modules/users/index.js';

// Composition root of the identity modules (users, auth, api-tokens, admin). The auth module
// implements the guards; the other routers receive them as a parameter.

export type IdentityConfig = Pick<
  Config,
  'appUrl' | 'insecureCookies' | 'encryptionKey' | 'oidc' | 'session'
>;

export interface IdentityDeps {
  readonly prisma: PrismaClient;
  readonly oidc: OidcClient;
  readonly clock: Clock;
  readonly config: IdentityConfig;
  /** Overrides for tests. */
  readonly limits?: Partial<IdentityRateLimits>;
}

export function createIdentityRouter(deps: IdentityDeps, logger: Logger): Router {
  const { prisma, oidc, clock, config } = deps;
  const limits: IdentityRateLimits = { ...DEFAULT_RATE_LIMITS, ...deps.limits };
  const cookies = { insecureCookies: config.insecureCookies };
  const sessions = createSessionService({
    prisma,
    clock,
    session: config.session,
    encryptionKey: config.encryptionKey,
  });
  const revalidator = createRevalidator({ prisma, oidc, clock, logger, sessions });
  const guards = createGuards({ prisma, clock, sessions, revalidator, cookies, limits });
  const login = createLoginService({ prisma, oidc, clock, logger, sessions });
  const sealer = createOidcStateSealer(config.encryptionKey);

  const router = express.Router();
  router.use(
    authRouter({ prisma, oidc, clock, logger, sessions, login, sealer, cookies, limits }, guards),
  );
  router.use(sessionsRouter({ prisma, clock, logger, cookies }, guards));
  router.use(meRouter({ prisma, clock }, guards));
  router.use(apiTokensRouter({ prisma, clock, logger }, guards));
  router.use(adminRouter({ prisma, oidc, clock, logger }, guards));
  return router;
}
