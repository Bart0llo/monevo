import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type Agent,
  createHarness,
  type Harness,
  sessionOf,
  signedIn,
  signIn,
  startFlow,
  submitIdpForm,
} from './identity-harness.js';

// OIDC flows against the mock IdP (implementation-stages.md Stage 2, authentication.md).

const MINUTE = 60_000;
const DAY = 86_400_000;

async function callbackFor(agent: Agent, username: string): Promise<string> {
  return submitIdpForm(await startFlow(agent), { username });
}

async function loginError(agent: Agent, path: string): Promise<string> {
  const res = await agent.get(path).expect(302);
  return String(res.headers['location']);
}

interface UserRow {
  id: string;
  role: string;
  email: string | null;
  display_name: string;
  status: string;
}

async function userRows(h: Harness): Promise<UserRow[]> {
  return h.prisma.$queryRaw<UserRow[]>`
    SELECT id, role, email, display_name, status FROM users ORDER BY created_at, id`;
}

async function sessionRow(h: Harness, userId: string) {
  const rows = await h.prisma.$queryRaw<
    {
      revoked_reason: string | null;
      idp_checked_at: Date | null;
      idp_refresh_token: Buffer | null;
    }[]
  >`SELECT revoked_reason, idp_checked_at, idp_refresh_token FROM sessions
    WHERE user_id = ${userId}::uuid ORDER BY created_at DESC LIMIT 1`;
  return rows[0];
}

describe('OIDC login and provisioning', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());

  it('provisions the first user as ADMIN with the locale and time zone hints', async () => {
    const agent = request.agent(h.app);
    const location = await signIn(
      agent,
      { username: 'alice', name: 'Alice A.', email: 'shared@example.com' },
      { returnTo: '/settings/profile', locale: 'pl', timeZone: 'Europe/Warsaw' },
    );
    expect(location).toBe('/settings/profile');
    const session = await sessionOf(agent);
    expect(session.user).toMatchObject({
      displayName: 'Alice A.',
      email: 'shared@example.com',
      role: 'ADMIN',
    });
    expect(session.onboardingRequired).toBe(true);
    expect(session.csrfToken).toBeTruthy();
    const settings = await agent.get('/api/v1/me/settings').expect(200);
    expect(settings.body).toMatchObject({ locale: 'pl', timeZone: 'Europe/Warsaw' });
  });

  it('reuses the user on the next login and never links by email', async () => {
    await signIn(request.agent(h.app), { username: 'alice', email: 'alice@new.example.com' });
    const { session } = await signedIn(h.app, { username: 'mallory', email: 'shared@example.com' });
    expect(session.user.role).toBe('USER');
    const users = await userRows(h);
    expect(users).toHaveLength(2);
    expect(users[0]).toMatchObject({ email: 'alice@new.example.com', role: 'ADMIN' });
    expect(users[1]).toMatchObject({ email: 'shared@example.com', role: 'USER' });
    expect(users[1]?.display_name).toBe('mallory');
  });

  it('falls back to en/UTC for invalid hints and rejects open redirects', async () => {
    const agent = request.agent(h.app);
    const location = await signIn(
      agent,
      { username: 'carol' },
      { returnTo: 'https://evil.example.com/', locale: 'xx', timeZone: 'Mars/Base' },
    );
    expect(location).toBe('/');
    const settings = await agent.get('/api/v1/me/settings').expect(200);
    expect(settings.body).toMatchObject({ locale: 'en', timeZone: 'UTC' });
  });

  it('replaces the previous session of the same browser', async () => {
    const { agent, session } = await signedIn(h.app, { username: 'dave' });
    await signIn(agent, { username: 'dave' });
    const rows = await h.prisma.$queryRaw<{ revoked_reason: string | null }[]>`
      SELECT revoked_reason FROM sessions WHERE user_id = ${session.user.id}::uuid
      ORDER BY created_at`;
    expect(rows.map((row) => row.revoked_reason)).toEqual(['REPLACED', null]);
  });

  it('fails with login_failed when the state cookie is missing', async () => {
    const path = await callbackFor(request.agent(h.app), 'erin');
    expect(await loginError(request.agent(h.app), path)).toBe('/login?error=login_failed');
  });

  it('fails with login_failed on a state mismatch', async () => {
    const agent = request.agent(h.app);
    const path = await callbackFor(agent, 'erin');
    const tampered = path.replace(/state=[^&]+/, 'state=tampered');
    expect(await loginError(agent, tampered)).toBe('/login?error=login_failed');
  });

  it('fails with login_failed on a nonce mismatch', async () => {
    h.idp.misbehave('wrong-nonce');
    try {
      const agent = request.agent(h.app);
      expect(await loginError(agent, await callbackFor(agent, 'erin'))).toBe(
        '/login?error=login_failed',
      );
    } finally {
      h.idp.misbehave(null);
    }
  });

  it('fails with login_failed on a wrong ID token signature', async () => {
    h.idp.misbehave('bad-signature');
    try {
      const agent = request.agent(h.app);
      expect(await loginError(agent, await callbackFor(agent, 'erin'))).toBe(
        '/login?error=login_failed',
      );
    } finally {
      h.idp.misbehave(null);
    }
    expect((await userRows(h)).some((user) => user.display_name === 'erin')).toBe(false);
  });

  it('maps a denied authorization to access_denied', async () => {
    const agent = request.agent(h.app);
    const path = await submitIdpForm(await startFlow(agent), { username: 'gina' }, 'deny');
    expect(await loginError(agent, path)).toBe('/login?error=access_denied');
  });

  it('reports idp_unavailable when the IdP is down', async () => {
    const agent = request.agent(h.app);
    const authorizeUrl = await startFlow(agent);
    const page = await fetch(authorizeUrl);
    expect(page.status).toBe(200);
    const path = await submitIdpForm(authorizeUrl, { username: 'gina' });
    h.idp.setDown(true);
    try {
      expect(await loginError(agent, path)).toBe('/login?error=idp_unavailable');
    } finally {
      h.idp.setDown(false);
    }
  });

  it('refuses a deactivated user with account_deactivated', async () => {
    const { session } = await signedIn(h.app, { username: 'henry' });
    await h.prisma
      .$executeRaw`UPDATE users SET status = 'DEACTIVATED' WHERE id = ${session.user.id}::uuid`;
    const agent = request.agent(h.app);
    expect(await loginError(agent, await callbackFor(agent, 'henry'))).toBe(
      '/login?error=account_deactivated',
    );
  });

  it('returns the provider name from /auth/config', async () => {
    const res = await request(h.app).get('/api/v1/auth/config').expect(200);
    expect(res.body).toEqual({ providerName: 'Mock IdP' });
  });
});

