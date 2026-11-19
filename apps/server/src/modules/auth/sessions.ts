import { randomBytes } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import type { SessionConfig } from '../../config/env.js';
import type { Clock } from '../../infra/clock.js';
import {
  decryptString,
  deriveKey,
  encryptString,
  randomToken,
  sha256,
} from '../../infra/crypto.js';
import type { PrismaClient } from '../../infra/prisma.js';
import {
  evictSessions,
  findSessionByHash,
  insertSession,
  type SessionRecord,
  type SessionWithUser,
  touchSession,
} from './sessions.repo.js';
import { deviceLabel, MAX_USER_AGENT_LENGTH } from './user-agent.js';

// Session lifecycle (authentication.md#4-sessions): opaque 256-bit token in the cookie, SHA-256 in
// the database, sliding idle expiry capped by the absolute expiry, at most 50 active sessions.

export const MAX_ACTIVE_SESSIONS = 50;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface NewSessionInput {
  readonly userId: string;
  readonly userAgent: string | undefined;
  readonly ip: string | undefined;
  readonly reauthenticatedAt: Date | null;
  readonly idTokenHint: string | null;
  readonly refreshToken: string | null;
}

export interface SessionService {
  readonly cookieMaxAgeSeconds: number;
  create(input: NewSessionInput): Promise<{ token: string; sessionId: string }>;
  /** The active session for a cookie token, or undefined. */
  resolve(token: string | undefined): Promise<SessionWithUser | undefined>;
  /** Slides the idle expiry, at most every 5 minutes. */
  touch(session: SessionRecord, ip: string | undefined): Promise<void>;
  csrfToken(session: Pick<SessionRecord, 'csrfSecret'>): string;
  sealRefreshToken(refreshToken: string): Buffer;
  openRefreshToken(sealed: Uint8Array): string | undefined;
}

export function createSessionService(deps: {
  prisma: PrismaClient;
  clock: Clock;
  session: SessionConfig;
  encryptionKey: Buffer;
}): SessionService {
  const { prisma, clock } = deps;
  const idleMs = deps.session.idleDays * DAY_MS;
  const absoluteMs = deps.session.absoluteDays * DAY_MS;
  const refreshKey = deriveKey(deps.encryptionKey, 'idp-refresh-token');

  const idleExpiry = (now: Date, absolute: Date) =>
    new Date(Math.min(now.getTime() + idleMs, absolute.getTime()));

  const service: SessionService = {
    cookieMaxAgeSeconds: Math.floor(absoluteMs / 1000),
    async create(input) {
      const now = clock.now();
      const token = randomToken(32);
      const sessionId = uuidv7();
      const absoluteExpiresAt = new Date(now.getTime() + absoluteMs);
      const userAgent = input.userAgent?.slice(0, MAX_USER_AGENT_LENGTH) ?? null;
      await prisma.$transaction(async (tx) => {
        await insertSession(tx, {
          id: sessionId,
          userId: input.userId,
          tokenHash: sha256(token),
          csrfSecret: randomBytes(32),
          now,
          idleExpiresAt: idleExpiry(now, absoluteExpiresAt),
          absoluteExpiresAt,
          userAgent,
          deviceLabel: deviceLabel(userAgent ?? undefined),
          ip: input.ip ?? null,
          reauthenticatedAt: input.reauthenticatedAt,
          idTokenHint: input.idTokenHint,
          idpRefreshToken: input.refreshToken ? service.sealRefreshToken(input.refreshToken) : null,
        });
        await evictSessions(tx, input.userId, MAX_ACTIVE_SESSIONS, now);
      });
      return { token, sessionId };
    },
    async resolve(token) {
      if (!token || token.length > 100) return undefined;
      const session = await findSessionByHash(prisma, sha256(token));
      if (!session) return undefined;
      const now = clock.now().getTime();
      if (
        session.revokedAt !== null ||
        session.idleExpiresAt.getTime() <= now ||
        session.absoluteExpiresAt.getTime() <= now ||
        session.user.status !== 'ACTIVE'
      ) {
        return undefined;
      }
      return session;
    },
    async touch(session, ip) {
      const now = clock.now();
      const ipChanged = (ip ?? null) !== session.ipLast;
      if (!ipChanged && now.getTime() - session.lastSeenAt.getTime() < TOUCH_INTERVAL_MS) return;
      await touchSession(prisma, session.id, {
        now,
        idleExpiresAt: idleExpiry(now, session.absoluteExpiresAt),
        ip: ip ?? null,
      });
    },
    csrfToken(session) {
      return Buffer.from(session.csrfSecret).toString('base64url');
    },
    sealRefreshToken(refreshToken) {
      return encryptString(refreshKey, refreshToken);
    },
    openRefreshToken(sealed) {
      return decryptString(refreshKey, sealed);
    },
  };
  return service;
}
