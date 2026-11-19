import type { Request, RequestHandler } from 'express';
import type { ApiTokenPermission, UserRole } from '@monevo/contracts';
import { AppError } from './errors.js';

// Route guards (authentication.md#6-request-authentication-pipeline). The auth module implements
// them; routers receive a `Guards` instance as a parameter so modules never import each other in a
// cycle. Authentication happens inside the guards: public routes never parse credentials.

export interface SessionCredential {
  readonly type: 'SESSION';
  readonly sessionId: string;
  readonly reauthenticatedAt: Date | null;
  readonly csrfToken: string;
}

export interface ApiTokenCredential {
  readonly type: 'API_TOKEN';
  readonly apiTokenId: string;
  readonly tokenName: string;
  readonly permissions: readonly string[];
}

export interface AuthContext {
  readonly userId: string;
  /** Effective role: always `USER` for API tokens. */
  readonly role: UserRole;
  readonly credential: SessionCredential | ApiTokenCredential;
}

export interface RequireAuthOptions {
  /** Makes the route available to API tokens that hold every listed permission. */
  readonly permissions?: readonly ApiTokenPermission[];
}

export interface Guards {
  /** Authenticates the request (session cookie or `mnv_pat_` token), rate limits, checks CSRF. */
  requireAuth(options?: RequireAuthOptions): RequestHandler[];
  requireRole(role: 'ADMIN'): RequestHandler;
  /** `403 REAUTH_REQUIRED` unless the session re-authenticated within the recent-auth window. */
  requireRecentAuth(): RequestHandler;
}

/** The authenticated context; only valid behind `requireAuth`. */
export function authOf(req: Request): AuthContext {
  if (!req.auth) throw new AppError('UNAUTHENTICATED');
  return req.auth;
}

/** The session credential; only valid on session-only routes. */
export function sessionOf(req: Request): SessionCredential & { userId: string } {
  const auth = authOf(req);
  if (auth.credential.type !== 'SESSION') throw new AppError('API_TOKEN_NOT_ALLOWED');
  return { ...auth.credential, userId: auth.userId };
}
