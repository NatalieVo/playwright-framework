import { Page } from '@playwright/test';
import { test as base } from './reporting.fixture';
import { LoginPage } from '../pages/login.page';
import { env } from '../utils/env.config';

type AuthFixtures = {
  authenticatedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    await base.step(`Setup: log in as user "${env.USERNAME}" before the test`, async () => {
      const loginPage = new LoginPage(page);
      let lastError: unknown;
      // A transient server slow-down can occasionally leave the post-login redirect short of
      // rendering app-header within the timeout even though the credentials are fine — retry the
      // whole navigate+login once before failing the test (same "retry the unit, not the wait" idea
      // as FileListPage.selectContextAction()).
      for (let attempt = 0; attempt < 2; attempt++) {
        // Navigate to the app — server auto-redirects unauthenticated users to /Login/?redirect=...
        // After login, server redirects back here (preserving the data-testid="app-header" UI)
        await page.goto('/FileManager/4/', { waitUntil: 'domcontentloaded' });
        await loginPage.login(env.USERNAME, env.PASSWORD);
        try {
          await page.waitForSelector('[data-testid="app-header"]', { state: 'visible', timeout: 30_000 });
          return;
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError;
    });
    await use(page);
  },
});

export { expect } from '@playwright/test';
