import request from 'supertest';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Agent, createHarness, type Harness, signedIn } from './identity-harness.js';

// Accounts (features.md#accounts, api-design.md#3-conventions) against a real database. Stage 3
// has no balances: the opening balance is the only amount.

const WALLET = {
  name: 'Wallet',
  currency: 'PLN',
  kind: 'CASH',
  icon: 'wallet',
  color: 'blue',
  openingBalance: '10.5',
  openingDate: '2026-11-01',
};

describe('accounts', () => {
  let h: Harness;
  let agent: Agent;
  let csrf: string;
  let token: string;

  const post = (body: object) =>
    agent.post('/api/v1/accounts').set('X-CSRF-Token', csrf).send(body);
  const patch = (id: string, body: object) =>
    agent.patch(`/api/v1/accounts/${id}`).set('X-CSRF-Token', csrf).send(body);
  const bearer = () => `Bearer ${token}`;

  beforeAll(async () => {
    h = await createHarness();
    const signed = await signedIn(h.app, { username: 'alice' });
    agent = signed.agent;
    csrf = signed.session.csrfToken;
    const created = await agent
      .post('/api/v1/me/api-tokens')
      .set('X-CSRF-Token', csrf)
      .send({
        name: 'accounts',
        permissions: ['accounts:read', 'accounts:create', 'accounts:update', 'accounts:delete'],
      })
      .expect(201);
    token = created.body.secret as string;
  });
  afterAll(() => h.close());

  it('creates, reads, lists, updates and deletes an account', async () => {
    const created = await post(WALLET).expect(201);
    expect(created.headers['etag']).toBe('"1"');
    expect(created.body).toMatchObject({
      name: 'Wallet',
      currency: 'PLN',
      kind: 'CASH',
      customKindLabel: null,
      openingBalance: '10.50',
      openingDate: '2026-11-01',
      includeInNetWorthWidget: true,
      archivedAt: null,
      version: 1,
    });
    expect(created.body).not.toHaveProperty('balance');
    const id = created.body.id as string;

    const read = await agent.get(`/api/v1/accounts/${id}`).expect(200);
    expect(read.body).toEqual(created.body);
    const list = await agent.get('/api/v1/accounts').expect(200);
    expect((list.body.items as { id: string }[]).map((a) => a.id)).toContain(id);

    // Sessions may omit the version.
    const renamed = await patch(id, { name: 'Pocket' }).expect(200);
    expect(renamed.body).toMatchObject({ name: 'Pocket', version: 2 });
    expect(renamed.headers['etag']).toBe('"2"');

    await agent.delete(`/api/v1/accounts/${id}`).set('X-CSRF-Token', csrf).expect(204);
    await agent.get(`/api/v1/accounts/${id}`).expect(404);
  });

  it('appends new accounts at the end', async () => {
    const a = await post({ ...WALLET, name: 'A' }).expect(201);
    const b = await post({ ...WALLET, name: 'B' }).expect(201);
    expect(b.body.sortOrder).toBeGreaterThan(a.body.sortOrder as number);
  });

  it('accepts a client-generated id and rejects a duplicate with ID_CONFLICT', async () => {
    const id = uuidv7();
    const created = await post({ ...WALLET, id }).expect(201);
    expect(created.body.id).toBe(id);
    const duplicate = await post({ ...WALLET, id }).expect(409);
    expect(duplicate.body.code).toBe('ID_CONFLICT');
    // Another user can't take the id either, and learns nothing about the owner.
    const bob = await signedIn(h.app, { username: 'bob' });
    const res = await bob.agent
      .post('/api/v1/accounts')
      .set('X-CSRF-Token', bob.session.csrfToken)
      .send({ ...WALLET, id })
      .expect(409);
    expect(res.body.code).toBe('ID_CONFLICT');
    expect(JSON.stringify(res.body)).not.toContain('Wallet');
  });

  it('checks the opening balance against the currency exponent', async () => {
    const jpy = await post({ ...WALLET, currency: 'JPY', openingBalance: '1.5' }).expect(422);
    expect(jpy.body.code).toBe('VALIDATION_FAILED');
    expect(jpy.body.errors).toEqual([
      expect.objectContaining({ path: ['openingBalance'], code: 'AMOUNT_PRECISION' }),
    ]);
    const ok = await post({ ...WALLET, currency: 'JPY', openingBalance: '1500' }).expect(201);
    expect(ok.body.openingBalance).toBe('1500');
    const bhd = await post({ ...WALLET, currency: 'BHD', openingBalance: '-1.5' }).expect(201);
    expect(bhd.body.openingBalance).toBe('-1.500');

    // Changing the currency revalidates the stored opening balance.
    const pln = await post({ ...WALLET, openingBalance: '1.25' }).expect(201);
    const toJpy = await patch(pln.body.id as string, { currency: 'JPY' }).expect(422);
    expect(toJpy.body.errors[0]).toMatchObject({
      path: ['openingBalance'],
      code: 'AMOUNT_PRECISION',
    });
    const both = await patch(pln.body.id as string, {
      currency: 'JPY',
      openingBalance: '125',
    }).expect(200);
    expect(both.body).toMatchObject({ currency: 'JPY', openingBalance: '125' });
  });

  it('rejects inactive and unknown currencies', async () => {
    const inactive = await post({ ...WALLET, currency: 'HRK' }).expect(422);
    expect(inactive.body.errors[0]).toMatchObject({
      path: ['currency'],
      code: 'CURRENCY_INACTIVE',
    });
    const unknown = await post({ ...WALLET, currency: 'XYZ' }).expect(422);
    // Codes outside ISO 4217 already fail the contract schema.
    expect(unknown.body.errors[0]).toMatchObject({ path: ['currency'] });
    const existing = await post(WALLET).expect(201);
    const change = await patch(existing.body.id as string, { currency: 'HRK' }).expect(422);
    expect(change.body.errors[0]).toMatchObject({ code: 'CURRENCY_INACTIVE' });
  });

  it('enforces the custom kind label rule', async () => {
    await post({ ...WALLET, kind: 'CUSTOM' }).expect(422);
    await post({ ...WALLET, customKindLabel: 'Jar' }).expect(422);
    const custom = await post({ ...WALLET, kind: 'CUSTOM', customKindLabel: 'Jar' }).expect(201);
    const id = custom.body.id as string;
    // Leaving CUSTOM requires clearing the label in the same request.
    const kept = await patch(id, { kind: 'BANK' }).expect(422);
    expect(kept.body.errors[0].path).toEqual(['customKindLabel']);
    const changed = await patch(id, { kind: 'BANK', customKindLabel: null }).expect(200);
    expect(changed.body).toMatchObject({ kind: 'BANK', customKindLabel: null });
    await patch(id, { customKindLabel: 'Jar' }).expect(422);
  });

  it('requires a version from API tokens and reports conflicts with the current state', async () => {
    const created = await post(WALLET).expect(201);
    const id = created.body.id as string;

    const missing = await request(h.app)
      .patch(`/api/v1/accounts/${id}`)
      .set('Authorization', bearer())
      .send({ name: 'Token' })
      .expect(428);
    expect(missing.body.code).toBe('PRECONDITION_REQUIRED');
    const updated = await request(h.app)
      .patch(`/api/v1/accounts/${id}`)
      .set('Authorization', bearer())
      .set('If-Match', '"1"')
      .send({ name: 'Token' })
      .expect(200);
    expect(updated.body.version).toBe(2);

    const stale = await patch(id, { name: 'Late', version: 1 }).expect(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
    expect(stale.body.current).toMatchObject({ id, name: 'Token', version: 2 });
    await agent
      .patch(`/api/v1/accounts/${id}`)
      .set('X-CSRF-Token', csrf)
      .set('If-Match', 'nope')
      .send({ name: 'x' })
      .expect(400);

    await request(h.app)
      .delete(`/api/v1/accounts/${id}`)
      .set('Authorization', bearer())
      .expect(428);
    const deleteConflict = await request(h.app)
      .delete(`/api/v1/accounts/${id}`)
      .set('Authorization', bearer())
      .set('If-Match', '"1"')
      .expect(409);
    expect(deleteConflict.body.current.version).toBe(2);
    await request(h.app)
      .delete(`/api/v1/accounts/${id}`)
      .set('Authorization', bearer())
      .set('If-Match', '"2"')
      .expect(204);
  });

  it('creates accounts with a token (no version needed for creation)', async () => {
    const res = await request(h.app)
      .post('/api/v1/accounts')
      .set('Authorization', bearer())
      .send(WALLET)
      .expect(201);
    expect(res.body.version).toBe(1);
  });

  it('archives and unarchives idempotently', async () => {
    const created = await post(WALLET).expect(201);
    const id = created.body.id as string;
    const archived = await agent
      .post(`/api/v1/accounts/${id}/archive`)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    expect(archived.body.archivedAt).not.toBeNull();
    const again = await agent
      .post(`/api/v1/accounts/${id}/archive`)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    expect(again.body.archivedAt).toBe(archived.body.archivedAt);
    // Archived accounts stay listed (the client filters them).
    const list = await agent.get('/api/v1/accounts').expect(200);
    expect((list.body.items as { id: string }[]).map((a) => a.id)).toContain(id);
    const restored = await agent
      .post(`/api/v1/accounts/${id}/unarchive`)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    expect(restored.body.archivedAt).toBeNull();
    await agent.post(`/api/v1/accounts/${id}/unarchive`).set('X-CSRF-Token', csrf).expect(200);
  });

  it('validates input', async () => {
    const res = await post({ ...WALLET, name: '' }).expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    await post({ ...WALLET, kind: 'LOAN' }).expect(422);
    // A JSON number is rejected: amounts are decimal strings.
    // eslint-disable-next-line monevo/no-float-money -- the float is the input under test
    await post({ ...WALLET, openingBalance: 10.5 }).expect(422);
    await post({ ...WALLET, extra: true }).expect(422);
    await post({ ...WALLET, openingDate: '2026-02-30' }).expect(422);
    await agent.get('/api/v1/accounts/not-a-uuid').expect(404);
  });

  it('requires CSRF for session writes', async () => {
    const res = await agent.post('/api/v1/accounts').send(WALLET).expect(403);
    expect(res.body.code).toBe('CSRF_INVALID');
  });
});
