import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CURRENCIES } from '@monevo/domain';
import { createApp } from '../src/app.js';
import {
  checkServerVersion,
  listMigrationNames,
  pendingMigrations,
  ping,
  readFinishedMigrations,
  readServerVersionNum,
} from '../src/infra/database.js';
import { createPrismaClient, type PrismaClient } from '../src/infra/prisma.js';
import { createReadinessChecker, type Lifecycle } from '../src/modules/health/index.js';
import { captureLogger } from '../src/test-support/logger.js';
import { createTestDatabase, type TestDatabase } from './database.js';

const migrationsDir = fileURLToPath(new URL('../prisma/migrations', import.meta.url));
const shipped = listMigrationNames(migrationsDir);

function appFor(prisma: PrismaClient, lifecycle: Lifecycle = { shuttingDown: false }) {
  const { logger } = captureLogger();
  const readiness = createReadinessChecker({
    ping: () => ping(prisma, 2_000),
    pendingMigrations: async () => pendingMigrations(shipped, await readFinishedMigrations(prisma)),
    lifecycle,
    logger,
  });
  return createApp({
    config: {
      appUrl: new URL('https://money.example.com'),
      trustProxy: false,
      corsAllowedOrigins: [],
      apiDocsEnabled: true,
      httpCompression: false,
    },
    logger,
    readiness,
  });
}

describe('migrated database', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;

  beforeAll(async () => {
    db = await createTestDatabase();
    prisma = createPrismaClient({ databaseUrl: db.url, poolSize: 2 });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await db.drop();
  });

  it('readiness returns 200', async () => {
    const res = await request(appFor(prisma)).get('/api/v1/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('readiness returns 503 lifecycle=fail while shutting down', async () => {
    const res = await request(appFor(prisma, { shuttingDown: true }))
      .get('/api/v1/health/ready')
      .expect(503);
    expect(res.body).toEqual({ status: 'unavailable', checks: { lifecycle: 'fail' } });
  });

  it('runs a supported PostgreSQL major', async () => {
    expect(checkServerVersion(await readServerVersionNum(prisma)).status).toBe('ok');
  });

  it('has every shipped migration applied', async () => {
    expect(pendingMigrations(shipped, await readFinishedMigrations(prisma))).toEqual([]);
  });

  it('seeds the currencies table identical to the domain table', async () => {
    const rows = await prisma.currency.findMany({ orderBy: { code: 'asc' } });
    const expected = [...CURRENCIES]
      .map((c) => ({ code: c.code, exponent: c.exponent, name: c.name, active: c.active }))
      .sort((a, b) => a.code.localeCompare(b.code));
    expect(rows).toEqual(expected);
  });

  it('enforces the currency CHECK constraints', async () => {
    await expect(
      prisma.currency.create({ data: { code: 'XXX', exponent: 5, name: 'Bad', active: true } }),
    ).rejects.toThrow();
    await expect(
      prisma.currency.create({ data: { code: 'xx1', exponent: 2, name: 'Bad', active: true } }),
    ).rejects.toThrow();
  });

  it('stores app settings as JSONB with an update timestamp', async () => {
    const row = await prisma.appSetting.create({ data: { key: 'system.instanceEpoch', value: 1 } });
    expect(row.value).toBe(1);
    expect(row.updatedAt).toBeInstanceOf(Date);
    expect(row.updatedByUserId).toBeNull();
  });
});

describe('empty database', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;

  beforeAll(async () => {
    db = await createTestDatabase({ empty: true });
    prisma = createPrismaClient({ databaseUrl: db.url, poolSize: 2 });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await db.drop();
  });

  it('reports every migration as pending', async () => {
    expect(await readFinishedMigrations(prisma)).toBeNull();
    const res = await request(appFor(prisma)).get('/api/v1/health/ready').expect(503);
    expect(res.body).toEqual({ status: 'unavailable', checks: { migrations: 'fail' } });
  });
});

describe('unreachable database', () => {
  it('readiness returns 503 database=fail', async () => {
    const prisma = createPrismaClient({
      databaseUrl: 'postgresql://nobody:nothing@127.0.0.1:1/none',
      poolSize: 1,
    });
    try {
      const res = await request(appFor(prisma)).get('/api/v1/health/ready').expect(503);
      expect(res.body).toEqual({ status: 'unavailable', checks: { database: 'fail' } });
    } finally {
      await prisma.$disconnect();
    }
  });
});
