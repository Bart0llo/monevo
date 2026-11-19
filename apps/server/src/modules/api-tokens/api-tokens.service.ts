import { uuidv7 } from 'uuidv7';
import {
  API_TOKEN_PREFIX,
  type ApiToken,
  type ApiTokenCreate,
  type ApiTokenCreatedResponse,
  type ApiTokenPermission,
  MAX_ACTIVE_API_TOKENS,
  unmetPermissionRequirements,
} from '@monevo/contracts';
import { AppError } from '../../http/errors.js';
import { randomToken, sha256 } from '../../infra/crypto.js';
import type { PrismaClient } from '../../infra/prisma.js';
import {
  type ApiTokenRecord,
  countActiveTokens,
  findTokenByHash,
  insertToken,
  touchToken,
} from './api-tokens.repo.js';

// Token format, authentication and creation (api-tokens.md#2-token-format-and-storage, #3).

const TOKEN_PATTERN = /^mnv_pat_[A-Za-z0-9_-]{43}$/;
const DISPLAY_PREFIX_LENGTH = API_TOKEN_PREFIX.length + 6;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
export const TOKEN_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export function isApiTokenSecret(value: string): boolean {
  return value.startsWith(API_TOKEN_PREFIX);
}

export type ApiTokenAuthentication =
  | { readonly ok: true; readonly token: ApiTokenRecord }
  | {
      readonly ok: false;
      readonly code: 'UNAUTHENTICATED' | 'API_TOKEN_REVOKED' | 'API_TOKEN_EXPIRED';
    };

export async function authenticateApiToken(
  prisma: PrismaClient,
  secret: string,
  now: Date,
): Promise<ApiTokenAuthentication> {
  if (!TOKEN_PATTERN.test(secret)) return { ok: false, code: 'UNAUTHENTICATED' };
  const token = await findTokenByHash(prisma, sha256(secret));
  if (!token) return { ok: false, code: 'UNAUTHENTICATED' };
  if (token.revokedAt !== null) return { ok: false, code: 'API_TOKEN_REVOKED' };
  if (token.expiresAt !== null && token.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, code: 'API_TOKEN_EXPIRED' };
  }
  if (token.user.status !== 'ACTIVE') return { ok: false, code: 'UNAUTHENTICATED' };
  return { ok: true, token };
}

/** Records use at most every 5 minutes. */
export async function recordTokenUse(
  prisma: PrismaClient,
  token: Pick<ApiTokenRecord, 'id' | 'lastUsedAt'>,
  now: Date,
  ip: string | undefined,
): Promise<void> {
  if (token.lastUsedAt && now.getTime() - token.lastUsedAt.getTime() < TOUCH_INTERVAL_MS) return;
  await touchToken(prisma, token.id, now, ip ?? null);
}

export function tokenStatus(token: ApiTokenRecord, now: Date): ApiToken['status'] {
  if (token.revokedAt !== null) return 'REVOKED';
  if (token.expiresAt !== null && token.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  return 'ACTIVE';
}

export function toApiTokenDto(token: ApiTokenRecord, now: Date, showIp: boolean): ApiToken {
  return {
    id: token.id,
    name: token.name,
    displayPrefix: token.displayPrefix,
    permissions: token.permissions as ApiTokenPermission[],
    status: tokenStatus(token, now),
    createdAt: token.createdAt.toISOString(),
    expiresAt: token.expiresAt?.toISOString() ?? null,
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    lastUsedIp: showIp ? token.lastUsedIp : null,
    revokedAt: token.revokedAt?.toISOString() ?? null,
  };
}

export async function createApiToken(
  prisma: PrismaClient,
  userId: string,
  input: ApiTokenCreate,
  now: Date,
  showIp: boolean,
): Promise<ApiTokenCreatedResponse> {
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    throw new AppError('VALIDATION_FAILED', 'One or more fields are invalid.', [
      { path: ['expiresAt'], code: 'INVALID_VALUE', message: 'Must be in the future.' },
    ]);
  }
  const unmet = unmetPermissionRequirements(input.permissions);
  if (unmet.length > 0) {
    throw new AppError(
      'VALIDATION_FAILED',
      'One or more fields are invalid.',
      unmet.map(({ permission, requires }) => ({
        path: ['permissions'],
        code: 'INVALID_VALUE',
        message: `${permission} also requires ${requires}.`,
        params: { permission, requires },
      })),
    );
  }
  const secret = `${API_TOKEN_PREFIX}${randomToken(32)}`;
  const token = await prisma.$transaction(async (tx) => {
    // Serializes concurrent creations for one user so the limit holds.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('monevo:api-tokens'), hashtext(${userId}))`;
    if ((await countActiveTokens(tx, userId, now)) >= MAX_ACTIVE_API_TOKENS) {
      throw new AppError('API_TOKEN_LIMIT_REACHED');
    }
    return insertToken(tx, {
      id: uuidv7(),
      userId,
      name: input.name,
      tokenHash: sha256(secret),
      displayPrefix: secret.slice(0, DISPLAY_PREFIX_LENGTH),
      permissions: input.permissions,
      expiresAt,
      now,
    });
  });
  return { token: toApiTokenDto(token, now, showIp), secret };
}
