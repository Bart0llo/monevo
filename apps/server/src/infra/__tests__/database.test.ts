import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  it('supports PostgreSQL 16 through 18 (postgresql.md#supported-versions, ADR-0018)', () => {
    expect(MIN_SUPPORTED_MAJOR).toBe(16);
    expect(NEWEST_SUPPORTED_MAJOR).toBe(18);
  });

  it('refuses majors below the minimum', () => {
    expect(checkServerVersion(150012)).toEqual({ status: 'too_old', major: 15 });
    expect(checkServerVersion(159999)).toEqual({ status: 'too_old', major: 15 });
    expect(checkServerVersion(140000)).toEqual({ status: 'too_old', major: 14 });
    expect(versionTooOldMessage(15)).toBe(
      'PostgreSQL 15 is not supported. Monevo requires PostgreSQL 16 or newer (see docs/infrastructure/postgresql.md).',
    );
  });

  it('refuses an unreadable version (0) instead of accepting it', () => {
    expect(checkServerVersion(0)).toEqual({ status: 'too_old', major: 0 });
  });

  it('accepts PostgreSQL 16', () => {
    expect(checkServerVersion(160000)).toEqual({ status: 'ok', major: 16 });
    expect(checkServerVersion(160008)).toEqual({ status: 'ok', major: 16 });
  });

  it('accepts every major in the supported range', () => {
    for (let major = MIN_SUPPORTED_MAJOR; major <= NEWEST_SUPPORTED_MAJOR; major++) {
      expect(checkServerVersion(major * 10000)).toEqual({ status: 'ok', major });
      expect(checkServerVersion(major * 10000 + 9999)).toEqual({ status: 'ok', major });
    }
    expect(checkServerVersion(170004)).toEqual({ status: 'ok', major: 17 });
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
    const dir = new URL('../../../prisma/migrations', import.meta.url).pathname;
    expect(listMigrationNames(dir)).toContain('20261118000000_foundation');
  });
});
