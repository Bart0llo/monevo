import * as client from 'openid-client';
import type { OidcConfig } from '../config/env.js';

// The OpenID Relying Party (authentication.md#2-oidc-login). All protocol work and token validation
// is done by openid-client; this file only adapts it and classifies failures.

/** Seconds; applies to discovery and every later request made with the configuration. */
const IDP_TIMEOUT_SECONDS = 5;

export type OidcErrorKind =
  /** Network error, timeout, 5xx, or failed discovery. */
  | 'unavailable'
  /** The IdP answered with an OAuth error (e.g. `invalid_grant`). */
  | 'rejected'
  /** The authorization response carried an error (e.g. `access_denied`). */
  | 'denied'
  /** State, nonce, PKCE, signature or claim validation failed. */
  | 'invalid';

export class OidcError extends Error {
  constructor(
    readonly kind: OidcErrorKind,
    readonly oauthError?: string,
    options?: ErrorOptions,
  ) {
    super(`OIDC ${kind}${oauthError ? ` (${oauthError})` : ''}`, options);
    this.name = 'OidcError';
  }
}

export interface IdTokenClaims {
  readonly iss: string;
  readonly sub: string;
  readonly auth_time?: number;
  readonly name?: unknown;
  readonly preferred_username?: unknown;
  readonly email?: unknown;
  readonly groups?: unknown;
}

export interface OidcTokens {
  readonly idToken: string | undefined;
  readonly refreshToken: string | undefined;
  readonly claims: IdTokenClaims | undefined;
}

export interface AuthorizationRequest {
  readonly state: string;
  readonly nonce: string;
  readonly codeChallenge: string;
  readonly prompt?: 'login';
}

export interface CallbackChecks {
  readonly pkceCodeVerifier: string;
  readonly expectedState: string;
  readonly expectedNonce: string;
}

export interface IdpStatus {
  readonly discovery: 'OK' | 'ERROR';
  readonly endSessionSupported: boolean | null;
}

export interface OidcClient {
  readonly config: OidcConfig;
  /** The issuer as reported by discovery (stored on identities). */
  issuer(): Promise<string>;
  authorizationUrl(request: AuthorizationRequest): Promise<URL>;
  exchangeCode(callbackUrl: URL, checks: CallbackChecks): Promise<OidcTokens>;
  refresh(refreshToken: string): Promise<OidcTokens>;
  /** RP-initiated logout URL, or null when the IdP has no end-session endpoint. */
  endSessionUrl(idTokenHint: string | null): Promise<string | null>;
  status(): Promise<IdpStatus>;
}

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  error?: unknown;
  cause?: unknown;
}

/** Walks the cause chain of an openid-client / oauth4webapi / fetch error. */
export function classifyOidcError(error: unknown): OidcError {
  if (error instanceof OidcError) return error;
  let current: unknown = error;
  for (let depth = 0; depth < 6 && typeof current === 'object' && current !== null; depth++) {
    const e = current as ErrorLike;
    const oauthError = typeof e.error === 'string' ? e.error : undefined;
    if (e.name === 'AuthorizationResponseError') {
      return new OidcError('denied', oauthError, { cause: error });
    }
    if (e.name === 'ResponseBodyError') {
      const status = typeof e.status === 'number' ? e.status : 400;
      return new OidcError(status >= 500 ? 'unavailable' : 'rejected', oauthError, {
        cause: error,
      });
    }
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return new OidcError('unavailable', undefined, { cause: error });
    }
    if (current instanceof TypeError && /fetch/i.test(String(e.message))) {
      return new OidcError('unavailable', undefined, { cause: error });
    }
    if (e.cause instanceof Response && e.cause.status >= 500) {
      return new OidcError('unavailable', undefined, { cause: error });
    }
    current = e.cause;
  }
  return new OidcError('invalid', undefined, { cause: error });
}

function toTokens(response: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers) {
  const claims = response.claims();
  return {
    idToken: response.id_token,
    refreshToken: response.refresh_token,
    claims: claims as IdTokenClaims | undefined,
  };
}

export function createOidcClient(config: OidcConfig): OidcClient {
  let cached: client.Configuration | undefined;
  let pending: Promise<client.Configuration> | undefined;

  /** Discovery, cached after the first success; failures are not cached. */
  async function configuration(): Promise<client.Configuration> {
    if (cached) return cached;
    pending ??= (async () => {
      const server = new URL(config.issuer);
      const execute: ((c: client.Configuration) => void)[] = [client.enableNonRepudiationChecks];
      if (server.protocol === 'http:') execute.push(client.allowInsecureRequests);
      try {
        const result = await client.discovery(
          server,
          config.clientId,
          config.clientSecret,
          config.clientSecret === undefined
            ? client.None()
            : client.ClientSecretBasic(config.clientSecret),
          { execute, timeout: IDP_TIMEOUT_SECONDS },
        );
        cached = result;
        return result;
      } catch (error) {
        throw new OidcError('unavailable', undefined, { cause: error });
      } finally {
        pending = undefined;
      }
    })();
    return pending;
  }

  return {
    config,
    async issuer() {
      return (await configuration()).serverMetadata().issuer;
    },
    async authorizationUrl(request) {
      const c = await configuration();
      return client.buildAuthorizationUrl(c, {
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: config.scopes.join(' '),
        state: request.state,
        nonce: request.nonce,
        code_challenge: request.codeChallenge,
        code_challenge_method: 'S256',
        ...(request.prompt ? { prompt: request.prompt } : {}),
      });
    },
    async exchangeCode(callbackUrl, checks) {
      const c = await configuration();
      try {
        const response = await client.authorizationCodeGrant(c, callbackUrl, {
          pkceCodeVerifier: checks.pkceCodeVerifier,
          expectedState: checks.expectedState,
          expectedNonce: checks.expectedNonce,
          idTokenExpected: true,
        });
        return toTokens(response);
      } catch (error) {
        throw classifyOidcError(error);
      }
    },
    async refresh(refreshToken) {
      const c = await configuration();
      try {
        return toTokens(await client.refreshTokenGrant(c, refreshToken));
      } catch (error) {
        throw classifyOidcError(error);
      }
    },
    async endSessionUrl(idTokenHint) {
      const c = await configuration();
      if (!c.serverMetadata().end_session_endpoint) return null;
      return client
        .buildEndSessionUrl(c, {
          client_id: config.clientId,
          post_logout_redirect_uri: config.postLogoutRedirectUri,
          ...(idTokenHint ? { id_token_hint: idTokenHint } : {}),
        })
        .toString();
    },
    async status() {
      try {
        const c = await configuration();
        return {
          discovery: 'OK',
          endSessionSupported: Boolean(c.serverMetadata().end_session_endpoint),
        };
      } catch {
        return { discovery: 'ERROR', endSessionSupported: null };
      }
    },
  };
}
