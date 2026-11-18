import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { Command } from 'commander';
import { ConfigError, loadConfig } from './config/env.js';
import { checkServerVersion, ping, readServerVersionNum, versionTooNewMessage, versionTooOldMessage } from './infra/database.js';
import { createLogger, type Logger } from './infra/logger.js';
import { createPrismaClient, type PrismaClient } from './infra/prisma.js';

// Operator CLI: `node dist/cli.js <command>`. Stage 1 ships `migrate` only (run by the container
// entrypoint, docker-compose.md#entrypoint). Further commands arrive with their stages.

const DB_WAIT_MS = 60_000;
const DB_RETRY_MS = 2_000;

const appRoot = fileURLToPath(new URL('..', import.meta.url));

async function waitForDatabase(prisma: PrismaClient, logger: Logger): Promise<void> {
  const deadline = performance.now() + DB_WAIT_MS;
  for (let attempt = 1; ; attempt += 1) {
    try {
      await ping(prisma, 5_000);
      return;
    } catch (error) {
      if (performance.now() + DB_RETRY_MS > deadline) {
        throw new Error(
          `database not reachable after ${DB_WAIT_MS / 1000} s: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      logger.info({ event: 'migrate.waiting', attempt }, 'waiting for the database');
      await sleep(DB_RETRY_MS);
    }
  }
}

function runPrismaMigrateDeploy(databaseUrl: string): Promise<number> {
  const require = createRequire(import.meta.url);
  const prismaBin = join(dirname(require.resolve('prisma/package.json')), 'build', 'index.js');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [prismaBin, 'migrate', 'deploy'], {
      cwd: appRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl, DATABASE_URL_FILE: undefined, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function migrate(): Promise<number> {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel, nodeEnv: config.nodeEnv });
  const prisma = createPrismaClient({ databaseUrl: config.databaseUrl, poolSize: 1 });
  try {
    await waitForDatabase(prisma, logger);
    const version = checkServerVersion(await readServerVersionNum(prisma));
    if (version.status === 'too_old') {
      logger.fatal({ event: 'database.unsupported', major: version.major }, versionTooOldMessage(version.major));
      return 1;
    }
    if (version.status === 'too_new') {
      logger.warn({ event: 'database.version_untested', major: version.major }, versionTooNewMessage(version.major));
    }
  } finally {
    await prisma.$disconnect();
  }
  const code = await runPrismaMigrateDeploy(config.databaseUrl);
  if (code === 0) logger.info({ event: 'migrate.applied' }, 'migrations applied');
  else logger.fatal({ event: 'migrate.failed', exitCode: code }, 'prisma migrate deploy failed');
  return code;
}

const program = new Command('monevo').description('Monevo operator commands');
program
  .command('migrate')
  .description('Wait for the database, check its version, and apply pending migrations')
  .action(async () => {
    process.exitCode = await migrate();
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  if (error instanceof ConfigError) process.stderr.write(`${error.message}\n`);
  else process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
