import type { Clock } from '../../infra/clock.js';
import type { Logger } from '../../infra/logger.js';
import type { Db } from '../../infra/prisma.js';
import { purgeTokens } from '../api-tokens/index.js';
import { purgeSessions } from './sessions.repo.js';

// Daily `sessions.purge` job (backend-architecture.md#6-background-jobs-pg-boss): sessions are kept
// 30 days after they end (authentication.md#4-sessions), personal API tokens 90 days after they are
// revoked or expire (api-tokens.md).

export const SESSIONS_PURGE_QUEUE = 'sessions.purge';
export const SESSIONS_PURGE_CRON = '30 3 * * *';
export const SESSION_RETENTION_DAYS = 30;
export const API_TOKEN_RETENTION_DAYS = 90;

const DAY_MS = 86_400_000;

export interface PurgeResult {
  readonly sessions: number;
  readonly apiTokens: number;
}

export async function runSessionsPurge(db: Db, clock: Clock, logger: Logger): Promise<PurgeResult> {
  const now = clock.now().getTime();
  const sessions = await purgeSessions(db, new Date(now - SESSION_RETENTION_DAYS * DAY_MS));
  const apiTokens = await purgeTokens(db, new Date(now - API_TOKEN_RETENTION_DAYS * DAY_MS));
  logger.info(
    { job: SESSIONS_PURGE_QUEUE, event: 'sessions.purged', sessions, apiTokens },
    'old sessions and API tokens purged',
  );
  return { sessions, apiTokens };
}
