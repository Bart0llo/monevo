import { uuidv7 } from 'uuidv7';
import type { Theme, UserRole, UserStatus, WeekStart } from '@monevo/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db, PrismaClient } from '../../infra/prisma.js';

// Users, identities and settings (data-model.md#users, #user_identities, #user_settings). The
// user's own rows are always reached by the authenticated `userId`; admin queries are restricted to
// operational columns (administration.md#1-boundaries).

const DEFAULT_BASE_CURRENCY = 'EUR';
const DEFAULT_WEEK_START = 'MONDAY';

const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

export interface UserRecord {
  readonly id: string;
  readonly email: string | null;
  readonly displayName: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly lastLoginAt: Date | null;
  readonly createdAt: Date;
}

export interface SettingsRecord {
  readonly locale: string;
  readonly timeZone: string;
  readonly baseCurrency: string;
  readonly weekStart: WeekStart;
  readonly dateFormat: string;
  readonly theme: Theme;
  readonly onboardingCompletedAt: Date | null;
  readonly version: number;
  readonly updatedAt: Date;
}

export interface IdentityRecord {
  readonly id: string;
  readonly userId: string;
  readonly user: UserRecord;
}

/** Serializes provisioning and last-admin checks across connections (transaction-scoped). */
async function lockUsers(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('monevo:users'))`;
}

export async function findIdentity(
  db: Db,
  issuer: string,
  subject: string,
): Promise<IdentityRecord | null> {
  return db.userIdentity.findUnique({
    where: { issuer_subject: { issuer, subject } },
    select: { id: true, userId: true, user: { select: USER_SELECT } },
  });
}

export async function findUser(db: Db, userId: string): Promise<UserRecord | null> {
  return db.user.findUnique({ where: { id: userId }, select: USER_SELECT });
}

export interface ProvisionInput {
  readonly issuer: string;
  readonly subject: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly locale: string;
  readonly timeZone: string;
  /** Role from the admin group, or undefined → the first provisioned user becomes ADMIN. */
  readonly role: UserRole | undefined;
  readonly now: Date;
}

/**
 * Creates user, identity and settings in one transaction (authentication.md#account-resolution-on-callback).
 * A concurrent first sign-in of the same identity returns the row the other request created.
 */
export async function provisionUser(
  prisma: PrismaClient,
  input: ProvisionInput,
): Promise<{ identity: IdentityRecord; created: boolean }> {
  return prisma.$transaction(async (tx) => {
    await lockUsers(tx);
    const existing = await findIdentity(tx, input.issuer, input.subject);
    if (existing) return { identity: existing, created: false };
    const role: UserRole = input.role ?? ((await tx.user.count()) === 0 ? 'ADMIN' : 'USER');
    const userId = uuidv7();
    const user = await tx.user.create({
      data: {
        id: userId,
        email: input.email,
        displayName: input.displayName,
        role,
        lastLoginAt: input.now,
      },
      select: USER_SELECT,
    });
    const identityId = uuidv7();
    await tx.userIdentity.create({
      data: {
        id: identityId,
        userId,
        issuer: input.issuer,
        subject: input.subject,
        lastLoginAt: input.now,
      },
    });
    await tx.userSetting.create({
      data: {
        userId,
        locale: input.locale,
        timeZone: input.timeZone,
        baseCurrency: DEFAULT_BASE_CURRENCY,
        weekStart: DEFAULT_WEEK_START,
      },
    });
    return { identity: { id: identityId, userId, user }, created: true };
  });
}

export interface LoginUpdate {
  readonly userId: string;
  readonly identityId: string;
  readonly email: string | null;
  readonly role: UserRole | undefined;
  readonly now: Date;
}

export async function recordLogin(db: Db, update: LoginUpdate): Promise<UserRecord> {
  await db.userIdentity.update({
    where: { id_userId: { id: update.identityId, userId: update.userId } },
    data: { lastLoginAt: update.now },
  });
  return db.user.update({
    where: { id: update.userId },
    data: {
      email: update.email,
      lastLoginAt: update.now,
      ...(update.role === undefined ? {} : { role: update.role }),
    },
    select: USER_SELECT,
  });
}

/** Whether the identity (issuer, subject) belongs to `userId`. */
export async function identityBelongsTo(
  db: Db,
  userId: string,
  issuer: string,
  subject: string,
): Promise<boolean> {
  const identity = await db.userIdentity.findUnique({
    where: { issuer_subject: { issuer, subject } },
    select: { userId: true },
  });
  return identity?.userId === userId;
}

export async function setUserRole(db: Db, userId: string, role: UserRole): Promise<void> {
  await db.user.updateMany({ where: { id: userId, role: { not: role } }, data: { role } });
}

export async function updateDisplayName(
  db: Db,
  userId: string,
  displayName: string,
): Promise<UserRecord> {
  return db.user.update({ where: { id: userId }, data: { displayName }, select: USER_SELECT });
}

const SETTINGS_SELECT = {
  locale: true,
  timeZone: true,
  baseCurrency: true,
  weekStart: true,
  dateFormat: true,
  theme: true,
  onboardingCompletedAt: true,
  version: true,
  updatedAt: true,
} as const satisfies Prisma.UserSettingSelect;

export async function findSettings(db: Db, userId: string): Promise<SettingsRecord | null> {
  return db.userSetting.findUnique({ where: { userId }, select: SETTINGS_SELECT });
}

export interface SettingsChanges {
  readonly locale?: string;
  readonly timeZone?: string;
  readonly baseCurrency?: string;
  readonly weekStart?: SettingsRecord['weekStart'];
  readonly dateFormat?: string;
  readonly theme?: SettingsRecord['theme'];
  readonly onboardingCompletedAt?: Date;
}

/** Optimistic update; null when `expectedVersion` is stale. */
export async function updateSettings(
  db: Db,
  userId: string,
  expectedVersion: number,
  changes: SettingsChanges,
): Promise<SettingsRecord | null> {
  const result = await db.userSetting.updateMany({
    where: { userId, version: expectedVersion },
    data: { ...changes, version: { increment: 1 } },
  });
  if (result.count === 0) return null;
  return findSettings(db, userId);
}

export async function currencyIsActive(db: Db, code: string): Promise<boolean> {
  const currency = await db.currency.findUnique({ where: { code }, select: { active: true } });
  return currency?.active === true;
}

// --- Admin (operational data only) ---

export interface AdminUserRecord extends UserRecord {
  readonly activeSessionCount: number;
}

export interface AdminUserCursor {
  readonly createdAt: Date;
  readonly id: string;
}

export interface AdminUserQuery {
  readonly after: AdminUserCursor | undefined;
  readonly limit: number;
  readonly q: string | undefined;
  readonly status: UserStatus | undefined;
  readonly now: Date;
}

function adminSelect(now: Date) {
  return {
    ...USER_SELECT,
    _count: {
      select: {
        sessions: {
          where: { revokedAt: null, idleExpiresAt: { gt: now }, absoluteExpiresAt: { gt: now } },
        },
      },
    },
  } as const satisfies Prisma.UserSelect;
}

function toAdminUser(row: UserRecord & { _count: { sessions: number } }): AdminUserRecord {
  const { _count, ...user } = row;
  return { ...user, activeSessionCount: _count.sessions };
}

export async function listUsers(db: Db, query: AdminUserQuery): Promise<AdminUserRecord[]> {
  const where: Prisma.UserWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.q
      ? {
          OR: [
            { displayName: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(query.after
      ? {
          AND: [
            {
              OR: [
                { createdAt: { gt: query.after.createdAt } },
                { createdAt: query.after.createdAt, id: { gt: query.after.id } },
              ],
            },
          ],
        }
      : {}),
  };
  const rows = await db.user.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: query.limit,
    select: adminSelect(query.now),
  });
  return rows.map(toAdminUser);
}

export async function findAdminUser(
  db: Db,
  userId: string,
  now: Date,
): Promise<AdminUserRecord | null> {
  const row = await db.user.findUnique({ where: { id: userId }, select: adminSelect(now) });
  return row ? toAdminUser(row) : null;
}

/**
 * Runs `work` in a transaction that holds the users lock, after checking that it would leave at
 * least one active admin (`demotes` = the user losing active-admin status).
 */
export async function withAdminGuard<T>(
  prisma: PrismaClient,
  demotes: string | undefined,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T | 'LAST_ADMIN'> {
  return prisma.$transaction(async (tx) => {
    await lockUsers(tx);
    if (demotes !== undefined) {
      const target = await tx.user.findUnique({
        where: { id: demotes },
        select: { role: true, status: true },
      });
      if (target?.role === 'ADMIN' && target.status === 'ACTIVE') {
        const admins = await tx.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });
        if (admins <= 1) return 'LAST_ADMIN';
      }
    }
    return work(tx);
  });
}

export async function setUserStatus(db: Db, userId: string, status: UserStatus): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { status } });
}

export interface CliUserRecord extends UserRecord {
  readonly identities: readonly { readonly issuer: string; readonly subject: string }[];
}

/** For the CLI `list-users` (administration.md#cli). */
export async function listAllUsers(db: Db): Promise<CliUserRecord[]> {
  return db.user.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { ...USER_SELECT, identities: { select: { issuer: true, subject: true } } },
  });
}
