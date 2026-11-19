import type { Db } from '../../infra/prisma.js';

// Personal API tokens (data-model.md#api_tokens). Every query is scoped by `userId`, except the
// lookup by hash that authenticates a request.

export type ApiTokenRevokedReason = 'USER_REVOKED' | 'DEACTIVATED' | 'RESTORE';

const TOKEN_SELECT = {
  id: true,
  userId: true,
  name: true,
  displayPrefix: true,
  permissions: true,
  expiresAt: true,
  lastUsedAt: true,
  lastUsedIp: true,
  revokedAt: true,
  createdAt: true,
} as const;

export interface ApiTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly displayPrefix: string;
  readonly permissions: string[];
  readonly expiresAt: Date | null;
  readonly lastUsedAt: Date | null;
  readonly lastUsedIp: string | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
}

export interface ApiTokenWithUser extends ApiTokenRecord {
  readonly user: { readonly status: 'ACTIVE' | 'DEACTIVATED' };
}

export async function findTokenByHash(db: Db, tokenHash: Buffer): Promise<ApiTokenWithUser | null> {
  return db.apiToken.findUnique({
    where: { tokenHash: new Uint8Array(tokenHash) },
    select: { ...TOKEN_SELECT, user: { select: { status: true } } },
  });
}

export async function touchToken(db: Db, id: string, now: Date, ip: string | null): Promise<void> {
  await db.apiToken.updateMany({ where: { id }, data: { lastUsedAt: now, lastUsedIp: ip } });
}

/** Active and recently ended tokens (`retainedSince`: revoked or expired after it). */
export async function listTokens(
  db: Db,
  userId: string,
  retainedSince: Date,
): Promise<ApiTokenRecord[]> {
  return db.apiToken.findMany({
    where: {
      userId,
      AND: [
        { OR: [{ revokedAt: null }, { revokedAt: { gt: retainedSince } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: retainedSince } }] },
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: TOKEN_SELECT,
  });
}

export async function countActiveTokens(db: Db, userId: string, now: Date): Promise<number> {
  return db.apiToken.count({
    where: { userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
  });
}

export interface NewApiToken {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly tokenHash: Buffer;
  readonly displayPrefix: string;
  readonly permissions: readonly string[];
  readonly expiresAt: Date | null;
  readonly now: Date;
}

export async function insertToken(db: Db, token: NewApiToken): Promise<ApiTokenRecord> {
  return db.apiToken.create({
    data: {
      id: token.id,
      userId: token.userId,
      name: token.name,
      tokenHash: new Uint8Array(token.tokenHash),
      displayPrefix: token.displayPrefix,
      permissions: [...token.permissions],
      expiresAt: token.expiresAt,
      createdAt: token.now,
    },
    select: TOKEN_SELECT,
  });
}

export async function findToken(
  db: Db,
  userId: string,
  id: string,
): Promise<ApiTokenRecord | null> {
  return db.apiToken.findFirst({ where: { id, userId }, select: TOKEN_SELECT });
}

export async function renameToken(
  db: Db,
  userId: string,
  id: string,
  name: string,
): Promise<ApiTokenRecord | null> {
  const result = await db.apiToken.updateMany({ where: { id, userId }, data: { name } });
  return result.count === 0 ? null : findToken(db, userId, id);
}

/** Revokes one token; true when the token exists (already revoked counts: idempotent). */
export async function revokeToken(db: Db, userId: string, id: string, now: Date): Promise<boolean> {
  const existing = await db.apiToken.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) return false;
  await db.apiToken.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: now, revokedReason: 'USER_REVOKED' },
  });
  return true;
}

export async function revokeAllTokens(
  db: Db,
  userId: string,
  reason: ApiTokenRevokedReason,
  now: Date,
): Promise<number> {
  const result = await db.apiToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason },
  });
  return result.count;
}

/** `sessions.purge`: tokens revoked or expired before `before`. */
export async function purgeTokens(db: Db, before: Date): Promise<number> {
  const result = await db.apiToken.deleteMany({
    where: { OR: [{ revokedAt: { lt: before } }, { expiresAt: { lt: before } }] },
  });
  return result.count;
}
