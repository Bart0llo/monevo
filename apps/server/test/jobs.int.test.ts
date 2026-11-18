import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JOBS_SCHEMA, startJobs } from '../src/infra/jobs.js';
import { captureLogger } from '../src/test-support/logger.js';
import { createTestDatabase, type TestDatabase } from './database.js';

describe('job runner', () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
  });
  afterAll(async () => {
    await db.drop();
  });

  it('starts pg-boss in its own schema with the no-op queue and stops gracefully', async () => {
    const { logger, lines } = captureLogger();
    const jobs = await startJobs(db.url, logger);
    await jobs.stop();
    const client = new pg.Client({ connectionString: db.url });
    await client.connect();
    try {
      const { rows } = await client.query<{ name: string }>(`SELECT name FROM ${JOBS_SCHEMA}.queue`);
      expect(rows.map((row) => row.name)).toContain('system.noop');
    } finally {
      await client.end();
    }
    expect(lines().some((line) => line['event'] === 'jobs.started')).toBe(true);
  });
});
