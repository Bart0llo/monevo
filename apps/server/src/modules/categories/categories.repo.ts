import type { CategoryType } from '@monevo/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db, PrismaClient } from '../../infra/prisma.js';

// Categories (data-model.md#categories). Every query is scoped by the authenticated `userId`.
// Deleting a parent deletes its subcategories through the composite FK (ON DELETE CASCADE).

const CATEGORY_SELECT = {
  id: true,
  name: true,
  type: true,
  parentId: true,
  icon: true,
  color: true,
  sortOrder: true,
  archivedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.CategorySelect;

export interface CategoryRecord {
  readonly id: string;
  readonly name: string;
  readonly type: CategoryType;
  readonly parentId: string | null;
  readonly icon: string;
  readonly color: string;
  readonly sortOrder: number;
  readonly archivedAt: Date | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export async function listCategories(db: Db, userId: string): Promise<CategoryRecord[]> {
  return db.category.findMany({
    where: { userId },
    orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: CATEGORY_SELECT,
  });
}

export async function findCategory(
  db: Db,
  userId: string,
  id: string,
): Promise<CategoryRecord | null> {
  return db.category.findFirst({ where: { id, userId }, select: CATEGORY_SELECT });
}

export async function findCategories(
  db: Db,
  userId: string,
  ids: readonly string[],
): Promise<CategoryRecord[]> {
  return db.category.findMany({ where: { userId, id: { in: [...ids] } }, select: CATEGORY_SELECT });
}

export async function countChildren(db: Db, userId: string, id: string): Promise<number> {
  return db.category.count({ where: { userId, parentId: id } });
}

export async function nextCategorySortOrder(
  db: Db,
  userId: string,
  type: CategoryType,
  parentId: string | null,
): Promise<number> {
  const result = await db.category.aggregate({
    where: { userId, type, parentId },
    _max: { sortOrder: true },
  });
  return (result._max.sortOrder ?? -1) + 1;
}

export interface CategoryData {
  readonly name: string;
  readonly type: CategoryType;
  readonly parentId: string | null;
  readonly icon: string;
  readonly color: string;
  readonly sortOrder: number;
}

/** Throws a Prisma P2002 error when `id` is already used. */
export async function createCategory(
  db: Db,
  userId: string,
  id: string,
  data: CategoryData,
): Promise<CategoryRecord> {
  return db.category.create({ data: { ...data, id, userId }, select: CATEGORY_SELECT });
}

/** Optimistic update; null when the category is gone or `version` is stale. */
export async function updateCategory(
  db: Db,
  userId: string,
  id: string,
  version: number,
  changes: Partial<CategoryData>,
): Promise<CategoryRecord | null> {
  const result = await db.category.updateMany({
    where: { id, userId, version },
    data: { ...changes, version: { increment: 1 } },
  });
  if (result.count === 0) return null;
  return findCategory(db, userId, id);
}

export async function setCategoryArchived(
  db: Db,
  userId: string,
  id: string,
  archivedAt: Date | null,
): Promise<CategoryRecord | null> {
  await db.category.updateMany({
    where: { id, userId, archivedAt: archivedAt === null ? { not: null } : null },
    data: { archivedAt, version: { increment: 1 } },
  });
  return findCategory(db, userId, id);
}

/** Deletes the category and its subcategories; false when gone or the version is stale. */
export async function deleteCategory(
  db: Db,
  userId: string,
  id: string,
  version: number | undefined,
): Promise<boolean> {
  const result = await db.category.deleteMany({
    where: { id, userId, ...(version === undefined ? {} : { version }) },
  });
  return result.count > 0;
}

/** Sets `sortOrder = index` for the given (already validated) sibling ids. */
export async function reorderCategories(
  prisma: PrismaClient,
  userId: string,
  ids: readonly string[],
): Promise<void> {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.category.updateMany({
        where: { id, userId, sortOrder: { not: index } },
        data: { sortOrder: index, version: { increment: 1 } },
      }),
    ),
  );
}
