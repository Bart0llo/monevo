import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type RequestHandler, type Router } from 'express';

// Static hosting of the built web app with SPA fallback (backend-architecture.md#10-static-frontend-hosting).

const NO_CACHE = 'no-cache';
const IMMUTABLE = 'public, max-age=31536000, immutable';

function isApiPath(path: string): boolean {
  return path === '/api' || path.startsWith('/api/');
}

/** Returns `undefined` when no web build exists (e.g. API-only development). */
export function webApp(webRoot: string): Router | undefined {
  const indexHtml = join(webRoot, 'index.html');
  if (!existsSync(indexHtml)) return undefined;

  const router = express.Router();
  router.use(
    express.static(webRoot, {
      index: false,
      setHeaders: (res, filePath) => {
        const relative = filePath.slice(webRoot.length).replaceAll('\\', '/');
        res.setHeader('Cache-Control', relative.startsWith('/assets/') ? IMMUTABLE : NO_CACHE);
      },
    }),
  );
  const spaFallback: RequestHandler = (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (isApiPath(req.path) || !req.accepts('html')) return next();
    res.sendFile(indexHtml, { headers: { 'Cache-Control': NO_CACHE } });
  };
  router.use(spaFallback);
  return router;
}
