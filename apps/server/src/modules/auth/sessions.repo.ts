import type { UserRole, UserStatus } from '@monevo/contracts';
import type { Db } from '../../infra/prisma.js';

// Server-side sessions (data-model.md#sessions, authentication.md#4-sessions). Looked up by the
// SHA-256 of the cookie token; everything else is scoped by `userId`.

export type SessionRevokedReason =
  'LOGOUT' | 'USER_REVOKED' | 'DEACTIVATED' | 'RESTORE' | 'EVICTED' | 'IDP_REVOKED' | 'REPLACED';

const SESSION_SELECT = {
  id: true,
  userId: true,
  lastSeenAt: true,
  idleExpiresAt: true,
  absoluteExpiresAt: true,
  userAgent: true,
  deviceLabel: true,
  ipLast: true,
  csrfSecret: true,
  reauthenticatedAt: true,
  idTokenHint: true,
  idpRefreshToken: true,
  idpCheckedAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

export interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly lastSeenAt: Date;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly userAgent: string | null;
  readonly deviceLabel: string | null;
  readonly ipLast: string | null;
  readonly csrfSecret: Uint8Array;
  readonly reauthenticatedAt: Date | null;
  readonly idTokenHint: string | null;
  readonly idpRefreshToken: Uint8Array | null;
  readonly idpCheckedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
}

export interface SessionWithUser extends SessionRecord {
  readonly user: { readonly role: UserRole; readonly status: UserStatus };
}

const activeWhere = (now: Date) => ({
  revokedAt: null,
  idleExpiresAt: { gt: now },
  absoluteExpiresAt: { gt: now },
});

export async function findSessionByHash(
  db: Db,
  tokenHash: Buffer,
): Promise<SessionWithUser | null> {
  return db.session.findUnique({
    where: { tokenHash: new Uint8Array(tokenHash) },
    select: { ...SESSION_SELECT, user: { select: { role: true, status: true } } },
  });
}

export async function findSessionById(db: Db, id: string): Promise<SessionWithUser | null> {
  return db.session.findUnique({
    where: { id },
    select: { ...SESSION_SELECT, user: { select: { role: true, status: true } } },
  });
}

export interface NewSession {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: Buffer;
  readonly csrfSecret: Buffer;
  readonly now: Date;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly userAgent: string | null;
  readonly deviceLabel: string | null;
  readonly ip: string | null;
  readonly reauthenticatedAt: Date | null;
  readonly idTokenHint: string | null;
  readonly idpRefreshToken: Buffer | null;
}

export async function insertSession(db: Db, session: NewSession): Promise<void> {
  await db.session.create({
    data: {
      id: session.id,
      userId: session.userId,
      tokenHash: new Uint8Array(session.tokenHash),
      csrfSecret: new Uint8Array(session.csrfSecret),
      lastSeenAt: session.now,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      userAgent: session.userAgent,
      deviceLabel: session.deviceLabel,
      ipLast: session.ip,
      reauthenticatedAt: session.reauthenticatedAt,
      idTokenHint: session.idTokenHint,
      idpRefreshToken: session.idpRefreshToken ? new Uint8Array(session.idpRefreshToken) : null,
      idpCheckedAt: session.now,
      createdAt: session.now,
    },
  });
}

/** Active sessions of the user, most recently used first. */
export async function listActiveSessions(
  db: Db,
  userId: string,
  now: Date,
): Promise<SessionRecord[]> {
  return db.session.findMany({
    where: { userId, ...activeWhere(now) },
    orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
    select: SESSION_SELECT,
  });
}

export async function touchSession(
  db: Db,
  id: string,
  update: { now: Date; idleExpiresAt: Date; ip: string | null },
): Promise<void> {
  await db.session.updateMany({
    where: { id, revokedAt: null },
    data: { lastSeenAt: update.now, idleExpiresAt: update.idleExpiresAt, ipLast: update.ip },
  });
}

export interface IdpTokenUpdate {
  readonly idTokenHint?: string | null;
  readonly idpRefreshToken?: Buffer | null;
  readonly idpCheckedAt: Date;
  readonly reauthenticatedAt?: Date;
}

export async function updateSessionIdp(
  db: Db,
  id: string,
  update: IdpTokenUpdate,
): Promise<boolean> {
  const result = await db.session.updateMany({
    where: { id, revokedAt: null },
    data: {
      idpCheckedAt: update.idpCheckedAt,
      ...(update.idTokenHint === undefined ? {} : { idTokenHint: update.idTokenHint }),
      ...(update.idpRefreshToken === undefined
        ? {}
        : {
            idpRefreshToken: update.idpRefreshToken ? new Uint8Array(update.idpRefreshToken) : null,
          }),
      ...(update.reauthenticatedAt === undefined
        ? {}
        : { reauthenticatedAt: update.reauthenticatedAt }),
    },
  });
  return result.count > 0;
}

/** Revokes one of the user's active sessions; false when none matched. */
export async function revokeSession(
  db: Db,
  userId: string,
  id: string,
  reason: SessionRevokedReason,
  now: Date,
): Promise<boolean> {
  const result = await db.session.updateMany({
    where: { id, userId, ...activeWhere(now) },
    data: { revokedAt: now, revokedReason: reason, idpRefreshToken: null },
  });
  return result.count > 0;
}

export async function revokeOtherSessions(
  db: Db,
  userId: string,
  keepId: string,
  now: Date,
): Promise<number> {
  const result = await db.session.updateMany({
    where: { userId, id: { not: keepId }, ...activeWhere(now) },
    data: { revokedAt: now, revokedReason: 'USER_REVOKED', idpRefreshToken: null },
  });
  return result.count;
}

export async function revokeAllSessions(
  db: Db,
  userId: string,
  reason: SessionRevokedReason,
  now: Date,
): Promise<number> {
  const result = await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason, idpRefreshToken: null },
  });
  return result.count;
}

/** Revokes the oldest active sessions beyond `max` (`EVICTED`). */
export async function evictSessions(
  db: Db,
  userId: string,
  max: number,
  now: Date,
): Promise<number> {
  const surplus = await db.session.findMany({
    where: { userId, ...activeWhere(now) },
    orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
    skip: max,
    select: { id: true },
  });
  if (surplus.length === 0) return 0;
  const result = await db.session.updateMany({
    where: { userId, id: { in: surplus.map((row) => row.id) } },
    data: { revokedAt: now, revokedReason: 'EVICTED', idpRefreshToken: null },
  });
  return result.count;
}

/** `sessions.purge`: sessions that ended (expired or revoked) before `before`. */
export async function purgeSessions(db: Db, before: Date): Promise<number> {
  const result = await db.session.deleteMany({
    where: {
      OR: [
        { revokedAt: { lt: before } },
        { idleExpiresAt: { lt: before } },
        { absoluteExpiresAt: { lt: before } },
      ],
    },
  });
  return result.count;
}
