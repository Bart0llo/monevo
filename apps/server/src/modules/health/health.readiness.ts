import type { Logger } from '../../infra/logger.js';

/** Result of each readiness check (monitoring-and-logging.md#2-health-endpoints). */
export interface ReadinessResult {
  readonly database: boolean;
  readonly migrations: boolean;
  readonly lifecycle: boolean;
}

export interface ReadinessChecker {
  check(): Promise<ReadinessResult>;
}

export interface Lifecycle {
  readonly shuttingDown: boolean;
}

export interface ReadinessDeps {
  /** `SELECT 1` with a timeout; rejects when the database is unreachable. */
  ping(): Promise<void>;
  /** Names of shipped migrations that are not applied yet. */
  pendingMigrations(): Promise<readonly string[]>;
  readonly lifecycle: Lifecycle;
  readonly logger: Logger;
}

export function createReadinessChecker(deps: ReadinessDeps): ReadinessChecker {
  // Migrations are forward-only, so once everything is applied the answer cannot change.
  let migrationsApplied = false;
  return {
    async check() {
      const lifecycle = !deps.lifecycle.shuttingDown;
      try {
        await deps.ping();
      } catch (error) {
        deps.logger.debug({ err: error, module: 'health' }, 'readiness: database check failed');
        return { database: false, migrations: true, lifecycle };
      }
      if (!migrationsApplied) {
        try {
          migrationsApplied = (await deps.pendingMigrations()).length === 0;
        } catch (error) {
          deps.logger.debug({ err: error, module: 'health' }, 'readiness: migrations check failed');
        }
      }
      return { database: true, migrations: migrationsApplied, lifecycle };
    },
  };
}
