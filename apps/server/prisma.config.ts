import { defineConfig } from 'prisma/config';

// `prisma generate` does not connect, so a placeholder URL keeps it working without DATABASE_URL.
// Commands that connect (migrate deploy, migrate dev) receive the real URL from the environment;
// `dist/cli.js migrate` passes the resolved value (including DATABASE_URL_FILE).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
});
