export interface MockIdpClient {
  readonly clientId: string;
  /** Omit for a public client (token endpoint auth `none`). */
  readonly clientSecret?: string | undefined;
  readonly redirectUris: readonly string[];
  readonly postLogoutRedirectUris?: readonly string[] | undefined;
}

export interface MockIdpOptions {
  /** 0 or omitted picks a free port. */
  readonly port?: number;
  readonly host?: string;
  /** Defaults to `http://localhost:<port>`. */
  readonly issuer?: string;
  readonly clients?: readonly MockIdpClient[];
}

export interface MockIdp {
  readonly issuer: string;
  readonly port: number;
  /** Revokes every refresh-token family of the subject; returns how many. */
  revoke(sub: string): number;
  /** While down, every OIDC endpoint answers 503. */
  setDown(down: boolean): void;
  /** Signs new tokens with a fresh key (the previous key stays in the JWKS). */
  rotateKeys(): void;
  /** In-process only: issue ID tokens with a bad signature or a wrong nonce until reset (null). */
  misbehave(mode: 'bad-signature' | 'wrong-nonce' | null): void;
  close(): Promise<void>;
}

export function startMockIdp(options?: MockIdpOptions): Promise<MockIdp>;
