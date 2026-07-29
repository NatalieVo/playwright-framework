import { test as base } from './reporting.fixture';
import { LoginPage } from '../pages/login.page';
import { FileManagerPage } from '../pages/dashboard.page';

type PageFixtures = {
  loginPage: LoginPage;
  fileManagerPage: FileManagerPage;
};

export const test = base.extend<PageFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  fileManagerPage: async ({ page }, use) => {
    await use(new FileManagerPage(page));
  },
});

export { expect } from '@playwright/test';
