import request from 'supertest';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomToken, sha256 } from '../src/infra/crypto.js';
import { runSessionsPurge } from '../src/modules/auth/index.js';
import { captureLogger } from '../src/test-support/logger.js';
import { createHarness, type Harness, signedIn } from './identity-harness.js';

// Personal API token lifecycle (api-tokens.md) against a real database.

const MINUTE = 60_000;
const DAY = 86_400_000;

describe('API token lifecycle', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());

  it('creates a token shown once, uses it within its permissions, and revokes it', async () => {
    const { agent, session } = await signedIn(h.app, { username: 'alice', email: 'a@example.com' });
    const created = await agent
      .post('/api/v1/me/api-tokens')
      .set('X-CSRF-Token', session.csrfToken)
      .send({ name: 'Home Assistant', permissions: ['profile:read'] })
      .expect(201);
    const secret = created.body.secret as string;
    expect(secret).toMatch(/^mnv_pat_[A-Za-z0-9_-]{43}$/);
    expect(created.body.token).toMatchObject({ name: 'Home Assistant', status: 'ACTIVE' });

    const list = await agent.get('/api/v1/me/api-tokens').expect(200);
    expect(JSON.stringify(list.body)).not.toContain(secret);
    expect(list.body.items[0].displayPrefix).toBe(secret.slice(0, 14));

    const bearer = (path: string) =>
      request(h.app).get(path).set('Authorization', `Bearer ${secret}`);
    const me = await bearer('/api/v1/me').expect(200);
    expect(me.body.id).toBe(session.user.id);
    expect(me.body).not.toHaveProperty('email');
    await bearer('/api/v1/me/settings').expect(200);

    // Not allowed for tokens: auth, sessions, token management, admin.
    for (const path of ['/api/v1/auth/session', '/api/v1/me/sessions', '/api/v1/me/api-tokens']) {
      const res = await bearer(path).expect(403);
      expect(res.body.code).toBe('API_TOKEN_NOT_ALLOWED');
    }
    await bearer('/api/v1/admin/users').expect(403);
    await request(h.app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${secret}`)
      .send({ displayName: 'x' })
      .expect(403);

    await agent
      .delete(`/api/v1/me/api-tokens/${created.body.token.id}`)
      .set('X-CSRF-Token', session.csrfToken)
      .expect(204);
    const revoked = await bearer('/api/v1/me').expect(401);
    expect(revoked.body.code).toBe('API_TOKEN_REVOKED');
  });

  it('rejects a token after it expires', async () => {
    const { agent, session } = await signedIn(h.app, { username: 'bob' });
    const expiresAt = new Date(h.clock.now().getTime() + 10 * MINUTE).toISOString();
    const created = await agent
      .post('/api/v1/me/api-tokens')
      .set('X-CSRF-Token', session.csrfToken)
      .send({ name: 'short', permissions: ['profile:read'], expiresAt })
      .expect(201);
    const secret = created.body.secret as string;
    await request(h.app).get('/api/v1/me').set('Authorization', `Bearer ${secret}`).expect(200);
    h.clock.advance(11 * MINUTE);
    const res = await request(h.app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${secret}`)
      .expect(401);
    expect(res.body.code).toBe('API_TOKEN_EXPIRED');
    h.clock.advance(-11 * MINUTE);
  });

  it('denies an operation whose permission the token lacks', async () => {
    const { session } = await signedIn(h.app, { username: 'carol' });
    const secret = `mnv_pat_${randomToken(32)}`;
    const now = h.clock.now();
    await h.prisma.$executeRaw`
      INSERT INTO api_tokens
        (id, user_id, name, token_hash, display_prefix, permissions, expires_at, created_at, updated_at)
      VALUES
        (${uuidv7()}::uuid, ${session.user.id}::uuid, 'no permissions', ${sha256(secret)},
         ${secret.slice(0, 14)}, ARRAY[]::text[], NULL, ${now}, ${now})`;
    const res = await request(h.app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${secret}`)
      .expect(403);
    expect(res.body.code).toBe('API_TOKEN_PERMISSION_DENIED');
  });

  it('requires recent authentication to create a token', async () => {
    const { agent, session } = await signedIn(h.app, { username: 'dave' });
    h.clock.advance(16 * MINUTE);
    try {
      const res = await agent
        .post('/api/v1/me/api-tokens')
        .set('X-CSRF-Token', session.csrfToken)
        .send({ name: 'late', permissions: ['profile:read'] })
        .expect(403);
      expect(res.body.code).toBe('REAUTH_REQUIRED');
    } finally {
      h.clock.advance(-16 * MINUTE);
    }
  });

  it('rejects unknown Bearer credentials', async () => {
    const res = await request(h.app)
      .get('/api/v1/me')
      .set('Authorization', 'Bearer not-a-monevo-token')
      .expect(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });
});

describe('admin user management', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());

  it('protects the last admin and deactivates a user everywhere', async () => {
    const admin = await signedIn(h.app, { username: 'root' });
    expect(admin.session.user.role).toBe('ADMIN');
    const user = await signedIn(h.app, { username: 'eve' });
    const csrf = admin.session.csrfToken;

    // The only admin cannot demote themselves.
    const demote = await admin.agent
      .patch(`/api/v1/admin/users/${admin.session.user.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ role: 'USER' })
      .expect(409);
    expect(demote.body.code).toBe('LAST_ADMIN');
    // ...nor deactivate themselves.
    await admin.agent
      .post(`/api/v1/admin/users/${admin.session.user.id}/deactivate`)
      .set('X-CSRF-Token', csrf)
      .expect(403);

    // A non-admin gets 403 on admin routes.
    await user.agent.get('/api/v1/admin/users').expect(403);

    const token = await user.agent
      .post('/api/v1/me/api-tokens')
      .set('X-CSRF-Token', user.session.csrfToken)
      .send({ name: 't', permissions: ['profile:read'] })
      .expect(201);

    const list = await admin.agent.get('/api/v1/admin/users').expect(200);
    expect(list.body.items).toHaveLength(2);

    await admin.agent
      .post(`/api/v1/admin/users/${user.session.user.id}/deactivate`)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    await user.agent.get('/api/v1/auth/session').expect(401);
    await request(h.app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${token.body.secret as string}`)
      .expect(401);

    await admin.agent
      .post(`/api/v1/admin/users/${user.session.user.id}/activate`)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    // Revoked tokens stay revoked after reactivation.
    await request(h.app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${token.body.secret as string}`)
      .expect(401);

    // Promote, then demoting the first admin is allowed.
    await admin.agent
      .patch(`/api/v1/admin/users/${user.session.user.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ role: 'ADMIN' })
      .expect(200);
    await admin.agent
      .patch(`/api/v1/admin/users/${admin.session.user.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ role: 'USER' })
      .expect(200);
  });

  it('requires recent authentication for sensitive admin actions', async () => {
    const admin = await signedIn(h.app, { username: 'eve' });
    const other = await signedIn(h.app, { username: 'zed' });
    h.clock.advance(16 * 60_000);
    try {
      const res = await admin.agent
        .post(`/api/v1/admin/users/${other.session.user.id}/deactivate`)
        .set('X-CSRF-Token', admin.session.csrfToken)
        .expect(403);
      expect(res.body.code).toBe('REAUTH_REQUIRED');
    } finally {
      h.clock.advance(-16 * 60_000);
    }
  });

  it('shows the identity provider status without secrets', async () => {
    const admin = await signedIn(h.app, { username: 'eve' });
    const res = await admin.agent.get('/api/v1/admin/identity-provider').expect(200);
    expect(res.body).toMatchObject({ issuer: h.idp.issuer, discovery: 'OK' });
    expect(JSON.stringify(res.body)).not.toContain('monevo-test-secret');
  });
});

describe('sessions.purge', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());

  it('deletes sessions 30 days and tokens 90 days after they end', async () => {
    const { agent, session } = await signedIn(h.app, { username: 'alice' });
    const token = await agent
      .post('/api/v1/me/api-tokens')
      .set('X-CSRF-Token', session.csrfToken)
      .send({ name: 'old', permissions: ['profile:read'] })
      .expect(201);
    await agent
      .delete(`/api/v1/me/api-tokens/${token.body.token.id}`)
      .set('X-CSRF-Token', session.csrfToken)
      .expect(204);
    await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', session.csrfToken).expect(200);
    const { logger } = captureLogger();

    h.clock.advance(29 * DAY);
    expect(await runSessionsPurge(h.prisma, h.clock, logger)).toEqual({
      sessions: 0,
      apiTokens: 0,
    });
    h.clock.advance(2 * DAY);
    expect(await runSessionsPurge(h.prisma, h.clock, logger)).toEqual({
      sessions: 1,
      apiTokens: 0,
    });
    h.clock.advance(60 * DAY);
    expect(await runSessionsPurge(h.prisma, h.clock, logger)).toEqual({
      sessions: 0,
      apiTokens: 1,
    });
  });
});
