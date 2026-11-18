import type { HealthResponse, ReadinessResponse } from '@monevo/contracts';
import express, { type Router } from 'express';
import type { ReadinessChecker } from './health.readiness.js';

// Public, unauthenticated, minimal output: no versions or internals.

export function healthRouter(readiness: ReadinessChecker): Router {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok' };
    res.setHeader('Cache-Control', 'no-store');
    res.json(body);
  });

  router.get('/health/ready', async (_req, res) => {
    const result = await readiness.check();
    const failing = (Object.keys(result) as (keyof typeof result)[]).filter((name) => !result[name]);
    const body: ReadinessResponse =
      failing.length === 0
        ? { status: 'ok' }
        : { status: 'unavailable', checks: Object.fromEntries(failing.map((name) => [name, 'fail'])) };
    res.setHeader('Cache-Control', 'no-store');
    res.status(failing.length === 0 ? 200 : 503).json(body);
  });

  return router;
}
