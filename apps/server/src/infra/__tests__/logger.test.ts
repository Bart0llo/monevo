import { describe, expect, it } from 'vitest';
import { captureLogger } from '../../test-support/logger.js';

const SECRET = 'super-secret-value';

describe('logger redaction', () => {
  it.each([
    ['authorization header', { req: { headers: { authorization: `Bearer ${SECRET}` } } }],
    ['cookie header', { req: { headers: { cookie: `__Host-session=${SECRET}` } } }],
    ['CSRF header', { req: { headers: { 'x-csrf-token': SECRET } } }],
    [
      'set-cookie response header',
      { res: { headers: { 'set-cookie': `__Host-session=${SECRET}` } } },
    ],
    ['bare headers.authorization', { headers: { authorization: SECRET } }],
    ['bare headers.cookie', { headers: { cookie: SECRET } }],
    ['bare headers.x-csrf-token', { headers: { 'x-csrf-token': SECRET } }],
    ['bare headers.set-cookie', { headers: { 'set-cookie': SECRET } }],
    ['password', { password: SECRET }],
    ['token', { token: SECRET }],
    ['secret', { secret: SECRET }],
    ['databaseUrl', { databaseUrl: `postgresql://u:${SECRET}@h/d` }],
    ['encryptionKey', { encryptionKey: SECRET }],
    ['nested password', { body: { password: SECRET } }],
    ['nested token', { user: { token: SECRET } }],
    ['nested secret', { oidc: { secret: SECRET } }],
    ['nested databaseUrl', { config: { databaseUrl: SECRET } }],
    ['nested encryptionKey', { config: { encryptionKey: SECRET } }],
    ['clientSecret', { clientSecret: SECRET }],
    ['idToken', { idToken: SECRET }],
    ['refreshToken', { refreshToken: SECRET }],
    ['accessToken', { accessToken: SECRET }],
    ['idTokenHint', { idTokenHint: SECRET }],
    ['idpRefreshToken', { idpRefreshToken: SECRET }],
    ['nonce', { nonce: SECRET }],
    ['codeVerifier', { codeVerifier: SECRET }],
    ['csrfToken', { csrfToken: SECRET }],
    ['tokenHash', { tokenHash: SECRET }],
    ['nested clientSecret', { oidc: { clientSecret: SECRET } }],
    ['nested idToken', { tokens: { idToken: SECRET } }],
    ['nested refreshToken', { tokens: { refreshToken: SECRET } }],
    ['nested accessToken', { tokens: { accessToken: SECRET } }],
    ['nested idTokenHint', { session: { idTokenHint: SECRET } }],
    ['nested idpRefreshToken', { session: { idpRefreshToken: SECRET } }],
    ['nested codeVerifier', { state: { codeVerifier: SECRET } }],
    ['nested csrfToken', { session: { csrfToken: SECRET } }],
    ['nested tokenHash', { apiToken: { tokenHash: SECRET } }],
  ])('redacts %s', (_name, fields) => {
    const { logger, lines } = captureLogger();
    logger.info(fields, 'event');
    const output = JSON.stringify(lines());
    expect(output).not.toContain(SECRET);
    expect(output).toContain('[redacted]');
  });

  it('writes ISO timestamps and level labels', () => {
    const { logger, lines } = captureLogger();
    logger.warn({ event: 'x' }, 'hello');
    const [line] = lines();
    expect(line).toMatchObject({ level: 'warn', msg: 'hello', event: 'x' });
    expect(String(line?.['time'])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
