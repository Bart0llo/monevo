import express, { type Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import type { OpenApiDocument } from './document.js';

/** `/openapi.json` and the Swagger UI at `/docs` (both only when API_DOCS_ENABLED). */
export function openApiRouter(document: OpenApiDocument): Router {
  const router = express.Router();
  router.get('/openapi.json', (_req, res) => {
    res.json(document);
  });
  router.use(
    '/docs',
    swaggerUi.serveFiles(document),
    swaggerUi.setup(document, {
      customSiteTitle: 'Monevo API',
      swaggerOptions: { url: undefined },
    }),
  );
  return router;
}
