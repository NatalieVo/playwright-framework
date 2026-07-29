import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const BASE_URL = process.env.BASE_URL ?? 'https://localhost';

const reporters: Parameters<typeof defineConfig>[0]['reporter'] = [
  ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ['list'],
  [
    'allure-playwright',
    {
      resultsDir: 'allure-results',
      detail: false,
      suiteTitle: false,
      environmentInfo: {
        BASE_URL,
        NODE_ENV: process.env.ENV ?? 'dev',
        Browser: 'Chromium (Desktop, 1920x1080)',
      },
    },
  ],
];

export default defineConfig({
  testDir: './src/tests',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: reporters,
  // Always wipe allure-results before a new run starts, regardless of which command invoked
  // Playwright (npx playwright test, an npm script, or CI) — see global-setup.ts.
  globalSetup: './global-setup.ts',

  use: {
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 60_000,
    // CI runners have no display server — headed mode is only meaningful for local debugging
    // (see .claude/rules/playwright_rules.md: CI is explicitly allowed to default to headless).
    headless: !!process.env.CI,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        launchOptions: {
          args: ['--window-size=1920,1080'],
        },
      },
    },
  ],

  outputDir: 'test-results',
});
