import type { Request, RequestHandler, Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { AppError, sendProblem } from './errors.js';

// Rate limits (security.md#rate-limiting). In-memory store: one container per instance (ADR-0002).

export interface RateLimitOptions {
  readonly windowMs: number;
  readonly limit: number;
  /** Defaults to the client IP (IPv6 grouped by /56). */
  readonly key?: (req: Request) => string;
  /** Only responses for which this returns false count against the limit. */
  readonly countOnly?: (req: Request, res: Response) => boolean;
}

export interface IdentityRateLimits {
  /** `/auth/oidc/*` per IP. */
  readonly oidc: { readonly windowMs: number; readonly limit: number };
  /** Authenticated requests per user. */
  readonly user: { readonly windowMs: number; readonly limit: number };
  /** Requests ending in 401 per IP (invalid credentials). */
  readonly invalidCredential: { readonly windowMs: number; readonly limit: number };
}

export const DEFAULT_RATE_LIMITS: IdentityRateLimits = {
  oidc: { windowMs: 60_000, limit: 30 },
  user: { windowMs: 60_000, limit: 600 },
  invalidCredential: { windowMs: 60_000, limit: 30 },
};

export function clientIpKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? 'unknown');
}

export function createRateLimit(options: RateLimitOptions): RequestHandler {
  const countOnly = options.countOnly;
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: options.key ?? clientIpKey,
    ...(countOnly
      ? {
          skipSuccessfulRequests: true,
          requestWasSuccessful: (req: Request, res: Response) => !countOnly(req, res),
        }
      : {}),
    handler: (req, res) => {
      // express-rate-limit sets Retry-After from the window reset when standard headers are on.
      if (!res.getHeader('Retry-After')) {
        res.setHeader('Retry-After', String(Math.ceil(options.windowMs / 1000)));
      }
      sendProblem(res, req.requestId, new AppError('RATE_LIMITED'));
    },
  });
}
