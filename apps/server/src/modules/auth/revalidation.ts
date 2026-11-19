import type { Clock } from '../../infra/clock.js';
import type { Logger } from '../../infra/logger.js';
import { classifyOidcError, type OidcClient } from '../../infra/oidc.js';
import type { PrismaClient } from '../../infra/prisma.js';
import { setUserRole } from '../users/index.js';
import { roleFromClaims } from './roles.js';
import type { SessionService } from './sessions.js';
import {
  findSessionById,
  revokeSession,
  type SessionRecord,
  updateSessionIdp,
} from './sessions.repo.js';

// IdP revalidation (authentication.md#3-idp-revalidation): every 15 minutes a session request
// refreshes the IdP grant. Account Center rotates refresh tokens and revokes the whole family on
// reuse, so refreshes for one session are serialized. Network failures fail open.

export const REVALIDATE_AFTER_MS = 15 * 60 * 1000;
export const RETRY_AFTER_FAILURE_MS = 60 * 1000;

export type RevalidationResult = 'valid' | 'revoked';

export interface Revalidator {
  revalidate(session: SessionRecord): Promise<RevalidationResult>;
}

export function createRevalidator(deps: {
  prisma: PrismaClient;
  oidc: OidcClient;
  clock: Clock;
  logger: Logger;
  sessions: SessionService;
}): Revalidator {
  const { prisma, oidc, clock, logger, sessions } = deps;
  const inFlight = new Map<string, Promise<RevalidationResult>>();
  const backoffUntil = new Map<string, number>();

  const due = (session: Pick<SessionRecord, 'idpRefreshToken' | 'idpCheckedAt'>, now: number) =>
    session.idpRefreshToken !== null &&
    (session.idpCheckedAt === null || now - session.idpCheckedAt.getTime() >= REVALIDATE_AFTER_MS);

  async function revoke(session: { id: string; userId: string }, reason: string) {
    await revokeSession(prisma, session.userId, session.id, 'IDP_REVOKED', clock.now());
    logger.info(
      { event: 'auth.idp.revoked', userId: session.userId, sessionId: session.id, reason },
      'session revoked: the identity provider no longer accepts the grant',
    );
  }

  async function run(sessionId: string): Promise<RevalidationResult> {
    // Re-read inside the mutex: another request may have refreshed already.
    const session = await findSessionById(prisma, sessionId);
    const now = clock.now();
    if (!session || session.revokedAt !== null) return 'revoked';
    if (!due(session, now.getTime()) || !session.idpRefreshToken) return 'valid';
    const refreshToken = sessions.openRefreshToken(session.idpRefreshToken);
    if (!refreshToken) {
      await revoke(session, 'undecryptable_refresh_token');
      return 'revoked';
    }
    try {
      const tokens = await oidc.refresh(refreshToken);
      const checkedAt = clock.now();
      const stored = await updateSessionIdp(prisma, session.id, {
        idpCheckedAt: checkedAt,
        idpRefreshToken: sessions.sealRefreshToken(tokens.refreshToken ?? refreshToken),
        ...(tokens.idToken ? { idTokenHint: tokens.idToken } : {}),
      });
      if (!stored) return 'revoked';
      if (tokens.claims) {
        const role = roleFromClaims(tokens.claims, oidc.config.adminGroup, logger);
        if (role) await setUserRole(prisma, session.userId, role);
      }
      backoffUntil.delete(session.id);
      return 'valid';
    } catch (error) {
      const failure = classifyOidcError(error);
      if (failure.kind === 'rejected') {
        await revoke(session, failure.oauthError ?? 'rejected');
        return 'revoked';
      }
      backoffUntil.set(session.id, clock.now().getTime() + RETRY_AFTER_FAILURE_MS);
      logger.warn(
        { event: 'auth.idp.unavailable', sessionId: session.id, kind: failure.kind, err: failure },
        'identity provider unavailable during revalidation; the session stays valid',
      );
      return 'valid';
    }
  }

  return {
    async revalidate(session) {
      const now = clock.now().getTime();
      if (!due(session, now)) return 'valid';
      const blockedUntil = backoffUntil.get(session.id);
      if (blockedUntil !== undefined) {
        if (blockedUntil > now) return 'valid';
        backoffUntil.delete(session.id);
      }
      let pending = inFlight.get(session.id);
      if (!pending) {
        pending = run(session.id).finally(() => inFlight.delete(session.id));
        inFlight.set(session.id, pending);
      }
      return pending;
    },
  };
}
