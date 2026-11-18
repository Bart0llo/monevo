import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export type { PrismaClient } from '../generated/prisma/client.js';

export interface PrismaConfig {
  readonly databaseUrl: string;
  readonly poolSize: number;
}

/** API pool: node-postgres via the Prisma driver adapter (database-architecture.md#6-connection-management). */
export function createPrismaClient(config: PrismaConfig): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: config.databaseUrl,
    max: config.poolSize,
    // 30 s statement timeout for API connections.
    options: '-c statement_timeout=30000',
    connectionTimeoutMillis: 5000,
  });
  return new PrismaClient({ adapter });
}
