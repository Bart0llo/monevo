import express, { type Request, type Response, type Router } from 'express';
import * as client from 'openid-client';
import {
  type AuthConfigResponse,
  type AuthSessionResponse,
  type LoginErrorCode,
  type LogoutResponse,
  OidcStartQuerySchema,
  RECENT_AUTH_WINDOW_MS,
} from '@monevo/contracts';
import {
  clearCookie,
  cookieName,
  type CookieSettings,
  OIDC_STATE_COOKIE,
  readCookie,
  SESSION_COOKIE,
  setCookie,
} from '../../http/cookies.js';
import { AppError } from '../../http/errors.js';
import { type Guards, sessionOf } from '../../http/guards.js';
import { createRateLimit, type IdentityRateLimits } from '../../http/rate-limit.js';
import type { Clock } from '../../infra/clock.js';
import type { Logger } from '../../infra/logger.js';
import { classifyOidcError, type OidcClient } from '../../infra/oidc.js';
import type { PrismaClient } from '../../infra/prisma.js';
import { findSettings, findUser } from '../users/index.js';
import { type LoginService, LoginFailure } from './login.js';
import { OIDC_STATE_TTL_MS, type OidcStateSealer, safeReturnTo } from './oidc-state.js';
import type { SessionService } from './sessions.js';
import { findSessionById, revokeSession } from './sessions.repo.js';

// `/auth/*` (authentication.md#endpoints). The OIDC endpoints are browser navigations: failures
// redirect to `/login?error=<code>` instead of returning problem+json.

export interface AuthRouteDeps {
  readonly prisma: PrismaClient;
  readonly oidc: OidcClient;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly sessions: SessionService;
  readonly login: LoginService;
  readonly sealer: OidcStateSealer;
  readonly cookies: CookieSettings;
  readonly limits: IdentityRateLimits;
}

