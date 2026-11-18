import {
  ERROR_STATUS,
  type ErrorCode,
  PROBLEM_CONTENT_TYPE,
  type Problem,
  type ProblemFieldError,
  problemTypeUri,
} from '@monevo/contracts';
import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import type { Logger } from '../infra/logger.js';

// problem+json errors (api-design.md#4-error-format, backend-architecture.md#8-error-handling).

/** English fallback titles; clients translate `code` via `errors.<CODE>`. */
const TITLES: Readonly<Record<ErrorCode, string>> = {
  MALFORMED_REQUEST: 'Malformed request',
  NOT_FOUND: 'Not found',
  PAYLOAD_TOO_LARGE: 'Payload too large',
  UNSUPPORTED_MEDIA_TYPE: 'Unsupported media type',
  VALIDATION_FAILED: 'Validation failed',
  INTERNAL: 'Internal server error',
};

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
    readonly errors?: readonly ProblemFieldError[],
  ) {
    super(detail ?? TITLES[code]);
    this.name = 'AppError';
    this.status = ERROR_STATUS[code];
  }
}

export function sendProblem(res: Response, requestId: string, error: AppError): void {
  const body: Problem = {
    type: problemTypeUri(error.code),
    title: TITLES[error.code],
    status: error.status,
    code: error.code,
    ...(error.detail === undefined ? {} : { detail: error.detail }),
    requestId,
    ...(error.errors === undefined ? {} : { errors: [...error.errors] }),
  };
  res.status(error.status).type(PROBLEM_CONTENT_TYPE).json(body);
}

function zodFieldErrors(error: ZodError): ProblemFieldError[] {
  return error.issues.map((issue) => {
    const params = issue.code === 'custom' ? issue.params : undefined;
    const customCode = typeof params?.['code'] === 'string' ? params['code'] : undefined;
    return {
      path: issue.path.map((segment) => (typeof segment === 'number' ? segment : String(segment))),
      code: customCode ?? issue.code.toUpperCase(),
      message: issue.message,
    };
  });
}

/** Errors raised by express.json() (body-parser) carry a `type` and an HTTP `status`. */
function bodyParserError(error: unknown): AppError | undefined {
  if (typeof error !== 'object' || error === null || !('type' in error)) return undefined;
  switch (error.type) {
    case 'entity.parse.failed':
      return new AppError('MALFORMED_REQUEST', 'The request body is not valid JSON.');
    case 'entity.too.large':
      return new AppError('PAYLOAD_TOO_LARGE', 'The request body is too large.');
    case 'charset.unsupported':
    case 'encoding.unsupported':
      return new AppError('UNSUPPORTED_MEDIA_TYPE', 'The request body encoding is not supported.');
    default:
      if ('status' in error && error.status === 400) return new AppError('MALFORMED_REQUEST');
      return undefined;
  }
}

export function toAppError(error: unknown): AppError | undefined {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    return new AppError('VALIDATION_FAILED', 'One or more fields are invalid.', zodFieldErrors(error));
  }
  return bodyParserError(error);
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const known = toAppError(error);
    if (known) {
      sendProblem(res, req.requestId, known);
      return;
    }
    logger.error({ err: error, requestId: req.requestId }, 'unhandled error');
    sendProblem(res, req.requestId, new AppError('INTERNAL'));
  };
}

export function notFound(): RequestHandler {
  return (req, res) => {
    sendProblem(res, req.requestId, new AppError('NOT_FOUND', 'No resource exists at this path.'));
  };
}
