import { PgBoss } from 'pg-boss';
import type { Logger } from './logger.js';

// Background jobs run in-process on pg-boss (backend-architecture.md#6-background-jobs-pg-boss).
// `system.noop` proves the runner works end to end; modules contribute scheduled jobs.

export const JOBS_SCHEMA = 'pgboss';
export const JOBS_POOL_SIZE = 3;
export const NOOP_QUEUE = 'system.noop';

export interface ScheduledJob {
  readonly queue: string;
  /** Cron expression, evaluated in UTC. */
  readonly cron: string;
  readonly run: () => Promise<unknown>;
}

export interface JobRunner {
  stop(): Promise<void>;
}

export async function startJobs(
  databaseUrl: string,
  logger: Logger,
  scheduled: readonly ScheduledJob[] = [],
): Promise<JobRunner> {
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
  for (const job of scheduled) {
    await boss.createQueue(job.queue);
    await boss.schedule(job.queue, job.cron);
    await boss.work(job.queue, async (batch) => {
      for (const item of batch) {
        try {
          await job.run();
        } catch (error) {
          logger.error({ err: error, job: job.queue, jobId: item.id }, 'job failed');
          throw error;
        }
      }
    });
  }
  logger.info({ module: 'jobs', event: 'jobs.started' }, 'job runner started');
  return {
    stop: () => boss.stop({ graceful: true, timeout: 15_000, close: true }),
  };
}
