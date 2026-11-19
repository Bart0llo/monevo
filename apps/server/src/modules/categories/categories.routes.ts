import express, { type Request, type Router } from 'express';
import { uuidv7 } from 'uuidv7';
import {
  type Category,
  CategoryCreateSchema,
  type CategoryListResponse,
  CategoryReorderSchema,
  type CategoryType,
  CategoryUpdateSchema,
} from '@monevo/contracts';
import { AppError, isUniqueViolation } from '../../http/errors.js';
import { authOf, type Guards } from '../../http/guards.js';
import { uuidParam } from '../../http/params.js';
import { setVersionTag, versionPrecondition } from '../../http/versioning.js';
import type { Clock } from '../../infra/clock.js';
import type { PrismaClient } from '../../infra/prisma.js';
import {
  type CategoryData,
  type CategoryRecord,
  countChildren,
  createCategory,
  deleteCategory,
  findCategories,
  findCategory,
  listCategories,
  nextCategorySortOrder,
  reorderCategories,
  setCategoryArchived,
  updateCategory,
} from './categories.repo.js';

// `/categories` (api-design.md#8-endpoint-map, features.md#categories). Two levels; a subcategory
// has its parent's type. An archived parent hides its children, which keep their own state.
// The hierarchy trigger in the database is defense in depth; these checks return CATEGORY_* codes.

export interface CategoryRouteDeps {
  readonly prisma: PrismaClient;
  readonly clock: Clock;
}

