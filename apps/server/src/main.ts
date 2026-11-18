import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config/env.js';
import {
  checkServerVersion,
  listMigrationNames,
  pendingMigrations,
  ping,
  readFinishedMigrations,
  readServerVersionNum,
  versionTooNewMessage,
  versionTooOldMessage,
} from './infra/database.js';
import { startJobs } from './infra/jobs.js';
import { createLogger } from './infra/logger.js';
import { createPrismaClient } from './infra/prisma.js';
import { createReadinessChecker } from './modules/health/index.js';

// Boot sequence: backend-architecture.md#1-process-layout. Stage 1 has no runtime settings,
// storage driver or realtime yet; those steps are added by their stages.

const SHUTDOWN_TIMEOUT_MS = 25_000;
const READINESS_DB_TIMEOUT_MS = 2_000;

const migrationsDir = fileURLToPath(new URL('../prisma/migrations', import.meta.url));
const webRoot = fileURLToPath(new URL('../public', import.meta.url));

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const logger = createLogger({ level: config.logLevel, nodeEnv: config.nodeEnv });
  if (config.insecureCookies) {
    logger.warn(
      { event: 'config.insecure_cookies' },
      'INSECURE_COOKIES=true: cookies are sent over plain HTTP. Use only for local development or a trusted LAN test.',
    );
  }

  const prisma = createPrismaClient({
    databaseUrl: config.databaseUrl,
    poolSize: config.databasePoolSize,
  });
  const version = checkServerVersion(await readServerVersionNum(prisma));
  if (version.status === 'too_old') {
    logger.fatal(
      { event: 'database.unsupported', major: version.major },
      versionTooOldMessage(version.major),
    );
    await prisma.$disconnect();
    process.exit(1);
  }
  if (version.status === 'too_new') {
    logger.warn(
      { event: 'database.version_untested', major: version.major },
      versionTooNewMessage(version.major),
    );
  }
  const shipped = listMigrationNames(migrationsDir);
  const pending = pendingMigrations(shipped, await readFinishedMigrations(prisma));
  if (pending.length > 0) {
    logger.warn(
      { event: 'database.migrations_pending', pending },
      'database migrations are pending; run `node dist/cli.js migrate`',
    );
  }

  const jobs = await startJobs(config.databaseUrl, logger);

  const lifecycle = { shuttingDown: false };
  const readiness = createReadinessChecker({
    ping: () => ping(prisma, READINESS_DB_TIMEOUT_MS),
    pendingMigrations: async () => pendingMigrations(shipped, await readFinishedMigrations(prisma)),
    lifecycle,
    logger,
  });
  const app = createApp({ config, logger, readiness, webRoot });
  const server = createServer(app);

  const shutdown = (signal: string) => {
    if (lifecycle.shuttingDown) return;
    lifecycle.shuttingDown = true;
    logger.info({ event: 'server.stopping', signal }, 'shutting down');
    const force = setTimeout(() => {
      logger.error({ event: 'server.stop_timeout' }, 'graceful shutdown timed out');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();
    server.close();
    server.closeIdleConnections();
    void (async () => {
      try {
        await jobs.stop();
        await prisma.$disconnect();
        logger.info({ event: 'server.stopped' }, 'stopped');
        process.exit(0);
      } catch (error) {
        logger.error({ err: error, event: 'server.stop_failed' }, 'error during shutdown');
        process.exit(1);
      }
    })();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.listen(config.port, () => {
    logger.info(
      {
        event: 'server.started',
        version: process.env['APP_VERSION'] ?? 'dev',
        commit: process.env['GIT_COMMIT'] ?? 'unknown',
        port: config.port,
        nodeEnv: config.nodeEnv,
        apiDocsEnabled: config.apiDocsEnabled,
        httpCompression: config.httpCompression,
        corsOrigins: config.corsAllowedOrigins.length,
        databaseMajor: version.major,
      },
      'server started',
    );
  });
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Fatal startup error: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
