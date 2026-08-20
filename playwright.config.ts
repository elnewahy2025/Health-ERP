import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';
const apiURL = process.env.E2E_API_URL || 'http://localhost:3000';
const managedE2E = process.env.E2E_START_SERVERS === 'true';

export default defineConfig({
  testDir: './e2e/tests',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: CI ? 'on-first-retry' : 'off',
    storageState: process.env.E2E_ENABLE_AUTHENTICATED === 'true' ? 'e2e/.auth/tenant-a.json' : undefined,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: managedE2E
    ? [
        {
          command: 'npm run dev:backend',
          url: `${apiURL}/api/v1/health/live`,
          reuseExistingServer: false,
          timeout: 120_000,
        },
        {
          command: 'npm run dev -w packages/frontend -- --host 127.0.0.1',
          url: baseURL,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ]
    : CI
      ? undefined
      : {
          command: 'npm run dev',
          url: 'http://localhost:5173',
          reuseExistingServer: true,
          timeout: 30_000,
        },
});
