import { defineConfig } from 'tsup';

// Workspace packages are consumed as TypeScript source and bundled into the server output
// (application-structure.md#package-responsibilities-and-dependency-rules). Everything else stays
// external and is installed by `pnpm deploy --prod` in the image.
export default defineConfig({
  entry: { main: 'src/main.ts', cli: 'src/cli.ts', healthcheck: 'src/healthcheck.ts' },
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: true,
  noExternal: [/^@monevo\//],
});
