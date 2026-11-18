import { z } from './zod.js';

/** Liveness (monitoring-and-logging.md#2-health-endpoints). */
export const HealthResponseSchema = z.object({ status: z.literal('ok') }).openapi('HealthResponse');

export const ReadinessCheckSchema = z.enum(['ok', 'fail']);

/**
 * Readiness. Only failing checks are listed, so the public output stays minimal. `maintenance` is
 * reserved for the restore flow (Stage 15).
 */
export const ReadinessResponseSchema = z
  .object({
    status: z.enum(['ok', 'unavailable']),
    checks: z
      .object({
        database: ReadinessCheckSchema.optional(),
        migrations: ReadinessCheckSchema.optional(),
        lifecycle: ReadinessCheckSchema.optional(),
      })
      .optional(),
    maintenance: z.boolean().optional(),
  })
  .openapi('ReadinessResponse');

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;
