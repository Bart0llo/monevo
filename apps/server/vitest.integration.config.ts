import { defineConfig } from 'vitest/config';

// Integration tests against a real PostgreSQL (testing-strategy.md#4-test-data-and-environment).
export default defineConfig({
  test: {
    include: ['test/**/*.int.test.ts'],
    environment: 'node',
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
