import { z } from 'zod';
import { OIDC_INTENTS } from '@monevo/contracts';
import { decrypt, deriveKey, encrypt } from '../../infra/crypto.js';

// The sealed OIDC transaction cookie (authentication.md#endpoints): AES-256-GCM with a key derived
// from APP_ENCRYPTION_KEY, valid for 10 minutes, cleared by the callback.

export const OIDC_STATE_TTL_MS = 10 * 60 * 1000;

const StatePayloadSchema = z.object({
  state: z.string().min(1),
  nonce: z.string().min(1),
  verifier: z.string().min(1),
  returnTo: z.string(),
  intent: z.enum(OIDC_INTENTS),
  locale: z.string().nullable(),
  timeZone: z.string().nullable(),
  startedAt: z.number().int(),
  /** The session being re-authenticated (intent `reauth`). */
  sessionId: z.string().nullable(),
});

export type OidcStatePayload = z.infer<typeof StatePayloadSchema>;

export interface OidcStateSealer {
  seal(payload: OidcStatePayload): string;
  /** Undefined when missing, tampered with, malformed, or older than 10 minutes. */
  open(value: string | undefined, now: Date): OidcStatePayload | undefined;
}

export function createOidcStateSealer(encryptionKey: Buffer): OidcStateSealer {
  const key = deriveKey(encryptionKey, 'oidc-state');
  return {
    seal(payload) {
      return encrypt(key, JSON.stringify(payload)).toString('base64url');
    },
    open(value, now) {
      if (!value) return undefined;
      const plaintext = decrypt(key, Buffer.from(value, 'base64url'));
      if (!plaintext) return undefined;
      let json: unknown;
      try {
        json = JSON.parse(plaintext.toString('utf8'));
      } catch {
        return undefined;
      }
      const parsed = StatePayloadSchema.safeParse(json);
      if (!parsed.success) return undefined;
      const age = now.getTime() - parsed.data.startedAt;
      if (age < 0 || age > OIDC_STATE_TTL_MS) return undefined;
      return parsed.data;
    },
  };
}

/** A same-origin path to return to after sign-in; anything else becomes `/`. */
export function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/';
  }
  if (value.includes('\\') || [...value].some((char) => char.charCodeAt(0) < 0x20)) return '/';
  // Never bounce back into the OIDC endpoints or the login page.
  if (value.startsWith('/api/') || value === '/login' || value.startsWith('/login?')) return '/';
  return value;
}
