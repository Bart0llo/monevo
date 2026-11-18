import { defineConfig } from 'vitest/config';

// `pnpm test:release`: unit tests of the release tooling (docs/development/releasing.md).
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['__tests__/**/*.test.mjs'],
    environment: 'node',
  },
});
