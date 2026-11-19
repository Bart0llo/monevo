import request from 'supertest';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Agent, createHarness, type Harness, signedIn } from './identity-harness.js';

// Categories (features.md#categories): two levels, a subcategory has its parent's type, an
// archived parent hides its children (which keep their own state). Real database.

interface CategoryDto {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  sortOrder: number;
  archivedAt: string | null;
  version: number;
}

describe('categories', () => {
  let h: Harness;
  let agent: Agent;
  let csrf: string;

  const create = (body: object) =>
    agent
      .post('/api/v1/categories')
      .set('X-CSRF-Token', csrf)
      .send({ icon: 'wallet', color: 'green', ...body });
  const patch = (id: string, body: object) =>
    agent.patch(`/api/v1/categories/${id}`).set('X-CSRF-Token', csrf).send(body);
  const action = (id: string, name: 'archive' | 'unarchive') =>
    agent.post(`/api/v1/categories/${id}/${name}`).set('X-CSRF-Token', csrf);
  const list = async (): Promise<CategoryDto[]> =>
    (await agent.get('/api/v1/categories').expect(200)).body.items as CategoryDto[];
  const top = async (name: string, type = 'EXPENSE'): Promise<CategoryDto> =>
    (await create({ name, type }).expect(201)).body as CategoryDto;
  const child = async (parent: CategoryDto, name: string): Promise<CategoryDto> =>
    (await create({ name, type: parent.type, parentId: parent.id }).expect(201))
      .body as CategoryDto;

  beforeAll(async () => {
    h = await createHarness();
    const signed = await signedIn(h.app, { username: 'alice' });
    agent = signed.agent;
    csrf = signed.session.csrfToken;
  });
  afterAll(() => h.close());

  it('creates a tree and reads it back', async () => {
    const food = await top('Food');
    expect(food).toMatchObject({ type: 'EXPENSE', parentId: null, archivedAt: null, version: 1 });
    const groceries = await child(food, 'Groceries');
    const dining = await child(food, 'Dining');
    expect(groceries.parentId).toBe(food.id);
    expect(dining.sortOrder).toBeGreaterThan(groceries.sortOrder);
    const read = await agent.get(`/api/v1/categories/${groceries.id}`).expect(200);
    expect(read.headers['etag']).toBe('"1"');
    const ids = (await list()).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([food.id, groceries.id, dining.id]));
  });

  it('accepts a client id and rejects a duplicate', async () => {
    const id = uuidv7();
    await create({ id, name: 'Salary', type: 'INCOME' }).expect(201);
    const dup = await create({ id, name: 'Salary', type: 'INCOME' }).expect(409);
    expect(dup.body.code).toBe('ID_CONFLICT');
  });

  it('limits the depth to two levels', async () => {
    const home = await top('Home');
    const rent = await child(home, 'Rent');
    const deep = await create({ name: 'Deposit', type: 'EXPENSE', parentId: rent.id }).expect(422);
    expect(deep.body.code).toBe('CATEGORY_DEPTH_EXCEEDED');
    // A category with children can't become a subcategory; nor can a category be its own parent.
    const other = await top('Other');
    const nest = await patch(home.id, { parentId: other.id }).expect(422);
    expect(nest.body.code).toBe('CATEGORY_DEPTH_EXCEEDED');
    const self = await patch(other.id, { parentId: other.id }).expect(422);
    expect(self.body.code).toBe('CATEGORY_DEPTH_EXCEEDED');
    const unknown = await create({
      name: 'Orphan',
      type: 'EXPENSE',
      parentId: uuidv7(),
    }).expect(404);
    expect(unknown.body.code).toBe('NOT_FOUND');
  });

  it('requires a subcategory to have its parent type', async () => {
    const salary = await top('Wages', 'INCOME');
    const mismatch = await create({
      name: 'Bonus',
      type: 'EXPENSE',
      parentId: salary.id,
    }).expect(422);
    expect(mismatch.body.code).toBe('CATEGORY_TYPE_MISMATCH');
    const bonus = await child(salary, 'Bonus');
    // A subcategory can't change type away from its parent.
    const sub = await patch(bonus.id, { type: 'EXPENSE' }).expect(422);
    expect(sub.body.code).toBe('CATEGORY_TYPE_MISMATCH');
    // A parent with children can't change type.
    const parent = await patch(salary.id, { type: 'EXPENSE' }).expect(422);
    expect(parent.body.code).toBe('CATEGORY_TYPE_MISMATCH');
    // A childless top-level category can.
    const lone = await top('Gifts', 'INCOME');
    const changed = await patch(lone.id, { type: 'EXPENSE' }).expect(200);
    expect(changed.body).toMatchObject({ type: 'EXPENSE', version: 2 });
  });

  it('promotes a subcategory and moves it to the end of its new group', async () => {
    const travel = await top('Travel');
    const flights = await child(travel, 'Flights');
    const before = (await list()).filter((c) => c.parentId === null && c.type === 'EXPENSE');
    const maxTop = Math.max(...before.map((c) => c.sortOrder));
    const promoted = await patch(flights.id, { parentId: null }).expect(200);
    expect(promoted.body.parentId).toBeNull();
    expect(promoted.body.sortOrder).toBeGreaterThan(maxTop);
    // ...and back under a parent.
    const back = await patch(flights.id, { parentId: travel.id }).expect(200);
    expect(back.body.parentId).toBe(travel.id);
  });

  it('archives a parent without touching the children', async () => {
    const fun = await top('Fun');
    const games = await child(fun, 'Games');
    const archived = await action(fun.id, 'archive').expect(200);
    expect(archived.body.archivedAt).not.toBeNull();
    const again = await action(fun.id, 'archive').expect(200);
    expect(again.body.archivedAt).toBe(archived.body.archivedAt);
    const stored = (await list()).find((c) => c.id === games.id);
    expect(stored?.archivedAt).toBeNull();

    // No new children under an archived parent; moving into one is refused too.
    const blocked = await create({ name: 'Cinema', type: 'EXPENSE', parentId: fun.id }).expect(422);
    expect(blocked.body.code).toBe('CATEGORY_PARENT_ARCHIVED');
    const loose = await top('Loose');
    const move = await patch(loose.id, { parentId: fun.id }).expect(422);
    expect(move.body.code).toBe('CATEGORY_PARENT_ARCHIVED');
    // An existing child can still be edited, archived and restored.
    await patch(games.id, { name: 'Board games' }).expect(200);
    await action(games.id, 'archive').expect(200);
    const restoredChild = await action(games.id, 'unarchive').expect(200);
    expect(restoredChild.body.archivedAt).toBeNull();

    const restored = await action(fun.id, 'unarchive').expect(200);
    expect(restored.body.archivedAt).toBeNull();
    await child(fun, 'Cinema');
  });

  it('deletes a parent together with its children', async () => {
    const pets = await top('Pets');
    const vet = await child(pets, 'Vet');
    const food = await child(pets, 'Pet food');
    await agent.delete(`/api/v1/categories/${pets.id}`).set('X-CSRF-Token', csrf).expect(204);
    for (const id of [pets.id, vet.id, food.id]) {
      await agent.get(`/api/v1/categories/${id}`).expect(404);
    }
  });

  it('reorders siblings and returns the full list', async () => {
    const parent = await top('Car');
    const a = await child(parent, 'Fuel');
    const b = await child(parent, 'Insurance');
    const c = await child(parent, 'Service');
    const res = await agent
      .post('/api/v1/categories/reorder')
      .set('X-CSRF-Token', csrf)
      .send({ ids: [c.id, a.id, b.id] })
      .expect(200);
    const items = res.body.items as CategoryDto[];
    const order = (id: string) => items.find((item) => item.id === id)?.sortOrder;
    expect([order(c.id), order(a.id), order(b.id)]).toEqual([0, 1, 2]);
    expect(items.length).toBeGreaterThan(3);

    const mixed = await agent
      .post('/api/v1/categories/reorder')
      .set('X-CSRF-Token', csrf)
      .send({ ids: [a.id, parent.id] })
      .expect(422);
    expect(mixed.body.errors[0]).toMatchObject({ path: ['ids'], code: 'INVALID_VALUE' });
    const missing = await agent
      .post('/api/v1/categories/reorder')
      .set('X-CSRF-Token', csrf)
      .send({ ids: [a.id, uuidv7()] })
      .expect(404);
    expect(missing.body.code).toBe('NOT_FOUND');
    await agent
      .post('/api/v1/categories/reorder')
      .set('X-CSRF-Token', csrf)
      .send({ ids: [a.id, a.id] })
      .expect(422);
  });

  it('checks versions and requires them from API tokens', async () => {
    const cat = await top('Health');
    const stale = await patch(cat.id, { name: 'x', version: 2 }).expect(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
    expect(stale.body.current).toMatchObject({ id: cat.id, version: 1 });

    const created = await agent
      .post('/api/v1/me/api-tokens')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'cats', permissions: ['categories:read', 'categories:update'] })
      .expect(201);
    const bearer = `Bearer ${created.body.secret as string}`;
    const missing = await request(h.app)
      .patch(`/api/v1/categories/${cat.id}`)
      .set('Authorization', bearer)
      .send({ name: 'Wellbeing' })
      .expect(428);
    expect(missing.body.code).toBe('PRECONDITION_REQUIRED');
    await request(h.app)
      .patch(`/api/v1/categories/${cat.id}`)
      .set('Authorization', bearer)
      .send({ name: 'Wellbeing', version: 1 })
      .expect(200);
    const denied = await request(h.app)
      .delete(`/api/v1/categories/${cat.id}`)
      .set('Authorization', bearer)
      .set('If-Match', '"2"')
      .expect(403);
    expect(denied.body.code).toBe('API_TOKEN_PERMISSION_DENIED');
  });
});

