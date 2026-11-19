import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { ConfigError, loadConfig } from './config/env.js';
import {
  checkServerVersion,
  ping,
  readServerVersionNum,
  versionTooNewMessage,
  versionTooOldMessage,
} from './infra/database.js';
import { createLogger, type Logger } from './infra/logger.js';
import { createPrismaClient, type PrismaClient } from './infra/prisma.js';
import { findUser, listAllUsers, setUserRole, withAdminGuard } from './modules/users/index.js';

// Operator CLI: `node dist/cli.js <command>` (administration.md#cli). `migrate` is run by the
// container entrypoint (docker-compose.md#entrypoint). Further commands arrive with their stages.

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
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DATABASE_URL_FILE: undefined,
        PRISMA_HIDE_UPDATE_MESSAGE: '1',
      },
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
      logger.fatal(
        { event: 'database.unsupported', major: version.major },
        versionTooOldMessage(version.major),
      );
      return 1;
    }
    if (version.status === 'too_new') {
      logger.warn(
        { event: 'database.version_untested', major: version.major },
        versionTooNewMessage(version.major),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
  const code = await runPrismaMigrateDeploy(config.databaseUrl);
  if (code === 0) logger.info({ event: 'migrate.applied' }, 'migrations applied');
  else logger.fatal({ event: 'migrate.failed', exitCode: code }, 'prisma migrate deploy failed');
  return code;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function withPrisma<T>(
  work: (prisma: PrismaClient, logger: Logger) => Promise<T>,
): Promise<T> {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel, nodeEnv: config.nodeEnv });
  const prisma = createPrismaClient({ databaseUrl: config.databaseUrl, poolSize: 1 });
  try {
    return await work(prisma, logger);
  } finally {
    await prisma.$disconnect();
  }
}

async function listUsersCommand(): Promise<number> {
  return withPrisma(async (prisma) => {
    const users = await listAllUsers(prisma);
    const rows = users.map((user) => ({
      id: user.id,
      displayName: user.displayName,
      email: user.email ?? '',
      role: user.role,
      status: user.status,
      issuer: user.identities.map((identity) => identity.issuer).join(' '),
      subject: user.identities.map((identity) => identity.subject).join(' '),
    }));
    if (rows.length === 0) process.stdout.write('No users.\n');
    else console.table(rows);
    return 0;
  });
}

async function setRoleCommand(userId: string, role: string): Promise<number> {
  if (!UUID_PATTERN.test(userId)) {
    process.stderr.write('--user-id must be a UUID (see `list-users`).\n');
    return 1;
  }
  if (role !== 'ADMIN' && role !== 'USER') {
    process.stderr.write('--role must be ADMIN or USER.\n');
    return 1;
  }
  const config = loadConfig();
  if (config.oidc.adminGroup !== undefined) {
    process.stderr.write(
      `Roles are managed by the identity provider (OIDC_ADMIN_GROUP=${config.oidc.adminGroup}). Change the group membership in the identity provider instead.\n`,
    );
    return 1;
  }
  return withPrisma(async (prisma, logger) => {
    const user = await findUser(prisma, userId);
    if (!user) {
      process.stderr.write(`No user with id ${userId}.\n`);
      return 1;
    }
    const result = await withAdminGuard(prisma, role === 'USER' ? userId : undefined, (tx) =>
      setUserRole(tx, userId, role),
    );
    if (result === 'LAST_ADMIN') {
      process.stderr.write('Refused: this would leave the instance without an active admin.\n');
      return 1;
    }
    logger.info(
      { event: 'admin.action', action: 'user.role.set', actor: 'cli', targetUserId: userId, role },
      'admin action: user.role.set',
    );
    process.stdout.write(`Role of ${userId} set to ${role}.\n`);
    return 0;
  });
}

const program = new Command('monevo').description('Monevo operator commands');
program
  .command('migrate')
  .description('Wait for the database, check its version, and apply pending migrations')
  .action(async () => {
    process.exitCode = await migrate();
  });

program
  .command('list-users')
  .description('Print every user with id, display name, email, role, status, issuer and subject')
  .action(async () => {
    process.exitCode = await listUsersCommand();
  });

program
  .command('set-role')
  .description('Set a user role (refused when OIDC_ADMIN_GROUP is set)')
  .requiredOption('--user-id <uuid>', 'user id (see list-users)')
  .requiredOption('--role <role>', 'ADMIN or USER')
  .action(async (options: { userId: string; role: string }) => {
    process.exitCode = await setRoleCommand(options.userId, options.role);
  });

program
  .command('generate-key')
  .description('Print a new random APP_ENCRYPTION_KEY (32 bytes, base64)')
  .action(() => {
    process.stdout.write(`${randomBytes(32).toString('base64')}\n`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  if (error instanceof ConfigError) process.stderr.write(`${error.message}\n`);
  else process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
