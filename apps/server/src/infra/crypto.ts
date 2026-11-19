import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

// Small wrappers over Node crypto (security.md#secrets). No custom primitives: SHA-256 for
// high-entropy tokens, AES-256-GCM for secrets at rest, HKDF for derived keys.

const ENVELOPE_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function sha256(value: string | Buffer): Buffer {
  return createHash('sha256').update(value).digest();
}

/** `bytes` random bytes from the CSPRNG, base64url without padding. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Constant-time comparison of two strings (false on length mismatch). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** A purpose-bound 32-byte key derived from `APP_ENCRYPTION_KEY`. */
export function deriveKey(masterKey: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), `monevo:${purpose}`, 32));
}

/** AES-256-GCM envelope: version (1 byte) ‖ IV (12) ‖ tag (16) ‖ ciphertext. */
export function encrypt(key: Buffer, plaintext: string | Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.from([ENVELOPE_VERSION]), iv, cipher.getAuthTag(), ciphertext]);
}

/** Opens an envelope from `encrypt`; undefined when it is malformed or was tampered with. */
export function decrypt(key: Buffer, envelope: Uint8Array): Buffer | undefined {
  const data = Buffer.from(envelope);
  if (data.length < 1 + IV_BYTES + TAG_BYTES || data[0] !== ENVELOPE_VERSION) return undefined;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(1, 1 + IV_BYTES));
    decipher.setAuthTag(data.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES));
    return Buffer.concat([
      decipher.update(data.subarray(1 + IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]);
  } catch {
    return undefined;
  }
}

export function encryptString(key: Buffer, plaintext: string): Buffer {
  return encrypt(key, Buffer.from(plaintext, 'utf8'));
}

export function decryptString(key: Buffer, envelope: Uint8Array): string | undefined {
  return decrypt(key, envelope)?.toString('utf8');
}
