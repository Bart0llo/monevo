import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { ProblemSchema } from '@monevo/contracts';
import { registerHealthOpenApi } from '../modules/health/index.js';

// OpenAPI 3.1 document assembled from every module's registrations (api-design.md#1-principles).
// The committed snapshot (apps/server/openapi.snapshot.json) is checked by `pnpm openapi:check`.

export type OpenApiDocument = ReturnType<OpenApiGeneratorV31['generateDocument']>;

export const API_BASE_PATH = '/api/v1';

export function buildOpenApiDocument(): OpenApiDocument {
  const registry = new OpenAPIRegistry();
  registry.register('Problem', ProblemSchema);
  registerHealthOpenApi(registry);

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Monevo API',
      version: '1.0.0',
      description:
        'REST API of a self-hosted Monevo instance. Errors use application/problem+json with a stable `code`.',
    },
    servers: [{ url: API_BASE_PATH }],
  });
}