describe('base currency change', () => {
  let h: Harness;
  let agent: Agent;
  let csrf: string;

  const change = (body: object) =>
    agent.post('/api/v1/me/base-currency-change').set('X-CSRF-Token', csrf).send(body);

  beforeAll(async () => {
    h = await createHarness();
    const signed = await signedIn(h.app, { username: 'alice' });
    agent = signed.agent;
    csrf = signed.session.csrfToken;
  });
  afterAll(() => h.close());

  it('changes only the base currency, with confirmation and a version', async () => {
    const before = await agent.get('/api/v1/me/settings').expect(200);
    expect(before.body.baseCurrency).toBe('EUR');
    const version = before.body.version as number;

    const unconfirmed = await change({ baseCurrency: 'PLN', version }).expect(422);
    expect(unconfirmed.body.code).toBe('VALIDATION_FAILED');
    const noVersion = await change({ baseCurrency: 'PLN', confirm: true }).expect(428);
    expect(noVersion.body.code).toBe('PRECONDITION_REQUIRED');
    const stale = await change({ baseCurrency: 'PLN', confirm: true, version: version + 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.current).toMatchObject({ baseCurrency: 'EUR', version });
    const unchanged = await change({ baseCurrency: 'EUR', confirm: true, version }).expect(422);
    expect(unchanged.body.errors[0]).toMatchObject({
      path: ['baseCurrency'],
      code: 'BASE_CURRENCY_UNCHANGED',
    });
    const inactive = await change({ baseCurrency: 'HRK', confirm: true, version }).expect(422);
    expect(inactive.body.errors[0]).toMatchObject({ code: 'CURRENCY_INACTIVE' });

    const done = await agent
      .post('/api/v1/me/base-currency-change')
      .set('X-CSRF-Token', csrf)
      .set('If-Match', `"${version}"`)
      .send({ baseCurrency: 'PLN', confirm: true })
      .expect(200);
    expect(done.body).toMatchObject({
      baseCurrency: 'PLN',
      version: version + 1,
      theme: before.body.theme,
      timeZone: before.body.timeZone,
    });
    expect(done.headers['etag']).toBe(`"${version + 1}"`);
  });

  it('is not available to API tokens', async () => {
    const created = await agent
      .post('/api/v1/me/api-tokens')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'all', permissions: ['profile:read', 'currencies:read'] })
      .expect(201);
    const res = await request(h.app)
      .post('/api/v1/me/base-currency-change')
      .set('Authorization', `Bearer ${created.body.secret as string}`)
      .send({ baseCurrency: 'USD', confirm: true, version: 1 })
      .expect(403);
    expect(res.body.code).toBe('API_TOKEN_NOT_ALLOWED');
  });
});
