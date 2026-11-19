import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  CurrencyListResponseSchema,
  ExchangeRateCreateSchema,
  ExchangeRateListQuerySchema,
  ExchangeRateListResponseSchema,
  ExchangeRateResolveRequestSchema,
  ExchangeRateSchema,
  ResolvedRateSchema,
  type z,
} from '@monevo/contracts';
import { problemResponses, securityFor, TOKEN_ERRORS } from '../../openapi/helpers.js';

const json = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } } });

export function registerCurrenciesOpenApi(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/currencies',
    operationId: 'listCurrencies',
    tags: ['currencies'],
    summary: 'ISO 4217 currencies with their exponent',
    ...securityFor({ permissions: ['currencies:read'] }),
    responses: {
      200: { description: 'Currencies', ...json(CurrencyListResponseSchema) },
      ...problemResponses(...TOKEN_ERRORS),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/exchange-rates',
    operationId: 'listExchangeRates',
    tags: ['currencies'],
    summary: 'Stored rates: the caller’s manual rates and cached provider rates',
    description: 'Newest `rateDate` first.',
    ...securityFor({ permissions: ['currencies:read'] }),
    request: { query: ExchangeRateListQuerySchema },
    responses: {
      200: { description: 'Rates', ...json(ExchangeRateListResponseSchema) },
      ...problemResponses(...TOKEN_ERRORS, 'VALIDATION_FAILED'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/exchange-rates',
    operationId: 'putManualExchangeRate',
    tags: ['currencies'],
    summary: 'Create or replace a manual rate for a pair and date',
    description:
      'Manual rates take precedence over provider rates for the same date. `201` when created, `200` when an existing manual rate was replaced.',
    ...securityFor({ permissions: ['exchange-rates:create'] }),
    request: { body: { required: true, ...json(ExchangeRateCreateSchema) } },
    responses: {
      200: { description: 'Replaced', ...json(ExchangeRateSchema) },
      201: { description: 'Created', ...json(ExchangeRateSchema) },
      ...problemResponses(...TOKEN_ERRORS, 'CSRF_INVALID', 'VALIDATION_FAILED'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/exchange-rates/resolve',
    operationId: 'resolveExchangeRate',
    tags: ['currencies'],
    summary: 'Resolve the rate for a pair and date',
    description:
      'Runs the resolution algorithm (manual, cached provider rate, on-demand provider fetch, stale rate up to 7 days). A missing rate or provider outage returns `status: MISSING`, never an error. Future dates use the latest rate and set `estimate`.',
    ...securityFor({ permissions: ['exchange-rates:create'] }),
    request: { body: { required: true, ...json(ExchangeRateResolveRequestSchema) } },
    responses: {
      200: { description: 'Resolved rate', ...json(ResolvedRateSchema) },
      ...problemResponses(...TOKEN_ERRORS, 'CSRF_INVALID', 'VALIDATION_FAILED'),
    },
  });
}
