import type { Request, RequestHandler } from 'express';
import type { Logger } from '../infra/logger.js';

// One line per request with the route pattern, never the raw URL or query string
// (monitoring-and-logging.md#standard-fields). Health checks are logged at debug only.

function routePattern(req: Request): string | undefined {
  const route: unknown = req.route;
  if (route && typeof route === 'object' && 'path' in route && typeof route.path === 'string') {
    return `${req.baseUrl}${route.path}`;
  }
  return undefined;
}

export function accessLog(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const route = routePattern(req);
      const durationMs = Number((process.hrtime.bigint() - started) / 1000n) / 1000;
      const entry = {
        requestId: req.requestId,
        method: req.method,
        route,
        status: res.statusCode,
        durationMs,
      };
      if (route?.startsWith('/api/v1/health')) logger.debug(entry, 'request');
      else logger.info(entry, 'request');
    });
    next();
  };
}
