import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      // testing-strategy.md#domain-monevodomain: >= 90% branch coverage
      thresholds: { branches: 90, lines: 90, functions: 90, statements: 90 },
    },
  },
});
