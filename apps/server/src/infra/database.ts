import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from './prisma.js';

// Supported PostgreSQL majors, inclusive (postgresql.md#supported-versions, ADR-0018). Below the
// minimum the server refuses to start; above the newest it starts with a warning. Lower the minimum
// only by a new ADR; raise NEWEST_SUPPORTED_MAJOR only after the integration suite passes against
// the new major. Schema and raw SQL must stay within the features of MIN_SUPPORTED_MAJOR.
export const MIN_SUPPORTED_MAJOR = 16;
export const NEWEST_SUPPORTED_MAJOR = 18;

export type VersionCheck =
  | { readonly status: 'ok'; readonly major: number }
  | { readonly status: 'too_old'; readonly major: number }
  | { readonly status: 'too_new'; readonly major: number };

/** `server_version_num` is e.g. `160008` for 16.8 or `170004` for 17.4. */
export function checkServerVersion(serverVersionNum: number): VersionCheck {
  const major = Math.floor(serverVersionNum / 10000);
  if (major < MIN_SUPPORTED_MAJOR) return { status: 'too_old', major };
  if (major > NEWEST_SUPPORTED_MAJOR) return { status: 'too_new', major };
  return { status: 'ok', major };
}

export function versionTooOldMessage(major: number): string {
  return `PostgreSQL ${major} is not supported. Monevo requires PostgreSQL ${MIN_SUPPORTED_MAJOR} or newer (see docs/infrastructure/postgresql.md).`;
}

export function versionTooNewMessage(major: number): string {
  return `PostgreSQL ${major} is newer than the newest major tested with this release (${NEWEST_SUPPORTED_MAJOR}). Monevo starts, but upgrade Monevo when a release supports it.`;
}

/** Names of the migration folders shipped with this build, in order. */
export function listMigrationNames(migrationsDir: string): string[] {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(join(migrationsDir, entry.name, 'migration.sql')),
    )
    .map((entry) => entry.name)
    .sort();
}

/** Shipped migrations not yet finished in the database. `finished === null`: no migrations table. */
export function pendingMigrations(
  shipped: readonly string[],
  finished: readonly string[] | null,
): string[] {
  if (finished === null) return [...shipped];
  const done = new Set(finished);
  return shipped.filter((name) => !done.has(name));
}

export async function readServerVersionNum(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.$queryRaw<{ version: number }[]>`
    SELECT current_setting('server_version_num')::int AS version`;
  return rows[0]?.version ?? 0;
}

export async function readFinishedMigrations(prisma: PrismaClient): Promise<string[] | null> {
  const [table] = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT to_regclass('_prisma_migrations') IS NOT NULL AS exists`;
  if (!table?.exists) return null;
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT migration_name AS name FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  return rows.map((row) => row.name);
}

export async function ping(prisma: PrismaClient, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`database ping timed out after ${timeoutMs} ms`)),
      timeoutMs,
    );
  });
  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
