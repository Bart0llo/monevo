import type { AuthContext } from '../http/guards.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by the request-id middleware for every request (monitoring-and-logging.md#standard-fields). */
      requestId: string;
      /** Set by `requireAuth` (http/guards.ts); undefined on public routes. */
      auth?: AuthContext;
    }
  }
}

export {};
