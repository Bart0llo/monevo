import type { RequestHandler } from 'express';
import helmet from 'helmet';

// Security headers (security.md#output-and-xss). Scripts only from the same origin: no inline
// scripts anywhere, including the web app's color-scheme bootstrap.

export interface SecurityHeadersConfig {
  readonly https: boolean;
}

export function securityHeaders(config: SecurityHeadersConfig): RequestHandler[] {
  return [
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          ...(config.https ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      strictTransportSecurity: config.https
        ? { maxAge: 31_536_000, includeSubDomains: false }
        : false,
      referrerPolicy: { policy: 'same-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginEmbedderPolicy: false,
    }),
    (_req, res, next) => {
      res.setHeader(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      );
      next();
    },
  ];
}

const ALLOWED_HEADERS = 'Content-Type, Authorization, Idempotency-Key, If-Match, X-Request-Id';
const EXPOSED_HEADERS = 'X-Request-Id, ETag, Retry-After';

/**
 * CORS for explicitly listed origins only, never with credentials (security.md#cors). With an empty
 * list no CORS headers are sent at all.
 */
export function cors(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    const origin = req.get('Origin');
    if (allowed.size === 0 || origin === undefined) return next();
    res.vary('Origin');
    if (!allowed.has(origin)) return next();
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS);
    if (req.method === 'OPTIONS' && req.get('Access-Control-Request-Method') !== undefined) {
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE');
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      res.setHeader('Access-Control-Max-Age', '600');
      res.status(204).end();
      return;
    }
    next();
  };
}