describe('signing key rotation', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a new kid once the cached JWKS may be refetched', async () => {
    await signedIn(h.app, { username: 'alice' });
    h.idp.rotateKeys();
    // openid-client refetches the JWKS for an unknown kid only when its copy is ≥ 60 s old.
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 61_000 });
    const { session } = await signedIn(h.app, { username: 'bob' });
    expect(session.user.displayName).toBe('bob');
  });
});

describe('logout', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());

  it('revokes the session and returns the RP-initiated logout URL', async () => {
    const { agent, session } = await signedIn(h.app, { username: 'alice' });
    await agent.post('/api/v1/auth/logout').expect(403);
    const res = await agent
      .post('/api/v1/auth/logout')
      .set('X-CSRF-Token', session.csrfToken)
      .expect(200);
    const url = new URL(res.body.endSessionUrl as string);
    expect(url.origin + url.pathname).toBe(`${h.idp.issuer}/logout`);
    expect(url.searchParams.get('id_token_hint')).toBeTruthy();
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(
      h.config.oidc.postLogoutRedirectUri,
    );
    await agent.get('/api/v1/auth/session').expect(401);
    expect((await sessionRow(h, session.user.id))?.revoked_reason).toBe('LOGOUT');
  });
});

describe('roles from the admin group', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness({ adminGroup: 'monevo-admins' });
  });
  afterAll(() => h.close());

  it('does not make the first user an admin without the group', async () => {
    const { session } = await signedIn(h.app, { username: 'alice', groups: ['staff'] });
    expect(session.user.role).toBe('USER');
  });

  it('grants and removes ADMIN from the group claim at each login', async () => {
    const { session } = await signedIn(h.app, { username: 'bob', groups: ['monevo-admins'] });
    expect(session.user.role).toBe('ADMIN');
    const again = await signedIn(h.app, { username: 'bob', groups: [] });
    expect(again.session.user.role).toBe('USER');
  });

  it('refuses role changes in the admin UI', async () => {
    const { agent, session } = await signedIn(h.app, {
      username: 'root',
      groups: ['monevo-admins'],
    });
    const users = await userRows(h);
    const target = users.find((user) => user.display_name === 'alice');
    await agent
      .patch(`/api/v1/admin/users/${target?.id}`)
      .set('X-CSRF-Token', session.csrfToken)
      .send({ role: 'ADMIN' })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('ROLE_MANAGED_BY_IDP'));
  });
});

