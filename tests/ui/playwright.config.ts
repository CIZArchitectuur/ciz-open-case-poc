import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'wlz.spec.ts',
  timeout: process.env.PLAYWRIGHT_HEADLESS === 'false' ? 360_000 : 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:3000',
    headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    actionTimeout: 20_000,
    launchOptions: {
      slowMo: Number(process.env.PLAYWRIGHT_SLOW_MO_MS ?? '0')
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
});
