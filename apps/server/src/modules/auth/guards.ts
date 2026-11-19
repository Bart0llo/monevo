import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { missingPermissions, RECENT_AUTH_WINDOW_MS } from '@monevo/contracts';
import { cookieName, type CookieSettings, readCookie, SESSION_COOKIE } from '../../http/cookies.js';
import { AppError } from '../../http/errors.js';
import type { AuthContext, Guards, RequireAuthOptions } from '../../http/guards.js';
import { createRateLimit, clientIpKey, type IdentityRateLimits } from '../../http/rate-limit.js';
import type { Clock } from '../../infra/clock.js';
import { safeEqual } from '../../infra/crypto.js';
import type { PrismaClient } from '../../infra/prisma.js';
import { authenticateApiToken, isApiTokenSecret, recordTokenUse } from '../api-tokens/index.js';
import type { Revalidator } from './revalidation.js';
import type { SessionService } from './sessions.js';

// The request authentication pipeline (authentication.md#6-request-authentication-pipeline,
// api-tokens.md#3-authentication).

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'X-CSRF-Token';

export interface GuardDeps {
  readonly prisma: PrismaClient;
  readonly clock: Clock;
  readonly sessions: SessionService;
  readonly revalidator: Revalidator;
  readonly cookies: CookieSettings;
  readonly limits: IdentityRateLimits;
}

/** Bearer value of the Authorization header, or undefined. */
function bearerToken(req: Request): string | undefined {
  const header = req.get('Authorization');
  if (header === undefined) return undefined;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match?.[1]) throw new AppError('UNAUTHENTICATED', 'Malformed Authorization header.');
  return match[1];
}

export function createGuards(deps: GuardDeps): Guards {
  const { prisma, clock, sessions, revalidator } = deps;
  const sessionCookie = cookieName(SESSION_COOKIE, deps.cookies);

  // Counts only requests that ended in 401, so brute-forcing tokens is throttled per IP.
  const invalidCredentialLimit = createRateLimit({
    ...deps.limits.invalidCredential,
    countOnly: (_req, res) => res.statusCode === 401,
  });
  const userLimit = createRateLimit({
    ...deps.limits.user,
    key: (req) => (req.auth ? `user:${req.auth.userId}` : clientIpKey(req)),
  });

  /** Last use of the token that authenticated a request (for the throttled usage update). */
  const tokenLastUsed = new WeakMap<Request, Date | null>();

  async function authenticate(req: Request): Promise<AuthContext> {
    const bearer = bearerToken(req);
    if (bearer !== undefined) {
      // Only personal API tokens are accepted as Bearer credentials.
      if (!isApiTokenSecret(bearer)) throw new AppError('UNAUTHENTICATED');
      const result = await authenticateApiToken(prisma, bearer, clock.now());
      if (!result.ok) throw new AppError(result.code);
      tokenLastUsed.set(req, result.token.lastUsedAt);
      return {
        userId: result.token.userId,
        role: 'USER',
        credential: {
          type: 'API_TOKEN',
          apiTokenId: result.token.id,
          tokenName: result.token.name,
          permissions: result.token.permissions,
        },
      };
    }
    const session = await sessions.resolve(readCookie(req, sessionCookie));
    if (!session) throw new AppError('UNAUTHENTICATED');
    if ((await revalidator.revalidate(session)) === 'revoked') {
      throw new AppError('UNAUTHENTICATED');
    }
    await sessions.touch(session, req.ip);
    return {
      userId: session.userId,
      role: session.user.role,
      credential: {
        type: 'SESSION',
        sessionId: session.id,
        reauthenticatedAt: session.reauthenticatedAt,
        csrfToken: sessions.csrfToken(session),
      },
    };
  }

  const authenticateStep: RequestHandler = async (req, _res, next) => {
    req.auth = await authenticate(req);
    next();
  };

  function accessStep(options: RequireAuthOptions): RequestHandler {
    return async (req: Request, _res: Response, next: NextFunction) => {
      const auth = req.auth;
      if (!auth) throw new AppError('UNAUTHENTICATED');
      if (auth.credential.type === 'API_TOKEN') {
        if (options.permissions === undefined) throw new AppError('API_TOKEN_NOT_ALLOWED');
        const missing = missingPermissions(auth.credential.permissions, options.permissions);
        if (missing.length > 0) {
          throw new AppError('API_TOKEN_PERMISSION_DENIED', undefined, [
            {
              path: [],
              code: 'API_TOKEN_PERMISSION_DENIED',
              message: `Requires ${missing.join(', ')}.`,
              params: { required: missing },
            },
          ]);
        }
        await recordTokenUse(
          prisma,
          { id: auth.credential.apiTokenId, lastUsedAt: tokenLastUsed.get(req) ?? null },
          clock.now(),
          req.ip,
        );
      } else if (!SAFE_METHODS.has(req.method)) {
        const sent = req.get(CSRF_HEADER);
        if (!sent || !safeEqual(sent, auth.credential.csrfToken)) {
          throw new AppError('CSRF_INVALID');
        }
      }
      next();
    };
  }

  return {
    requireAuth(options = {}) {
      return [invalidCredentialLimit, authenticateStep, userLimit, accessStep(options)];
    },
    requireRole(role) {
      return (req, _res, next) => {
        const auth = req.auth;
        if (!auth) throw new AppError('UNAUTHENTICATED');
        if (auth.credential.type === 'API_TOKEN') throw new AppError('API_TOKEN_NOT_ALLOWED');
        if (auth.role !== role) throw new AppError('FORBIDDEN');
        next();
      };
    },
    requireRecentAuth() {
      return (req, _res, next) => {
        const auth = req.auth;
        if (!auth) throw new AppError('UNAUTHENTICATED');
        if (auth.credential.type !== 'SESSION') throw new AppError('API_TOKEN_NOT_ALLOWED');
        const at = auth.credential.reauthenticatedAt;
        if (!at || clock.now().getTime() - at.getTime() > RECENT_AUTH_WINDOW_MS) {
          throw new AppError('REAUTH_REQUIRED');
        }
        next();
      };
    },
  };
}
