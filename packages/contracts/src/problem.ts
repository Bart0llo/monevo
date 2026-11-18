import { ERROR_CODES } from './error-codes.js';
import { z } from './zod.js';

export const ErrorCodeSchema = z.enum(ERROR_CODES).openapi('ErrorCode');

export const ProblemFieldErrorSchema = z
  .object({
    path: z.array(z.union([z.string(), z.number().int()])),
    code: z.string(),
    message: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('ProblemFieldError');

/** RFC 9457 Problem Details with Monevo extensions (api-design.md#4-error-format). */
export const ProblemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    code: ErrorCodeSchema,
    detail: z.string().optional(),
    instance: z.string().optional(),
    requestId: z.string(),
    errors: z.array(ProblemFieldErrorSchema).optional(),
  })
  .openapi('Problem');

export type Problem = z.infer<typeof ProblemSchema>;
export type ProblemFieldError = z.infer<typeof ProblemFieldErrorSchema>;

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/** `https://monevo.app/problems/validation-failed` for `VALIDATION_FAILED`. */
export function problemTypeUri(code: string): string {
  return `https://monevo.app/problems/${code.toLowerCase().replaceAll('_', '-')}`;
}
