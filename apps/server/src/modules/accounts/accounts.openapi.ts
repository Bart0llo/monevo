import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  AccountCreateSchema,
  AccountListResponseSchema,
  AccountSchema,
  AccountUpdateSchema,
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
const VERSION_NOTE =
  '`If-Match: "<version>"` (or `version`) is optional for browser sessions and required for API tokens (`428`).';

export function registerAccountsOpenApi(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/accounts',
    operationId: 'listAccounts',
    tags: ['accounts'],
    summary: 'All accounts, archived included',
    ...securityFor({ permissions: ['accounts:read'] }),
    responses: {
      200: { description: 'Accounts', ...json(AccountListResponseSchema) },
      ...problemResponses(...TOKEN_ERRORS),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/accounts',
    operationId: 'createAccount',
    tags: ['accounts'],
    summary: 'Create an account',
    description:
      'The client may supply the `id` (offline-first); an id already in use returns `ID_CONFLICT`. The opening balance must fit the currency exponent (`errors[].code` `AMOUNT_PRECISION`); inactive currencies are refused (`CURRENCY_INACTIVE`).',
    ...securityFor({ permissions: ['accounts:create'] }),
    request: { body: { required: true, ...json(AccountCreateSchema) } },
    responses: {
      201: { description: 'Created', ...json(AccountSchema) },
      ...problemResponses(...WRITE_ERRORS, 'ID_CONFLICT', 'VALIDATION_FAILED'),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/accounts/{id}',
    operationId: 'getAccount',
    tags: ['accounts'],
    summary: 'One account',
    description: 'The `ETag` header carries the version for `If-Match`.',
    ...securityFor({ permissions: ['accounts:read'] }),
    request: { params: idParams },
    responses: {
      200: { description: 'Account', ...json(AccountSchema) },
      ...problemResponses(...TOKEN_ERRORS, 'NOT_FOUND'),
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/accounts/{id}',
    operationId: 'updateAccount',
    tags: ['accounts'],
    summary: 'Change an account',
    description: `${VERSION_NOTE} The currency stays editable while the account has no postings.`,
    ...securityFor({ permissions: ['accounts:update'] }),
    request: {
      params: idParams,
      headers: ifMatch,
      body: { required: true, ...json(AccountUpdateSchema) },
    },
    responses: {
      200: { description: 'Updated', ...json(AccountSchema) },
      ...problemResponses(...VERSIONED_ERRORS, 'VALIDATION_FAILED'),
    },
  });
  registry.registerPath({
    method: 'delete',
    path: '/accounts/{id}',
    operationId: 'deleteAccount',
    tags: ['accounts'],
    summary: 'Delete an unused account',
    description: VERSION_NOTE,
    ...securityFor({ permissions: ['accounts:delete'] }),
    request: { params: idParams, headers: ifMatch },
    responses: {
      204: { description: 'Deleted' },
      ...problemResponses(...VERSIONED_ERRORS),
    },
  });
  for (const action of ['archive', 'unarchive'] as const) {
    registry.registerPath({
      method: 'post',
      path: `/accounts/{id}/${action}`,
      operationId: action === 'archive' ? 'archiveAccount' : 'unarchiveAccount',
      tags: ['accounts'],
      summary: action === 'archive' ? 'Archive an account' : 'Restore an archived account',
      description: 'Idempotent.',
      ...securityFor({ permissions: ['accounts:update'] }),
      request: { params: idParams },
      responses: {
        200: { description: 'Account', ...json(AccountSchema) },
        ...problemResponses(...WRITE_ERRORS, 'NOT_FOUND'),
      },
    });
  }
}
