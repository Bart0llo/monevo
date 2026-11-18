import { defineConfig, devices } from '@playwright/test';

// E2E against the built image (docker-compose.e2e.yml), started by `pnpm test:e2e`
// (docs/development/testing-strategy.md#5-local-validation).

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
    locale: 'en-US',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
