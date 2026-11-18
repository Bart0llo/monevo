import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MIN_SUPPORTED_MAJOR,
  NEWEST_SUPPORTED_MAJOR,
  checkServerVersion,
  listMigrationNames,
  pendingMigrations,
  versionTooNewMessage,
  versionTooOldMessage,
} from '../database.js';

describe('checkServerVersion', () => {
  it('refuses majors below the minimum', () => {
    expect(checkServerVersion(160008)).toEqual({ status: 'too_old', major: 16 });
    expect(versionTooOldMessage(16)).toContain(`PostgreSQL ${MIN_SUPPORTED_MAJOR} or newer`);
  });

  it('accepts the supported range', () => {
    expect(checkServerVersion(170000)).toEqual({ status: 'ok', major: 17 });
    expect(checkServerVersion(180004)).toEqual({ status: 'ok', major: 18 });
  });

  it('warns above the newest supported major', () => {
    expect(checkServerVersion((NEWEST_SUPPORTED_MAJOR + 1) * 10000)).toEqual({
      status: 'too_new',
      major: NEWEST_SUPPORTED_MAJOR + 1,
    });
    expect(versionTooNewMessage(19)).toContain('newer than the newest major');
  });
});

describe('migrations', () => {
  it('lists migration folders that contain migration.sql, sorted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'monevo-migrations-'));
    for (const name of ['20261201000000_b', '20261118000000_a', 'not_a_migration']) {
      mkdirSync(join(dir, name));
      if (name !== 'not_a_migration') writeFileSync(join(dir, name, 'migration.sql'), '');
    }
    writeFileSync(join(dir, 'migration_lock.toml'), '');
    expect(listMigrationNames(dir)).toEqual(['20261118000000_a', '20261201000000_b']);
    expect(listMigrationNames(join(dir, 'missing'))).toEqual([]);
  });

  it('computes pending migrations', () => {
    expect(pendingMigrations(['a', 'b'], null)).toEqual(['a', 'b']);
    expect(pendingMigrations(['a', 'b'], ['a'])).toEqual(['b']);
    expect(pendingMigrations(['a', 'b'], ['a', 'b', 'old'])).toEqual([]);
  });

  it('ships the foundation migration', () => {
    const dir = fileURLToPath(new URL('../../../prisma/migrations', import.meta.url));
    expect(listMigrationNames(dir)).toContain('20261118000000_foundation');
  });
});
