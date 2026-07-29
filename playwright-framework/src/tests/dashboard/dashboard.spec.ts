import { test, expect } from '../../fixtures/auth.fixture';
import { FileManagerPage } from '../../pages/dashboard.page';

test.describe('FileManager — Post-Login', () => {
  test('FileManager displays correctly after login', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await test.step('Verify FileManager displays correctly after login', async () => {
      await expect(authenticatedPage).toHaveURL(/FileManager/);
      await expect(authenticatedPage).toHaveTitle('CompleteFTP Files');
      expect(await fm.isLoaded(), 'App header should be visible').toBeTruthy();
      expect(await fm.isToolbarVisible(), 'Toolbar should be visible').toBeTruthy();
    });
  });

  test('breadcrumb shows Home at the root folder', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);

    const path = await fm.getCurrentPath();
    await test.step('Verify breadcrumb shows Home at the root folder', async () => {
      expect(path, 'Breadcrumb should show "Home"').toContain('Home');
    });
  });

  test('user menu shows the correct username', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);

    const username = await fm.getLoggedInUsername();
    await test.step(`Verify user menu shows the correct username "${username}"`, async () => {
      expect(username, 'Username in the user menu should be u1').toBe('u1');
    });
  });

  test('logout succeeds and redirects to the Login page', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);
    await fm.logout();

    await test.step('Verify logout redirects to the Login page', async () => {
      await expect(authenticatedPage).toHaveURL(/Login/, { timeout: 15_000 });
    });
  });
});
