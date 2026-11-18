import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { HealthResponseSchema, ReadinessResponseSchema } from '@monevo/contracts';

export function registerHealthOpenApi(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'get',
    path: '/health',
    operationId: 'getHealth',
    tags: ['health'],
    summary: 'Liveness: the process is serving HTTP',
    security: [],
    responses: {
      200: { description: 'Alive', content: { 'application/json': { schema: HealthResponseSchema } } },
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/health/ready',
    operationId: 'getReadiness',
    tags: ['health'],
    summary: 'Readiness: database reachable, migrations applied, not shutting down',
    description: 'Only failing checks are listed.',
    security: [],
    responses: {
      200: { description: 'Ready', content: { 'application/json': { schema: ReadinessResponseSchema } } },
      503: { description: 'Not ready', content: { 'application/json': { schema: ReadinessResponseSchema } } },
    },
  });
}
