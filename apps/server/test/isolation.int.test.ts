import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS_EXTENSION } from '@monevo/contracts';
import { buildOpenApiDocument } from '../src/openapi/document.js';
import { type Agent, createHarness, type Harness, signedIn } from './identity-harness.js';

// Isolation harness (authorization-and-data-isolation.md): iterates every operation in the OpenAPI
// registry and checks authentication, token restrictions, admin-only access and that another
// user's resource ids answer 404. New owned endpoints are covered automatically; the self-test
// fails when an operation is not classified.

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

interface Operation {
  readonly method: Method;
  readonly path: string;
  readonly public: boolean;
  readonly tokenAllowed: boolean;
  readonly permissions: readonly string[];
  readonly admin: boolean;
}

function operations(): Operation[] {
  const doc = buildOpenApiDocument();
  const result: Operation[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of ['get', 'post', 'patch', 'put', 'delete'] as const) {
      const op = (item as Record<string, unknown>)[method] as
        { security?: Record<string, unknown>[]; [key: string]: unknown } | undefined;
      if (!op) continue;
      const security = op.security ?? [];
      result.push({
        method,
        path,
        public: security.length === 0,
        tokenAllowed: security.some((entry) => 'apiToken' in entry),
        permissions: (op[PERMISSIONS_EXTENSION] as string[] | undefined) ?? [],
        admin: path.startsWith('/admin/'),
      });
    }
  }
  return result;
}

/** Bodies that pass validation, so a 404 is about ownership, not input. */
const BODIES: Record<string, object> = {
  'patch /me/api-tokens/{id}': { name: 'renamed' },
  'patch /admin/users/{id}': { role: 'USER' },
  'patch /me': { displayName: 'x' },
  'patch /me/settings': { theme: 'DARK', version: 1 },
  'post /me/api-tokens': { name: 't', permissions: ['profile:read'] },
};

function call(agent: Agent, op: Operation, path: string) {
  const target = `/api/v1${path}`;
  const req = agent[op.method](target);
  const body = BODIES[`${op.method} ${op.path}`];
  return body ? req.send(body) : req;
}

const OPERATIONS = operations();
const OWNED = OPERATIONS.filter((op) => !op.public);
const PLACEHOLDER = '01900000-0000-7000-8000-000000000000';

describe('isolation harness', () => {
  let h: Harness;
  let alice: { agent: Agent; csrf: string; id: string; token: string; tokenId: string };
  let bob: { agent: Agent; csrf: string; id: string; tokenId: string; sessionId: string };

  beforeAll(async () => {
    h = await createHarness();
    // The first user is ADMIN; alice and bob are regular users.
    await signedIn(h.app, { username: 'root' });
    const a = await signedIn(h.app, { username: 'alice' });
    const b = await signedIn(h.app, { username: 'bob' });
    const create = (agent: Agent, csrf: string) =>
      agent
        .post('/api/v1/me/api-tokens')
        .set('X-CSRF-Token', csrf)
        .send({ name: 'iso', permissions: ['profile:read'] })
        .expect(201);
    const aToken = await create(a.agent, a.session.csrfToken);
    const bToken = await create(b.agent, b.session.csrfToken);
    const bSessions = await b.agent.get('/api/v1/me/sessions').expect(200);
    alice = {
      agent: a.agent,
      csrf: a.session.csrfToken,
      id: a.session.user.id,
      token: aToken.body.secret as string,
      tokenId: aToken.body.token.id as string,
    };
    bob = {
      agent: b.agent,
      csrf: b.session.csrfToken,
      id: b.session.user.id,
      tokenId: bToken.body.token.id as string,
      sessionId: bSessions.body.items[0].id as string,
    };
  });
  afterAll(() => h.close());

  it('self-test: classifies every documented operation', () => {
    expect(OPERATIONS.length).toBeGreaterThan(20);
    for (const op of OPERATIONS) {
      if (op.tokenAllowed)
        expect(op.permissions.length, `${op.method} ${op.path}`).toBeGreaterThan(0);
      if (op.path.includes('{') && !op.admin && !op.public) {
        expect(foreignId(op), `${op.method} ${op.path} has no foreign id`).toBeDefined();
      }
    }
  });

  function concrete(path: string, id = PLACEHOLDER): string {
    return path.replace(/\{[^}]+\}/g, id);
  }

  function foreignId(op: Operation): string | undefined {
    if (op.path.startsWith('/me/sessions/{id}')) return bob.sessionId;
    if (op.path.startsWith('/me/api-tokens/{id}')) return bob.tokenId;
    return undefined;
  }

  it.each(OWNED.map((op) => [`${op.method.toUpperCase()} ${op.path}`, op] as const))(
    '%s requires authentication',
    async (_name, op) => {
      const res = await call(request(h.app), op, concrete(op.path));
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    },
  );

  it.each(OWNED.map((op) => [`${op.method.toUpperCase()} ${op.path}`, op] as const))(
    '%s honours API token restrictions',
    async (_name, op) => {
      const res = await call(request(h.app), op, concrete(op.path)).set(
        'Authorization',
        `Bearer ${alice.token}`,
      );
      if (op.tokenAllowed) {
        expect(res.status, JSON.stringify(res.body)).toBeLessThan(400);
      } else {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('API_TOKEN_NOT_ALLOWED');
      }
    },
  );

  it.each(
    OWNED.filter((op) => op.admin).map(
      (op) => [`${op.method.toUpperCase()} ${op.path}`, op] as const,
    ),
  )('%s is admin-only', async (_name, op) => {
    const res = await call(alice.agent, op, concrete(op.path, bob.id)).set(
      'X-CSRF-Token',
      alice.csrf,
    );
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it.each(
    OWNED.filter((op) => op.path.includes('{') && !op.admin).map(
      (op) => [`${op.method.toUpperCase()} ${op.path}`, op] as const,
    ),
  )("%s answers 404 for another user's id", async (_name, op) => {
    const id = foreignId(op);
    if (!id) throw new Error('unclassified');
    const res = await call(alice.agent, op, concrete(op.path, id)).set('X-CSRF-Token', alice.csrf);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it("does not leak another user's settings, sessions or tokens in lists", async () => {
    const sessions = await alice.agent.get('/api/v1/me/sessions').expect(200);
    expect(JSON.stringify(sessions.body)).not.toContain(bob.sessionId);
    const tokens = await alice.agent.get('/api/v1/me/api-tokens').expect(200);
    const items = (tokens.body as { items: { id: string }[] }).items;
    expect(items.map((t) => t.id)).toEqual([alice.tokenId]);
    const me = await alice.agent.get('/api/v1/me').expect(200);
    expect(me.body.id).toBe(alice.id);
    // bob's resources are still intact.
    await bob.agent.get('/api/v1/me/api-tokens').expect(200);
    const bobTokens = await bob.agent.get('/api/v1/me/api-tokens').expect(200);
    expect(bobTokens.body.items[0].status).toBe('ACTIVE');
    expect(bob.csrf).toBeTruthy();
  });
});
