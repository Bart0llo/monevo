import { type ErrorCode, PROBLEM_CONTENT_TYPE, type Problem } from '@monevo/contracts';

// REST client (frontend-architecture.md, api-design.md): same-origin `/api/v1`, cookie session,
// CSRF header on unsafe methods, problem+json errors surfaced as ApiError.

export const API_BASE = '/api/v1';
const CSRF_HEADER = 'X-CSRF-Token';

let csrfToken: string | null = null;

/** Set from `GET /auth/session`; sent on every unsafe request. */
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | null;
  readonly problem: Problem | null;

  constructor(status: number, problem: Problem | null) {
    super(problem?.title ?? `HTTP ${String(status)}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = problem?.code ?? null;
    this.problem = problem;
  }
}

export function isApiError(error: unknown, code?: ErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken !== null) headers[CSRF_HEADER] = csrfToken;

  const init: RequestInit = { method, headers, credentials: 'same-origin' };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  if (options.signal) init.signal = options.signal;
  const response = await fetch(`${API_BASE}${path}`, init);

  if (!response.ok) {
    const type = response.headers.get('Content-Type') ?? '';
    const problem =
      type.includes(PROBLEM_CONTENT_TYPE) || type.includes('application/json')
        ? ((await response.json().catch(() => null)) as Problem | null)
        : null;
    throw new ApiError(response.status, problem);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