describe('re-authentication', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());

  it('marks the session recently authenticated and keeps it on a different account', async () => {
    const { agent } = await signedIn(h.app, { username: 'alice' });
    h.clock.advance(20 * MINUTE);
    const before = await sessionOf(agent);
    expect(before.recentAuthUntil).toBeNull();
    h.clock.advance(-20 * MINUTE);

    const mismatch = await submitIdpForm(await startFlow(agent, { intent: 'reauth' }), {
      username: 'someone-else',
    });
    expect(await loginError(agent, mismatch)).toBe('/login?error=reauth_mismatch');
    await agent.get('/api/v1/auth/session').expect(200);

    const authorizeUrl = await startFlow(agent, { intent: 'reauth', returnTo: '/settings' });
    expect(authorizeUrl.searchParams.get('prompt')).toBe('login');
    const ok = await submitIdpForm(authorizeUrl, { username: 'alice' });
    expect(await loginError(agent, ok)).toBe('/settings');
    const after = await sessionOf(agent);
    expect(after.recentAuthUntil).not.toBeNull();
  });

  it('rejects reauth without a session', async () => {
    await request(h.app).get('/api/v1/auth/oidc/start').query({ intent: 'reauth' }).expect(401);
  });
});

describe('IdP revalidation', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());

  it('refreshes after 15 minutes and stores the rotated refresh token', async () => {
    const { agent, session } = await signedIn(h.app, { username: 'alice' });
    const before = await sessionRow(h, session.user.id);
    h.clock.advance(16 * MINUTE);
    await agent.get('/api/v1/auth/session').expect(200);
    const after = await sessionRow(h, session.user.id);
    expect(after?.idp_checked_at?.getTime()).toBeGreaterThan(
      before?.idp_checked_at?.getTime() ?? 0,
    );
    expect(
      Buffer.from(after?.idp_refresh_token ?? []).equals(
        Buffer.from(before?.idp_refresh_token ?? []),
      ),
    ).toBe(false);
  });

  it('fails open while the IdP is down', async () => {
    const { agent } = await signedIn(h.app, { username: 'bob' });
    h.clock.advance(16 * MINUTE);
    h.idp.setDown(true);
    try {
      await agent.get('/api/v1/auth/session').expect(200);
    } finally {
      h.idp.setDown(false);
    }
  });

  it('ends the session when the IdP revokes the grant', async () => {
    const { agent, session } = await signedIn(h.app, { username: 'carol' });
    expect(h.idp.revoke('carol')).toBeGreaterThan(0);
    await agent.get('/api/v1/auth/session').expect(200);
    h.clock.advance(16 * MINUTE);
    await agent.get('/api/v1/auth/session').expect(401);
    expect((await sessionRow(h, session.user.id))?.revoked_reason).toBe('IDP_REVOKED');
  });
});

describe('session lifetime and CSRF', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());

  it('expires an idle session', async () => {
    const { agent } = await signedIn(h.app, { username: 'alice' });
    h.clock.advance(31 * DAY);
    await agent.get('/api/v1/auth/session').expect(401);
  });

  it('requires the CSRF header on unsafe session requests', async () => {
    const { agent, session } = await signedIn(h.app, { username: 'bob' });
    await agent
      .patch('/api/v1/me')
      .send({ displayName: 'Bobby' })
      .expect(403)
      .expect((res) => expect(res.body.code).toBe('CSRF_INVALID'));
    await agent
      .patch('/api/v1/me')
      .set('X-CSRF-Token', 'wrong')
      .send({ displayName: 'Bobby' })
      .expect(403);
    const ok = await agent
      .patch('/api/v1/me')
      .set('X-CSRF-Token', session.csrfToken)
      .send({ displayName: 'Bobby' })
      .expect(200);
    expect(ok.body.displayName).toBe('Bobby');
  });
});

describe('rate limits', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness({
      limits: {
        oidc: { windowMs: 60_000, limit: 2 },
        invalidCredential: { windowMs: 60_000, limit: 2 },
      },
    });
  });
  afterAll(() => h.close());

  it('limits /auth/oidc/* per IP', async () => {
    const agent = request.agent(h.app);
    await agent.get('/api/v1/auth/oidc/start').expect(302);
    await agent.get('/api/v1/auth/oidc/start').expect(302);
    const res = await agent.get('/api/v1/auth/oidc/start').expect(429);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeTruthy();
  });

  it('limits invalid credentials per IP', async () => {
    const bad = () => request(h.app).get('/api/v1/me').set('Authorization', 'Bearer mnv_pat_bad');
    await bad().expect(401);
    await bad().expect(401);
    await bad().expect(429);
  });
});
