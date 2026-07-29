import { test as base } from '@playwright/test';

// Shared root fixture for all test files (both auth.fixture.ts and base.fixture.ts extend from
// here) so every test gets the same Allure reporting behavior regardless of which higher-level
// fixture it uses.
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    await use(page);

    // Playwright's own screenshot/video/trace attachments already cover failed tests (see
    // playwright.config.ts: screenshot: 'only-on-failure', video: 'retain-on-failure') and are
    // picked up by allure-playwright automatically. Passed tests get no attachment by default —
    // add one final screenshot here so every passed test's Allure report ends with visual proof
    // of the last successful state, not just a wall of green step names.
    if (testInfo.status === 'passed' && !page.isClosed()) {
      await base.step('Attach final screenshot (test passed)', async () => {
        const screenshot = await page.screenshot({ fullPage: true });
        await testInfo.attach('Final state screenshot', { body: screenshot, contentType: 'image/png' });
      });
    }
  },
});

export { expect } from '@playwright/test';
