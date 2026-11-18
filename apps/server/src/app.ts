import express, { type Express } from 'express';
import type { Config } from './config/env.js';
import { accessLog } from './http/access-log.js';
import { errorHandler, notFound } from './http/errors.js';
import { requestId } from './http/request-id.js';
import { cors, securityHeaders } from './http/security.js';
import { webApp } from './http/static.js';
import type { Logger } from './infra/logger.js';
import { healthRouter, type ReadinessChecker } from './modules/health/index.js';
import { API_BASE_PATH, buildOpenApiDocument } from './openapi/document.js';
import { openApiRouter } from './openapi/routes.js';

export type AppConfig = Pick<Config, 'appUrl' | 'trustProxy' | 'corsAllowedOrigins' | 'apiDocsEnabled'>;

export interface AppDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly readiness: ReadinessChecker;
  /** Directory of the built web app; static hosting is skipped when it has no index.html. */
  readonly webRoot?: string;
}

export const JSON_BODY_LIMIT = '1mb';

/** Builds the Express app without listening (backend-architecture.md#11-testability). */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', deps.config.trustProxy);

  app.use(requestId());
  app.use(accessLog(deps.logger));
  app.use(securityHeaders({ https: deps.config.appUrl.protocol === 'https:' }));

  const api = express.Router();
  api.use(cors(deps.config.corsAllowedOrigins));
  api.use(express.json({ limit: JSON_BODY_LIMIT }));
  api.use(healthRouter(deps.readiness));
  if (deps.config.apiDocsEnabled) api.use(openApiRouter(buildOpenApiDocument()));
  app.use(API_BASE_PATH, api);
  // Unknown API paths are always a problem+json 404, never the SPA.
  app.use('/api', notFound());

  const web = deps.webRoot === undefined ? undefined : webApp(deps.webRoot);
  if (web) app.use(web);

  app.use(notFound());
  app.use(errorHandler(deps.logger));
  return app;
}
