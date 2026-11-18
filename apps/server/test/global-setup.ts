import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import pg from 'pg';

// Builds a template database once (all migrations applied); every test file clones it
// (testing-strategy.md#4-test-data-and-environment). Uses the local `db-test` container from
// docker-compose.dev.yml, or a Testcontainers PostgreSQL when TESTCONTAINERS=true.

export const TEMPLATE_DB = 'monevo_template';
const DEFAULT_URL = 'postgresql://postgres:postgres@127.0.0.1:5433/postgres';

declare module 'vitest' {
  export interface ProvidedContext {
    adminDatabaseUrl: string;
  }
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  let adminUrl = process.env['TEST_DATABASE_URL'] ?? DEFAULT_URL;
  let stopContainer: (() => Promise<unknown>) | undefined;
  if (process.env['TESTCONTAINERS'] === 'true') {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const container = await new PostgreSqlContainer('postgres:17-bookworm').start();
    adminUrl = container.getConnectionUri();
    stopContainer = () => container.stop();
  }

  const admin = new pg.Client({ connectionString: adminUrl });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      `Integration tests need PostgreSQL at ${new URL(adminUrl).host}. Start it with ` +
        '`docker compose -f docker-compose.dev.yml up -d db-test`, set TEST_DATABASE_URL, or set TESTCONTAINERS=true.',
      { cause: error },
    );
  }
  await admin.query(`DROP DATABASE IF EXISTS ${TEMPLATE_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEMPLATE_DB}`);
  await admin.end();

  const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: withDatabase(adminUrl, TEMPLATE_DB), PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`prisma migrate deploy failed:\n${result.stdout}\n${result.stderr}`);

  project.provide('adminDatabaseUrl', adminUrl);
  return async () => {
    await stopContainer?.();
  };
}