export function toCategoryDto(record: CategoryRecord): Category {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    parentId: record.parentId,
    icon: record.icon,
    color: record.color,
    sortOrder: record.sortOrder,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function tokenRequest(req: Request): boolean {
  return authOf(req).credential.type === 'API_TOKEN';
}

export function categoriesRouter(deps: CategoryRouteDeps, guards: Guards): Router {
  const router = express.Router();
  const { prisma, clock } = deps;

  async function load(userId: string, id: string): Promise<CategoryRecord> {
    const category = await findCategory(prisma, userId, id);
    if (!category) throw new AppError('NOT_FOUND');
    return category;
  }

  function conflict(current: CategoryRecord): AppError {
    return new AppError('VERSION_CONFLICT', undefined, undefined, toCategoryDto(current));
  }

  /** Checks that `parentId` can hold a subcategory of `type`. */
  async function checkParent(
    userId: string,
    parentId: string,
    type: CategoryType,
    allowArchived: boolean,
  ): Promise<void> {
    const parent = await findCategory(prisma, userId, parentId);
    if (!parent) throw new AppError('NOT_FOUND', 'The parent category does not exist.');
    if (parent.parentId !== null) {
      throw new AppError('CATEGORY_DEPTH_EXCEEDED', 'A subcategory cannot have subcategories.');
    }
    if (parent.type !== type) {
      throw new AppError('CATEGORY_TYPE_MISMATCH', 'A subcategory must have its parent’s type.');
    }
    if (!allowArchived && parent.archivedAt !== null)
      throw new AppError('CATEGORY_PARENT_ARCHIVED');
  }

  router.get(
    '/categories',
    ...guards.requireAuth({ permissions: ['categories:read'] }),
    async (req, res) => {
      const body: CategoryListResponse = {
        items: (await listCategories(prisma, authOf(req).userId)).map(toCategoryDto),
      };
      res.json(body);
    },
  );

  router.post(
    '/categories',
    ...guards.requireAuth({ permissions: ['categories:create'] }),
    async (req, res) => {
      const { userId } = authOf(req);
      const body = CategoryCreateSchema.parse(req.body);
      const parentId = body.parentId ?? null;
      if (parentId !== null) await checkParent(userId, parentId, body.type, false);
      let created: CategoryRecord;
      try {
        created = await createCategory(prisma, userId, body.id ?? uuidv7(), {
          name: body.name,
          type: body.type,
          parentId,
          icon: body.icon,
          color: body.color,
          sortOrder:
            body.sortOrder ?? (await nextCategorySortOrder(prisma, userId, body.type, parentId)),
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new AppError('ID_CONFLICT');
        throw error;
      }
      setVersionTag(res, created.version);
      res.status(201).json(toCategoryDto(created));
    },
  );

  router.post(
    '/categories/reorder',
    ...guards.requireAuth({ permissions: ['categories:update'] }),
    async (req, res) => {
      const { userId } = authOf(req);
      const { ids } = CategoryReorderSchema.parse(req.body);
      const rows = await findCategories(prisma, userId, ids);
      if (rows.length !== ids.length) throw new AppError('NOT_FOUND');
      const [first] = rows;
      if (first && rows.some((row) => row.parentId !== first.parentId || row.type !== first.type)) {
        throw new AppError('VALIDATION_FAILED', 'One or more fields are invalid.', [
          {
            path: ['ids'],
            code: 'INVALID_VALUE',
            message: 'All categories must be siblings (same parent and type).',
          },
        ]);
      }
      await reorderCategories(prisma, userId, ids);
      const body: CategoryListResponse = {
        items: (await listCategories(prisma, userId)).map(toCategoryDto),
      };
      res.json(body);
    },
  );

  router.get(
    '/categories/:id',
    ...guards.requireAuth({ permissions: ['categories:read'] }),
    async (req, res) => {
      const category = await load(authOf(req).userId, uuidParam(req, 'id'));
      setVersionTag(res, category.version);
      res.json(toCategoryDto(category));
    },
  );

  router.patch(
    '/categories/:id',
    ...guards.requireAuth({ permissions: ['categories:update'] }),
    async (req, res) => {
      const { userId } = authOf(req);
      const id = uuidParam(req, 'id');
      const body = CategoryUpdateSchema.parse(req.body);
      const expected = versionPrecondition(req, body.version, tokenRequest(req));
      const current = await load(userId, id);
      if (expected !== undefined && expected !== current.version) throw conflict(current);

      const type = body.type ?? current.type;
      const parentId = body.parentId === undefined ? current.parentId : body.parentId;
      const typeChanged = type !== current.type;
      const parentChanged = parentId !== current.parentId;
      const hasChildren =
        typeChanged || parentId !== null ? (await countChildren(prisma, userId, id)) > 0 : false;
      if (typeChanged && hasChildren) {
        throw new AppError(
          'CATEGORY_TYPE_MISMATCH',
          'The type of a category with subcategories cannot change.',
        );
      }
      if (parentId !== null) {
        if (parentId === id || hasChildren) {
          throw new AppError(
            'CATEGORY_DEPTH_EXCEEDED',
            'A category with subcategories cannot become a subcategory.',
          );
        }
        if (parentChanged || typeChanged) {
          await checkParent(userId, parentId, type, !parentChanged);
        }
      }
      const changes: Partial<CategoryData> = {
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.icon === undefined ? {} : { icon: body.icon }),
        ...(body.color === undefined ? {} : { color: body.color }),
        ...(typeChanged ? { type } : {}),
        ...(parentChanged ? { parentId } : {}),
        // A category moved to another sibling group goes to its end.
        ...(typeChanged || parentChanged
          ? { sortOrder: await nextCategorySortOrder(prisma, userId, type, parentId) }
          : {}),
      };
      const updated = await updateCategory(prisma, userId, id, current.version, changes);
      if (!updated) throw conflict(await load(userId, id));
      setVersionTag(res, updated.version);
      res.json(toCategoryDto(updated));
    },
  );

  router.delete(
    '/categories/:id',
    ...guards.requireAuth({ permissions: ['categories:delete'] }),
    async (req, res) => {
      const { userId } = authOf(req);
      const id = uuidParam(req, 'id');
      const expected = versionPrecondition(req, undefined, tokenRequest(req));
      if (!(await deleteCategory(prisma, userId, id, expected))) {
        throw conflict(await load(userId, id));
      }
      res.status(204).end();
    },
  );

  for (const action of ['archive', 'unarchive'] as const) {
    router.post(
      `/categories/:id/${action}`,
      ...guards.requireAuth({ permissions: ['categories:update'] }),
      async (req, res) => {
        const { userId } = authOf(req);
        const id = uuidParam(req, 'id');
        await load(userId, id);
        const updated = await setCategoryArchived(
          prisma,
          userId,
          id,
          action === 'archive' ? clock.now() : null,
        );
        if (!updated) throw new AppError('NOT_FOUND');
        setVersionTag(res, updated.version);
        res.json(toCategoryDto(updated));
      },
    );
  }

  return router;
}
