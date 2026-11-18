#!/usr/bin/env node
// `pnpm test:e2e` (docs/development/testing-strategy.md#5-local-validation):
//  1. build the image for the host architecture and start docker-compose.e2e.yml,
//  2. container smoke test (non-root, read-only, healthy, pg_dump of the newest supported major),
//  3. Playwright against http://localhost:3100,
//  4. always tear the stack down (volumes included).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE = ['compose', '-f', 'docker-compose.e2e.yml'];
const NEWEST_POSTGRES_MAJOR = 18; // apps/server/src/infra/database.ts, postgresql.md#supported-versions

function run(command, args, options = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  // pnpm is a .cmd shim on Windows, which spawnSync can only start through a shell.
  const shell = process.platform === 'win32' && command === 'pnpm';
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
  return result;
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function smokeTest() {
  const uid = capture('docker', [...COMPOSE, 'exec', '-T', 'app', 'id', '-u']);
  if (uid !== '1000') throw new Error(`app runs as uid ${uid}, expected 1000`);

  const containerId = capture('docker', [...COMPOSE, 'ps', '-q', 'app']);
  const inspect = JSON.parse(capture('docker', ['inspect', containerId]))[0];
  if (inspect.HostConfig.ReadonlyRootfs !== true)
    throw new Error('root filesystem is not read-only');
  if (!(inspect.HostConfig.CapDrop ?? []).includes('ALL'))
    throw new Error('capabilities are not dropped');
  if (inspect.State.Health?.Status !== 'healthy')
    throw new Error(`health is ${inspect.State.Health?.Status}`);

  const pgDump = capture('docker', [...COMPOSE, 'exec', '-T', 'app', 'pg_dump', '--version']);
  const major = Number(/(\d+)(?:\.\d+)?/.exec(pgDump.replace(/^[^0-9]*/, ''))?.[1]);
  if (major !== NEWEST_POSTGRES_MAJOR)
    throw new Error(`pg_dump major is ${major} (${pgDump}), expected ${NEWEST_POSTGRES_MAJOR}`);

  const writable = spawnSync(
    'docker',
    [...COMPOSE, 'exec', '-T', 'app', 'sh', '-c', 'touch /app/probe'],
    { cwd: ROOT },
  );
  if (writable.status === 0) throw new Error('/app is writable');
  run('docker', [
    ...COMPOSE,
    'exec',
    '-T',
    'app',
    'sh',
    '-c',
    'touch /data/attachments/.probe /data/backups/.probe',
  ]);

  console.log(`\nsmoke test passed: uid 1000, read-only root, healthy, ${pgDump}`);
}

let failed = false;
try {
  const gitCommit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  run('docker', [
    ...COMPOSE,
    'build',
    '--build-arg',
    // Canonical application version (docs/development/releasing.md#canonical-version).
    `APP_VERSION=${JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version}`,
    '--build-arg',
    `GIT_COMMIT=${gitCommit.status === 0 ? gitCommit.stdout.trim() : 'unknown'}`,
    '--build-arg',
    `BUILD_DATE=${new Date().toISOString()}`,
  ]);
  run('docker', [...COMPOSE, 'up', '-d', '--wait', '--wait-timeout', '180']);
  smokeTest();
  run('pnpm', ['--filter', '@monevo/e2e', 'test:e2e'], {
    env: { ...process.env, E2E_BASE_URL: 'http://localhost:3100' },
  });
} catch (error) {
  failed = true;
  console.error(`\ntest:e2e failed: ${error instanceof Error ? error.message : String(error)}`);
  spawnSync('docker', [...COMPOSE, 'logs', '--no-color', '--tail', '200', 'app'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
} finally {
  spawnSync('docker', [...COMPOSE, 'down', '-v', '--remove-orphans'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}
process.exit(failed ? 1 : 0);
