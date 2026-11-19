import type { AccountKind } from '@monevo/contracts';
import { Decimal, type LocalDate } from '@monevo/domain';
import type { Prisma } from '../../generated/prisma/client.js';
import { fromDbDate, toDbDate } from '../../infra/db-dates.js';
import type { Db } from '../../infra/prisma.js';

// Accounts (data-model.md#accounts). Every query is scoped by the authenticated `userId`.

const ACCOUNT_SELECT = {
  id: true,
  name: true,
  currency: true,
  kind: true,
  customKindLabel: true,
  icon: true,
  color: true,
  openingBalance: true,
  openingDate: true,
  includeInNetWorthWidget: true,
  sortOrder: true,
  archivedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.AccountSelect;

type AccountRow = Prisma.AccountGetPayload<{ select: typeof ACCOUNT_SELECT }>;

export interface AccountRecord {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly kind: AccountKind;
  readonly customKindLabel: string | null;
  readonly icon: string;
  readonly color: string;
  readonly openingBalance: Decimal;
  readonly openingDate: LocalDate;
  readonly includeInNetWorthWidget: boolean;
  readonly sortOrder: number;
  readonly archivedAt: Date | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toRecord(row: AccountRow): AccountRecord {
  return {
    ...row,
    openingBalance: new Decimal(row.openingBalance.toString()),
    openingDate: fromDbDate(row.openingDate),
  };
}

export async function listAccounts(db: Db, userId: string): Promise<AccountRecord[]> {
  const rows = await db.account.findMany({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: ACCOUNT_SELECT,
  });
  return rows.map(toRecord);
}

export async function findAccount(
  db: Db,
  userId: string,
  id: string,
): Promise<AccountRecord | null> {
  const row = await db.account.findFirst({ where: { id, userId }, select: ACCOUNT_SELECT });
  return row ? toRecord(row) : null;
}

export async function nextAccountSortOrder(db: Db, userId: string): Promise<number> {
  const result = await db.account.aggregate({ where: { userId }, _max: { sortOrder: true } });
  return (result._max.sortOrder ?? -1) + 1;
}

export interface AccountData {
  readonly name: string;
  readonly currency: string;
  readonly kind: AccountKind;
  readonly customKindLabel: string | null;
  readonly icon: string;
  readonly color: string;
  /** Decimal string at the currency exponent. */
  readonly openingBalance: string;
  readonly openingDate: LocalDate;
  readonly includeInNetWorthWidget: boolean;
  readonly sortOrder: number;
}

/** Throws a Prisma P2002 error when `id` is already used. */
export async function createAccount(
  db: Db,
  userId: string,
  id: string,
  data: AccountData,
): Promise<AccountRecord> {
  const row = await db.account.create({
    data: { ...data, id, userId, openingDate: toDbDate(data.openingDate) },
    select: ACCOUNT_SELECT,
  });
  return toRecord(row);
}

export type AccountChanges = Partial<AccountData>;

/** Optimistic update; null when the account is gone or `version` is stale. */
export async function updateAccount(
  db: Db,
  userId: string,
  id: string,
  version: number,
  changes: AccountChanges,
): Promise<AccountRecord | null> {
  const { openingDate, ...rest } = changes;
  const result = await db.account.updateMany({
    where: { id, userId, version },
    data: {
      ...rest,
      ...(openingDate === undefined ? {} : { openingDate: toDbDate(openingDate) }),
      version: { increment: 1 },
    },
  });
  if (result.count === 0) return null;
  return findAccount(db, userId, id);
}

export async function setAccountArchived(
  db: Db,
  userId: string,
  id: string,
  archivedAt: Date | null,
): Promise<AccountRecord | null> {
  await db.account.updateMany({
    where: { id, userId, archivedAt: archivedAt === null ? { not: null } : null },
    data: { archivedAt, version: { increment: 1 } },
  });
  return findAccount(db, userId, id);
}

/** Deletes when the version matches (any version when undefined); false otherwise. */
export async function deleteAccount(
  db: Db,
  userId: string,
  id: string,
  version: number | undefined,
): Promise<boolean> {
  const result = await db.account.deleteMany({
    where: { id, userId, ...(version === undefined ? {} : { version }) },
  });
  return result.count > 0;
}
