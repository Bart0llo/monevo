import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  CategoryCreateSchema,
  CategoryListResponseSchema,
  CategoryReorderSchema,
  CategorySchema,
  CategoryUpdateSchema,
  type ErrorCode,
  z,
} from '@monevo/contracts';
import { problemResponses, securityFor, TOKEN_ERRORS } from '../../openapi/helpers.js';

const json = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } } });
const idParams = z.object({ id: z.uuid() });
const ifMatch = z.object({ 'If-Match': z.string().optional() });
const WRITE_ERRORS: ErrorCode[] = [...TOKEN_ERRORS, 'CSRF_INVALID'];
const VERSIONED_ERRORS: ErrorCode[] = [
  ...WRITE_ERRORS,
  'NOT_FOUND',
  'MALFORMED_REQUEST',
  'VERSION_CONFLICT',
  'PRECONDITION_REQUIRED',
];
const HIERARCHY_ERRORS: ErrorCode[] = [
  'CATEGORY_TYPE_MISMATCH',
  'CATEGORY_DEPTH_EXCEEDED',
  'CATEGORY_PARENT_ARCHIVED',
];
const VERSION_NOTE =
  '`If-Match: "<version>"` (or `version`) is optional for browser sessions and required for API tokens (`428`).';

export function registerCategoriesOpenApi(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/categories',
    operationId: 'listCategories',
    tags: ['categories'],
    summary: 'All categories, archived included',
    description:
      'A flat list; subcategories reference their parent. An archived parent hides its subcategories.',
    ...securityFor({ permissions: ['categories:read'] }),
    responses: {
      200: { description: 'Categories', ...json(CategoryListResponseSchema) },
      ...problemResponses(...TOKEN_ERRORS),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/categories',
    operationId: 'createCategory',
    tags: ['categories'],
    summary: 'Create a category or subcategory',
    description:
      'The parent must be a top-level, non-archived category of the same type. The client may supply the `id`; an id already in use returns `ID_CONFLICT`.',
    ...securityFor({ permissions: ['categories:create'] }),
    request: { body: { required: true, ...json(CategoryCreateSchema) } },
    responses: {
      201: { description: 'Created', ...json(CategorySchema) },
      ...problemResponses(
        ...WRITE_ERRORS,
        'NOT_FOUND',
        'ID_CONFLICT',
        'VALIDATION_FAILED',
        ...HIERARCHY_ERRORS,
      ),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/categories/reorder',
    operationId: 'reorderCategories',
    tags: ['categories'],
    summary: 'Reorder sibling categories',
    description:
      'Sets `sortOrder` to the position in `ids`. All ids must be siblings (same parent and type). Returns every category.',
    ...securityFor({ permissions: ['categories:update'] }),
    request: { body: { required: true, ...json(CategoryReorderSchema) } },
    responses: {
      200: { description: 'Categories', ...json(CategoryListResponseSchema) },
      ...problemResponses(...WRITE_ERRORS, 'NOT_FOUND', 'VALIDATION_FAILED'),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/categories/{id}',
    operationId: 'getCategory',
    tags: ['categories'],
    summary: 'One category',
    description: 'The `ETag` header carries the version for `If-Match`.',
    ...securityFor({ permissions: ['categories:read'] }),
    request: { params: idParams },
    responses: {
      200: { description: 'Category', ...json(CategorySchema) },
      ...problemResponses(...TOKEN_ERRORS, 'NOT_FOUND'),
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/categories/{id}',
    operationId: 'updateCategory',
    tags: ['categories'],
    summary: 'Change, move or promote a category',
    description: `${VERSION_NOTE} \`parentId: null\` promotes a subcategory. The type of a category with subcategories cannot change.`,
    ...securityFor({ permissions: ['categories:update'] }),
    request: {
      params: idParams,
      headers: ifMatch,
      body: { required: true, ...json(CategoryUpdateSchema) },
    },
    responses: {
      200: { description: 'Updated', ...json(CategorySchema) },
      ...problemResponses(...VERSIONED_ERRORS, 'VALIDATION_FAILED', ...HIERARCHY_ERRORS),
    },
  });
  registry.registerPath({
    method: 'delete',
    path: '/categories/{id}',
    operationId: 'deleteCategory',
    tags: ['categories'],
    summary: 'Delete a category and its subcategories',
    description: VERSION_NOTE,
    ...securityFor({ permissions: ['categories:delete'] }),
    request: { params: idParams, headers: ifMatch },
    responses: {
      204: { description: 'Deleted' },
      ...problemResponses(...VERSIONED_ERRORS),
    },
  });
  for (const action of ['archive', 'unarchive'] as const) {
    registry.registerPath({
      method: 'post',
      path: `/categories/{id}/${action}`,
      operationId: action === 'archive' ? 'archiveCategory' : 'unarchiveCategory',
      tags: ['categories'],
      summary: action === 'archive' ? 'Archive a category' : 'Restore an archived category',
      description:
        action === 'archive'
          ? 'Idempotent. Subcategories keep their own state but are hidden while the parent is archived.'
          : 'Idempotent. A subcategory under an archived parent stays hidden until the parent is restored.',
      ...securityFor({ permissions: ['categories:update'] }),
      request: { params: idParams },
      responses: {
        200: { description: 'Category', ...json(CategorySchema) },
        ...problemResponses(...WRITE_ERRORS, 'NOT_FOUND'),
      },
    });
  }
}
