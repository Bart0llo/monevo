import { PgBoss } from 'pg-boss';
import type { Logger } from './logger.js';

// Background jobs run in-process on pg-boss (backend-architecture.md#6-background-jobs-pg-boss).
// Stage 1 registers only a no-op queue to prove the runner works end to end.

export const JOBS_SCHEMA = 'pgboss';
export const JOBS_POOL_SIZE = 3;
export const NOOP_QUEUE = 'system.noop';

export interface JobRunner {
  stop(): Promise<void>;
}

export async function startJobs(databaseUrl: string, logger: Logger): Promise<JobRunner> {
  const boss = new PgBoss({
    connectionString: databaseUrl,
    schema: JOBS_SCHEMA,
    max: JOBS_POOL_SIZE,
    application_name: 'monevo-jobs',
  });
  boss.on('error', (error: Error) => logger.error({ err: error, module: 'jobs' }, 'pg-boss error'));
  await boss.start();
  await boss.createQueue(NOOP_QUEUE);
  await boss.work(NOOP_QUEUE, (jobs) => {
    for (const job of jobs) logger.debug({ job: NOOP_QUEUE, jobId: job.id }, 'no-op job done');
    return Promise.resolve();
  });
  logger.info({ module: 'jobs', event: 'jobs.started' }, 'job runner started');
  return {
    stop: () => boss.stop({ graceful: true, timeout: 15_000, close: true }),
  };
}
