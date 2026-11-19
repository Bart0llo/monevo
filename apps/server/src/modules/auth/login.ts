import { LOCALES, type LoginErrorCode } from '@monevo/contracts';
import { isTimeZone } from '@monevo/domain';
import type { Clock } from '../../infra/clock.js';
import type { Logger } from '../../infra/logger.js';
import type { IdTokenClaims, OidcClient, OidcTokens } from '../../infra/oidc.js';
import type { PrismaClient } from '../../infra/prisma.js';
import {
  findIdentity,
  identityBelongsTo,
  provisionUser,
  recordLogin,
  setUserRole,
} from '../users/index.js';
import type { OidcStatePayload } from './oidc-state.js';
import { roleFromClaims } from './roles.js';
import type { SessionService } from './sessions.js';
import { revokeSession, type SessionWithUser, updateSessionIdp } from './sessions.repo.js';

// Account resolution on callback (authentication.md#account-resolution-on-callback). Users are keyed
// by (issuer, subject) only; the email claim is informational and never links accounts.

/** Re-authentication must have happened after the reauth flow started (clock skew allowance). */
const AUTH_TIME_SKEW_MS = 5_000;
const MAX_DISPLAY_NAME = 100;
const MAX_EMAIL = 320;

export class LoginFailure extends Error {
  constructor(
    readonly code: LoginErrorCode,
    readonly reason: string,
  ) {
    super(`login failed: ${code} (${reason})`);
    this.name = 'LoginFailure';
  }
}

export interface LoginRequestInfo {
  readonly userAgent: string | undefined;
  readonly ip: string | undefined;
}

export interface LoginDeps {
  readonly prisma: PrismaClient;
  readonly oidc: OidcClient;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly sessions: SessionService;
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

export function displayNameFrom(claims: IdTokenClaims): string {
  const name = text(claims.name) ?? text(claims.preferred_username) ?? 'User';
  return [...name].slice(0, MAX_DISPLAY_NAME).join('');
}

function emailFrom(claims: IdTokenClaims): string | null {
  const email = text(claims.email);
  return email && email.length <= MAX_EMAIL ? email : null;
}

/** `pl-PL` → `pl`; unsupported → `en`. */
export function localeHint(value: string | null): string {
  const primary = value?.split(/[-_]/)[0]?.toLowerCase();
  return primary && (LOCALES as readonly string[]).includes(primary) ? primary : 'en';
}

export function timeZoneHint(value: string | null): string {
  return value && isTimeZone(value) ? value : 'UTC';
}

interface VerifiedLogin {
  readonly issuer: string;
  readonly claims: IdTokenClaims & { readonly sub: string; readonly auth_time: number };
  readonly tokens: OidcTokens;
}

function verified(issuer: string, tokens: OidcTokens): VerifiedLogin {
  const claims = tokens.claims;
  if (!claims || typeof claims.sub !== 'string' || claims.sub === '') {
    throw new LoginFailure('login_failed', 'missing_sub');
  }
  if (typeof claims.auth_time !== 'number' || !Number.isFinite(claims.auth_time)) {
    throw new LoginFailure('login_failed', 'missing_auth_time');
  }
  return { issuer, claims: { ...claims, sub: claims.sub, auth_time: claims.auth_time }, tokens };
}

export function createLoginService(deps: LoginDeps) {
  const { prisma, oidc, clock, logger, sessions } = deps;

  /** Signs in (provisioning on first use) and returns the new session cookie token. */
  async function login(
    issuer: string,
    tokens: OidcTokens,
    state: OidcStatePayload,
    previous: SessionWithUser | undefined,
    request: LoginRequestInfo,
  ): Promise<{ token: string; userId: string }> {
    const { claims } = verified(issuer, tokens);
    const now = clock.now();
    const role = roleFromClaims(claims, oidc.config.adminGroup, logger);
    let identity = await findIdentity(prisma, issuer, claims.sub);
    if (!identity) {
      const provisioned = await provisionUser(prisma, {
        issuer,
        subject: claims.sub,
        displayName: displayNameFrom(claims),
        email: emailFrom(claims),
        locale: localeHint(state.locale),
        timeZone: timeZoneHint(state.timeZone),
        role,
        now,
      });
      identity = provisioned.identity;
      if (provisioned.created) {
        logger.info(
          { event: 'auth.user.provisioned', userId: identity.userId, role: identity.user.role },
          'user provisioned at first sign-in',
        );
      }
    }
    if (identity.user.status !== 'ACTIVE') {
      throw new LoginFailure('account_deactivated', 'deactivated');
    }
    await recordLogin(prisma, {
      userId: identity.userId,
      identityId: identity.id,
      email: emailFrom(claims),
      role,
      now,
    });
    if (previous) {
      await revokeSession(prisma, previous.userId, previous.id, 'REPLACED', now);
    }
    const created = await sessions.create({
      userId: identity.userId,
      userAgent: request.userAgent,
      ip: request.ip,
      reauthenticatedAt: new Date(claims.auth_time * 1000),
      idTokenHint: tokens.idToken ?? null,
      refreshToken: tokens.refreshToken ?? null,
    });
    logger.info(
      { event: 'auth.login.succeeded', userId: identity.userId, sessionId: created.sessionId },
      'signed in',
    );
    return { token: created.token, userId: identity.userId };
  }

  /** Marks the current session as recently authenticated (same IdP account only). */
  async function reauthenticate(
    issuer: string,
    tokens: OidcTokens,
    state: OidcStatePayload,
    current: SessionWithUser | undefined,
  ): Promise<void> {
    const { claims } = verified(issuer, tokens);
    if (!current || current.id !== state.sessionId) {
      throw new LoginFailure('login_failed', 'session_changed');
    }
    if (!(await identityBelongsTo(prisma, current.userId, issuer, claims.sub))) {
      throw new LoginFailure('reauth_mismatch', 'different_account');
    }
    if (claims.auth_time * 1000 < state.startedAt - AUTH_TIME_SKEW_MS) {
      throw new LoginFailure('login_failed', 'stale_auth_time');
    }
    const now = clock.now();
    await updateSessionIdp(prisma, current.id, {
      reauthenticatedAt: now,
      idpCheckedAt: now,
      ...(tokens.idToken ? { idTokenHint: tokens.idToken } : {}),
      // prompt=login ends the old IdP grant, so the new refresh token replaces it.
      idpRefreshToken: tokens.refreshToken ? sessions.sealRefreshToken(tokens.refreshToken) : null,
    });
    const role = roleFromClaims(claims, oidc.config.adminGroup, logger);
    if (role) await setUserRole(prisma, current.userId, role);
    logger.info(
      { event: 'auth.reauth.succeeded', userId: current.userId, sessionId: current.id },
      're-authenticated',
    );
  }

  return { login, reauthenticate };
}

export type LoginService = ReturnType<typeof createLoginService>;
