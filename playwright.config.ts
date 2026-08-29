import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8790',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /setup\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', dependencies: ['setup'], testMatch: /accessibility\.spec\.ts/, use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'tablet', dependencies: ['setup'], testMatch: /accessibility\.spec\.ts/, use: { ...devices['iPad (gen 7)'], browserName: 'chromium' } },
    { name: 'desktop', dependencies: ['setup'], testMatch: /core-flow\.spec\.ts/, use: { ...devices['Desktop Chrome'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: 'http://127.0.0.1:8790/api/bootstrap/status',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
