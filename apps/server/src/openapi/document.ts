import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { ProblemSchema } from '@monevo/contracts';
import { registerAdminOpenApi } from '../modules/admin/index.js';
import { registerApiTokensOpenApi } from '../modules/api-tokens/index.js';
import { registerAuthOpenApi } from '../modules/auth/index.js';
import { registerHealthOpenApi } from '../modules/health/index.js';
import { registerUsersOpenApi } from '../modules/users/index.js';
import { API_TOKEN_AUTH, COOKIE_AUTH } from './helpers.js';

// OpenAPI 3.1 document assembled from every module's registrations (api-design.md#1-principles).
// The committed snapshot (apps/server/openapi.snapshot.json) is checked by `pnpm openapi:check`.

export type OpenApiDocument = ReturnType<OpenApiGeneratorV31['generateDocument']>;

export const API_BASE_PATH = '/api/v1';

export function buildOpenApiDocument(): OpenApiDocument {
  const registry = new OpenAPIRegistry();
  registry.register('Problem', ProblemSchema);
  registry.registerComponent('securitySchemes', COOKIE_AUTH, {
    type: 'apiKey',
    in: 'cookie',
    name: '__Host-monevo_session',
    description: 'Browser session (unsafe methods also need the `X-CSRF-Token` header).',
  });
  registry.registerComponent('securitySchemes', API_TOKEN_AUTH, {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'mnv_pat',
    description:
      'Personal API token; the operation lists the needed permissions in `x-monevo-permissions`.',
  });
  registerHealthOpenApi(registry);
  registerAuthOpenApi(registry);
  registerUsersOpenApi(registry);
  registerApiTokensOpenApi(registry);
  registerAdminOpenApi(registry);

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Monevo API',
      version: '1.0.0',
      description:
        'REST API of a self-hosted Monevo instance. Errors use application/problem+json with a stable `code`.\n\n' +
        '## Authenticating integrations\n\n' +
        'Create a personal API token in Settings → API tokens and send it as `Authorization: Bearer mnv_pat_…`. ' +
        'Only operations that list `x-monevo-permissions` accept tokens, and the token must hold every listed permission. ' +
        'Browser clients use the session cookie and send `X-CSRF-Token` on unsafe methods.',
    },
    servers: [{ url: API_BASE_PATH }],
  });
}
