import { test, expect } from '../../fixtures/auth.fixture';
import { FileManagerPage } from '../../pages/dashboard.page';
import { FileListPage } from '../../pages/file-list.page';

test.describe('FileManager — Breadcrumb Icons', () => {
  test('CFTP_BREADCRUMB_TC_001 — log out via the icon in the breadcrumb bar', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.logout();

    await test.step('Verify redirect to the Login page after confirming logout', async () => {
      await expect(authenticatedPage, 'Must redirect to the Login page after confirming logout').toHaveURL(/Login/, {
        timeout: 15_000,
      });
    });
  });

  test('CFTP_BREADCRUMB_TC_002 — cancel logging out via the icon in the breadcrumb bar', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.cancelLogout();

    await test.step('Verify user remains on FileManager after cancelling logout', async () => {
      expect(await fm.isLoaded(), 'User must remain on FileManager after cancelling logout').toBeTruthy();
      await expect(authenticatedPage, 'URL must stay on FileManager after cancelling logout').toHaveURL(/FileManager/);
    });
  });

  test('CFTP_BREADCRUMB_TC_003 — change language via the icon in the breadcrumb bar', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    const headerBefore = await fm.getTableHeaderText();
    await test.step('Verify header shows English labels by default', async () => {
      expect(headerBefore, 'Header should show English labels by default').toContain('NAME');
    });

    await fm.changeLanguage('vi');
    await test.step('Verify header labels switch to the selected language', async () => {
      await expect(fm.getTableHeaderLocator(), 'Header labels must switch to the selected language').toContainText(
        'TÊN',
        { useInnerText: true },
      );
    });

    await fm.changeLanguage('en');
  });

  test('CFTP_BREADCRUMB_TC_004 — navigate back to the previous folder using the Back icon', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);
    const fileList = new FileListPage(authenticatedPage);

    await fileList.openSharesFolder();
    await test.step('Verify breadcrumb shows Shares after opening it', async () => {
      expect(await fm.getCurrentPath(), 'Breadcrumb must show Shares after opening it').toBe('Shares');
    });

    await fm.goBack();

    await test.step('Verify breadcrumb returns to Home after Back', async () => {
      await expect(fm.getBreadcrumbLocator(), 'Breadcrumb must return to Home after Back').toHaveText('Home');
    });
    await test.step('Verify Back icon becomes disabled once history is exhausted', async () => {
      expect(await fm.isBackDisabled(), 'Back icon must become disabled once history is exhausted').toBeTruthy();
    });
  });

  test('CFTP_BREADCRUMB_TC_005 — Back icon is disabled when there is no previous folder in history', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await test.step('Verify Back icon is disabled on a fresh session with no navigation', async () => {
      expect(await fm.isBackDisabled(), 'Back icon must be disabled on a fresh session with no navigation').toBeTruthy();
    });
  });

  test('CFTP_BREADCRUMB_TC_006 — navigate forward using the Forward icon after going back', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);
    const fileList = new FileListPage(authenticatedPage);

    await fileList.openSharesFolder();
    await fm.goBack();
    await test.step('Verify breadcrumb is back at Home', async () => {
      await expect(fm.getBreadcrumbLocator(), 'Breadcrumb must be back at Home').toHaveText('Home');
    });
    await test.step('Verify Forward icon becomes enabled after going Back', async () => {
      expect(await fm.isForwardDisabled(), 'Forward icon must become enabled after going Back').toBeFalsy();
    });

    await fm.goForward();

    // The Shares folder currently holds thousands of accumulated items (see
    // FileListPage.openSharesFolder()), so re-rendering it via Forward can take well over the
    // default assertion timeout — match the same extended timeout used there.
    await test.step('Verify breadcrumb shows Shares again after Forward', async () => {
      await expect(fm.getBreadcrumbLocator(), 'Breadcrumb must show Shares again after Forward').toHaveText(
        'Shares',
        {
          timeout: 2 * 60 * 1000,
        },
      );
    });
  });

  test('CFTP_BREADCRUMB_TC_007 — Forward icon is disabled when there is no forward history', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await test.step('Verify Forward icon is disabled on a fresh session with no prior Back navigation', async () => {
      expect(
        await fm.isForwardDisabled(),
        'Forward icon must be disabled on a fresh session with no prior Back navigation',
      ).toBeTruthy();
    });
  });

  test('CFTP_BREADCRUMB_TC_008 — navigate to the parent folder using the Up icon', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);
    const fileList = new FileListPage(authenticatedPage);

    await fileList.openSharesFolder();
    await test.step('Verify breadcrumb shows Shares after opening it', async () => {
      expect(await fm.getCurrentPath(), 'Breadcrumb must show Shares after opening it').toBe('Shares');
    });

    await fm.goUp();

    await test.step('Verify breadcrumb returns to Home (the parent folder) after Up', async () => {
      await expect(
        fm.getBreadcrumbLocator(),
        'Breadcrumb must return to Home (the parent folder) after Up',
      ).toHaveText('Home');
    });
    await test.step('Verify Up icon becomes disabled at the Home root', async () => {
      expect(await fm.isUpDisabled(), 'Up icon must become disabled at the Home root').toBeTruthy();
    });
  });

  test('CFTP_BREADCRUMB_TC_009 — Up icon is disabled at the Home root folder', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await test.step('Verify Up icon is disabled at the Home root folder', async () => {
      expect(await fm.isUpDisabled(), 'Up icon must be disabled at the Home root folder').toBeTruthy();
    });
  });

  test('CFTP_BREADCRUMB_TC_010 — refresh the file list using the Refresh icon', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);
    const countBefore = (await fm.getVisibleFileNames()).length;

    await fm.refresh();

    await test.step('Verify file list reloads with the same items and no duplicates', async () => {
      await expect(
        fm.getFileNamesLocator(),
        'File list must reload with the same items and no duplicates',
      ).toHaveCount(countBefore);
    });
  });

  test('CFTP_BREADCRUMB_TC_011 — switch to Compact view using the density view icon', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);
    const heightBefore = await fm.getFirstRowHeight();

    await fm.toggleDensity();

    const heightAfter = await fm.getFirstRowHeight();
    await test.step('Verify row height decreases when switching to Compact view', async () => {
      expect(heightAfter, 'Row height must decrease when switching to Compact view').toBeLessThan(heightBefore);
    });
    await test.step('Verify tooltip offers to switch back to comfortable view', async () => {
      expect(await fm.getDensityButtonTitle(), 'Tooltip must offer to switch back to comfortable view').toBe(
        'Switch to comfortable view',
      );
    });
  });

  test('CFTP_BREADCRUMB_TC_012 — switch to Comfortable view using the density view icon', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);
    await fm.toggleDensity();
    const heightCompact = await fm.getFirstRowHeight();

    await fm.toggleDensity();

    const heightComfortable = await fm.getFirstRowHeight();
    await test.step('Verify row height increases when switching back to Comfortable view', async () => {
      expect(heightComfortable, 'Row height must increase when switching back to Comfortable view').toBeGreaterThan(
        heightCompact,
      );
    });
    await test.step('Verify tooltip offers to switch back to compact view', async () => {
      expect(await fm.getDensityButtonTitle(), 'Tooltip must offer to switch back to compact view').toBe(
        'Switch to compact view',
      );
    });
  });

  test('CFTP_BREADCRUMB_TC_013 — navigate to the Manage Account page using the account icon', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.goToManageAccount();

    await test.step('Verify navigation to the Account Management page', async () => {
      await expect(authenticatedPage, 'Must navigate to the Account Management page').toHaveURL(/\/Account\//);
      await expect(
        authenticatedPage.getByRole('heading', { name: 'Account Management' }),
        'Account Management page must show its heading',
      ).toBeVisible();
    });
  });
});
