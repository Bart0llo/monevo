import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';

const TEMPLATE_DB = 'monevo_template';

export interface TestDatabase {
  readonly url: string;
  drop(): Promise<void>;
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

async function adminQuery(sql: string): Promise<void> {
  const admin = new pg.Client({ connectionString: inject('adminDatabaseUrl') });
  await admin.connect();
  try {
    await admin.query(sql);
  } finally {
    await admin.end();
  }
}

/** A fresh database for one test file: a clone of the migrated template, or empty. */
export async function createTestDatabase(options: { empty?: boolean } = {}): Promise<TestDatabase> {
  const name = `monevo_test_${randomBytes(6).toString('hex')}`;
  await adminQuery(
    options.empty ? `CREATE DATABASE ${name}` : `CREATE DATABASE ${name} TEMPLATE ${TEMPLATE_DB}`,
  );
  return {
    url: withDatabase(inject('adminDatabaseUrl'), name),
    drop: () => adminQuery(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
  };
}