export function authRouter(deps: AuthRouteDeps, guards: Guards): Router {
  const router = express.Router();
  const { prisma, oidc, clock, logger, sessions, sealer } = deps;
  const sessionCookie = cookieName(SESSION_COOKIE, deps.cookies);
  const stateCookie = cookieName(OIDC_STATE_COOKIE, deps.cookies);
  const oidcLimit = createRateLimit(deps.limits.oidc);

  const noStore = (res: Response) => res.setHeader('Cache-Control', 'no-store');

  function failLogin(res: Response, code: LoginErrorCode) {
    noStore(res);
    res.redirect(302, `/login?error=${code}`);
  }

  router.get('/auth/config', (_req, res) => {
    const body: AuthConfigResponse = { providerName: oidc.config.displayName };
    res.json(body);
  });

  router.get('/auth/oidc/start', oidcLimit, async (req: Request, res: Response) => {
    const query = OidcStartQuerySchema.safeParse(req.query);
    const input = query.success ? query.data : { intent: 'login' as const };
    let sessionId: string | null = null;
    if (input.intent === 'reauth') {
      const session = await sessions.resolve(readCookie(req, sessionCookie));
      if (!session) throw new AppError('UNAUTHENTICATED');
      sessionId = session.id;
    }
    const state = client.randomState();
    const nonce = client.randomNonce();
    const verifier = client.randomPKCECodeVerifier();
    let url: URL;
    try {
      url = await oidc.authorizationUrl({
        state,
        nonce,
        codeChallenge: await client.calculatePKCECodeChallenge(verifier),
        ...(input.intent === 'reauth' ? { prompt: 'login' as const } : {}),
      });
    } catch (error) {
      logger.warn(
        { event: 'auth.idp.unavailable', err: classifyOidcError(error) },
        'identity provider discovery failed',
      );
      failLogin(res, 'idp_unavailable');
      return;
    }
    const sealed = sealer.seal({
      state,
      nonce,
      verifier,
      returnTo: safeReturnTo(input.returnTo),
      intent: input.intent,
      locale: input.locale ?? null,
      timeZone: input.timeZone ?? null,
      startedAt: clock.now().getTime(),
      sessionId,
    });
    setCookie(res, stateCookie, sealed, OIDC_STATE_TTL_MS / 1000, deps.cookies);
    noStore(res);
    res.redirect(302, url.href);
  });

  router.get('/auth/oidc/callback', oidcLimit, async (req: Request, res: Response) => {
    const state = sealer.open(readCookie(req, stateCookie), clock.now());
    clearCookie(res, stateCookie, deps.cookies);
    if (!state) {
      logger.info({ event: 'auth.login.failed', reason: 'missing_state' }, 'sign-in failed');
      failLogin(res, 'login_failed');
      return;
    }
    const failedEvent = state.intent === 'reauth' ? 'auth.reauth.failed' : 'auth.login.failed';
    try {
      const callbackUrl = new URL(oidc.config.redirectUri);
      callbackUrl.search = new URL(req.originalUrl, 'http://callback.invalid').search;
      const tokens = await oidc.exchangeCode(callbackUrl, {
        pkceCodeVerifier: state.verifier,
        expectedState: state.state,
        expectedNonce: state.nonce,
      });
      const issuer = await oidc.issuer();
      const current = await sessions.resolve(readCookie(req, sessionCookie));
      if (state.intent === 'reauth') {
        await deps.login.reauthenticate(issuer, tokens, state, current);
      } else {
        const result = await deps.login.login(issuer, tokens, state, current, {
          userAgent: req.get('User-Agent'),
          ip: req.ip,
        });
        setCookie(res, sessionCookie, result.token, sessions.cookieMaxAgeSeconds, deps.cookies);
      }
      noStore(res);
      res.redirect(302, state.returnTo);
    } catch (error) {
      if (error instanceof LoginFailure) {
        logger.info({ event: failedEvent, reason: error.reason }, 'sign-in failed');
        failLogin(res, error.code);
        return;
      }
      const failure = classifyOidcError(error);
      if (failure.kind === 'unavailable') {
        logger.warn(
          { event: 'auth.idp.unavailable', err: failure },
          'identity provider unavailable',
        );
        failLogin(res, 'idp_unavailable');
        return;
      }
      const code: LoginErrorCode =
        failure.kind === 'denied' && failure.oauthError === 'access_denied'
          ? 'access_denied'
          : 'login_failed';
      logger.info(
        { event: failedEvent, reason: failure.oauthError ?? failure.kind, err: failure },
        'sign-in failed',
      );
      failLogin(res, code);
    }
  });

  router.get('/auth/session', ...guards.requireAuth(), async (req, res) => {
    const session = sessionOf(req);
    const [user, settings] = await Promise.all([
      findUser(prisma, session.userId),
      findSettings(prisma, session.userId),
    ]);
    if (!user) throw new AppError('UNAUTHENTICATED');
    const until = session.reauthenticatedAt
      ? session.reauthenticatedAt.getTime() + RECENT_AUTH_WINDOW_MS
      : 0;
    const body: AuthSessionResponse = {
      user: { id: user.id, displayName: user.displayName, email: user.email, role: user.role },
      csrfToken: session.csrfToken,
      recentAuthUntil: until > clock.now().getTime() ? new Date(until).toISOString() : null,
      onboardingRequired: settings?.onboardingCompletedAt == null,
    };
    noStore(res);
    res.json(body);
  });

  router.post('/auth/logout', ...guards.requireAuth(), async (req, res) => {
    const session = sessionOf(req);
    const record = await findSessionById(prisma, session.sessionId);
    await revokeSession(prisma, session.userId, session.sessionId, 'LOGOUT', clock.now());
    logger.info(
      {
        event: 'auth.session.revoked',
        userId: session.userId,
        sessionId: session.sessionId,
        reason: 'LOGOUT',
      },
      'signed out',
    );
    clearCookie(res, sessionCookie, deps.cookies);
    let endSessionUrl: string | null = null;
    try {
      endSessionUrl = await oidc.endSessionUrl(record?.idTokenHint ?? null);
    } catch (error) {
      logger.warn(
        { event: 'auth.idp.unavailable', err: classifyOidcError(error) },
        'no end-session URL: identity provider unavailable',
      );
    }
    const body: LogoutResponse = { endSessionUrl };
    res.json(body);
  });

  return router;
}
