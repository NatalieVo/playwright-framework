import { test, expect } from '../../fixtures/auth.fixture';
import { FileListPage } from '../../pages/file-list.page';
import { FileManagerPage } from '../../pages/dashboard.page';
import { TestData } from '../../utils/test-data';
import { formatDate } from '../../utils/helpers';

const SHARE_PASSWORD = 'Setup@2026';

async function goHome(filePage: FileListPage, authenticatedPage: import('@playwright/test').Page): Promise<void> {
  await authenticatedPage.goto('/FileManager/4/', { waitUntil: 'domcontentloaded' });
  await filePage.waitForLoaded();
}

// isVisible() alone is a one-shot check with no auto-retry — right after navigation the row may
// not have rendered yet, misreporting "gone". Give it a short window before concluding either way.
async function stillExists(filePage: FileListPage, fileName: string): Promise<boolean> {
  try {
    await filePage.waitForVisible(filePage.fileRow(fileName), 4_000);
    return true;
  } catch {
    return false;
  }
}

// A single delete attempt occasionally doesn't stick (the same context-menu/timing flake that
// affects test actions), silently leaving debris that grows the list and makes later tests in
// the same run more likely to flake too. Retry a few times and verify the row is actually gone
// before giving up, instead of accepting the first attempt's outcome unconditionally.
async function cleanupFile(filePage: FileListPage, authenticatedPage: import('@playwright/test').Page, fileName: string): Promise<void> {
  // Deleting the FILE (below) does not remove its Share record — the record survives as an orphan,
  // visible only inside the Shares view (Search doesn't index it either), and silently accumulates
  // across every run — see project_share_json_serialization_bug.md. If the test itself didn't
  // already unshare the file (e.g. TC_011a/021/024/029/033/037 do this as their own assertion), it
  // must happen here, BEFORE the file is deleted, or this cleanup just leaks a fresh orphan every time.
  await goHome(filePage, authenticatedPage);
  await filePage.openSharesFolder();
  if (await filePage.isFileVisible(fileName)) {
    await filePage.deleteShare(fileName).catch(() => undefined);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    await goHome(filePage, authenticatedPage);
    if (!(await stillExists(filePage, fileName))) {
      return; // already gone (or never existed)
    }
    await filePage.deleteFile(fileName).catch(() => undefined);
    // Deleting a file that's still shared also mutates its share record — pace retries the same
    // way other rapid Share writes need to be paced, or a failing attempt just repeats instantly.
    await authenticatedPage.waitForTimeout(1_500);
    await goHome(filePage, authenticatedPage);
    if (!(await stillExists(filePage, fileName))) {
      return;
    }
  }
}

test.describe('Shares Folder Management (CFTP.FILEMANAGER.SHARE.001-100)', () => {
  // Previous flaky runs can leave debris behind if a test fails before afterEach runs. The Home
  // listing is virtualized (only renders rows near the viewport), so scanning it directly misses
  // most leftovers in a long list — Search returns the full, unvirtualized result set instead.
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const { LoginPage } = await import('../../pages/login.page');
    const { FileManagerPage } = await import('../../pages/dashboard.page');
    const { env } = await import('../../utils/env.config');
    await page.goto('/FileManager/4/', { waitUntil: 'domcontentloaded' });
    await new LoginPage(page).login(env.USERNAME, env.PASSWORD);
    await page.waitForSelector('[data-testid="app-header"]', { state: 'visible', timeout: 30_000 });

    const fileManager = new FileManagerPage(page);
    const fileList = new FileListPage(page);
    const safePrefix = /^auto_share(pub|pwd|stopped)_/i;

    // A single delete pass here can silently leave debris behind (same context-menu timing
    // flake as elsewhere), which then accumulates across runs — re-check after each attempt
    // instead of firing once and trusting it worked. Search once: the search button/box toggles
    // rather than being idempotent, so re-invoking search() on every round can flip it closed.
    // Deleting a still-shared file also mutates its share record, which appears to hit the same
    // server-side rate-limit as other rapid Share writes — without pacing, a failed delete just
    // retries the same stuck item forever and never reaches the rest of the backlog.
    await fileManager.search('auto_share');
    await page.waitForLoadState('networkidle');
    let leftoverNames = (await fileList.getAllItemNames())
      .map((name) => name.trim())
      .filter((name) => safePrefix.test(name));
    let guard = 0;
    while (leftoverNames.length > 0 && guard < 200) {
      await fileList.deleteFile(leftoverNames[0]).catch(() => undefined);
      await page.waitForTimeout(2_500);
      leftoverNames = (await fileList.getAllItemNames())
        .map((name) => name.trim())
        .filter((name) => safePrefix.test(name));
      guard++;
    }
    await context.close();
  });

  test.describe('Public file', () => {
    let filePage: FileListPage;
    let fileManager: FileManagerPage;
    let fileName: string;

    test.beforeEach(async ({ authenticatedPage }) => {
      filePage = new FileListPage(authenticatedPage);
      fileManager = new FileManagerPage(authenticatedPage);
      fileName = TestData.generateFileName('auto_sharePub');
      await filePage.createFile(fileName);
      await filePage.shareFile(fileName);
      await filePage.confirmShareDialog();
      await filePage.openSharesFolder();
    });

    test.afterEach(async ({ authenticatedPage }) => {
      await cleanupFile(filePage, authenticatedPage, fileName);
    });

    test('CFTP_SHARE_TC_001 — Set Password with a valid password changes status to Password Protected', async () => {
      await filePage.submitSharePassword(fileName, SHARE_PASSWORD);

      await test.step(`Verify status of file "${fileName}" changes to Password Protected`, async () => {
        await expect(filePage.getShareStatusLocator(fileName)).toHaveText('Password Protected');
      });
    });

    test('CFTP_SHARE_TC_002 — Set Password with fewer than 4 characters shows a validation error, then Cancel leaves it Public', async ({
      authenticatedPage,
    }) => {
      await filePage.selectContextAction(fileName, 'set-password');
      await filePage.fillDialogInput('abc');
      await filePage.confirmDialog();

      await test.step('Verify an error dialog appears describing the password length rule', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'An error dialog must appear').toHaveText('Error');
        expect(
          await filePage.getDialogMessage(),
          'Error message must describe the password rule',
        ).toBe('Password must be at least 4 characters and must not start or end with a space.');
      });
      await filePage.confirmDialog();

      await test.step('Verify the Set Password form reappears after acknowledging the error', async () => {
        await expect(
          authenticatedPage.getByTestId('dialog-title'),
          'Set Password form must reappear after acknowledging the error',
        ).toHaveText('Set Password');
      });
      await filePage.cancelDialog();

      await test.step(`Verify file "${fileName}" remains Public after cancelling`, async () => {
        await expect(filePage.getShareStatusLocator(fileName), 'Status must remain Public').toHaveText('Public');
      });
    });

    test('CFTP_SHARE_TC_003 — Set Password retried with a valid password after an invalid attempt succeeds', async ({
      authenticatedPage,
    }) => {
      await filePage.selectContextAction(fileName, 'set-password');
      await filePage.fillDialogInput('ab');
      await filePage.confirmDialog();

      await test.step('Verify an error dialog appears for the invalid password', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'An error dialog must appear').toHaveText('Error');
      });
      await filePage.confirmDialog();

      await test.step('Verify the Set Password form reappears after acknowledging the error', async () => {
        await expect(
          authenticatedPage.getByTestId('dialog-title'),
          'Set Password form must reappear',
        ).toHaveText('Set Password');
      });
      await filePage.fillDialogInput(SHARE_PASSWORD);
      await filePage.confirmDialog();

      await test.step(`Verify status of file "${fileName}" becomes Password Protected`, async () => {
        await expect(
          filePage.getShareStatusLocator(fileName),
          'Status must become Password Protected',
        ).toHaveText('Password Protected');
      });
    });

    test('CFTP_SHARE_TC_004 — Set Password with an empty value shows a validation error, then Cancel leaves it Public', async ({
      authenticatedPage,
    }) => {
      await filePage.selectContextAction(fileName, 'set-password');
      await filePage.confirmDialog();

      await test.step('Verify an error dialog appears stating the password cannot be empty', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'An error dialog must appear').toHaveText('Error');
        expect(await filePage.getDialogMessage(), 'Error message must state the password cannot be empty').toBe(
          'Password cannot be empty.',
        );
      });
      await filePage.confirmDialog();

      await test.step('Verify the Set Password form reappears after acknowledging the error', async () => {
        await expect(
          authenticatedPage.getByTestId('dialog-title'),
          'Set Password form must reappear',
        ).toHaveText('Set Password');
      });
      await filePage.cancelDialog();

      await test.step(`Verify file "${fileName}" remains Public after cancelling`, async () => {
        await expect(filePage.getShareStatusLocator(fileName), 'Status must remain Public').toHaveText('Public');
      });
    });

    test('CFTP_SHARE_TC_005 — Cancel Set Password leaves the file Public', async () => {
      await filePage.selectContextAction(fileName, 'set-password');
      await filePage.cancelDialog();

      await test.step(`Verify file "${fileName}" remains Public after cancelling Set Password`, async () => {
        await expect(filePage.getShareStatusLocator(fileName), 'Status must remain Public').toHaveText('Public');
      });
    });

    test('CFTP_SHARE_TC_006 — Stop Sharing changes status to Stopped', async () => {
      await filePage.stopSharing(fileName);

      await test.step(`Verify status of file "${fileName}" changes to Stopped`, async () => {
        await expect(filePage.getShareStatusLocator(fileName)).toHaveText('Stopped');
      });
    });

    test('CFTP_SHARE_TC_007 — Cancel Stop Sharing leaves the file Public', async () => {
      await filePage.cancelStopSharing(fileName);

      await test.step(`Verify file "${fileName}" remains Public after cancelling Stop Sharing`, async () => {
        await expect(filePage.getShareStatusLocator(fileName)).toHaveText('Public');
      });
    });

    test('CFTP_SHARE_TC_008 — Copy Link shows a confirmation dialog', async ({ authenticatedPage }) => {
      await filePage.copyShareLink(fileName);

      await test.step('Verify the Copy Link confirmation dialog appears', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'Copy Link dialog must appear').toHaveText(
          'Copy Link',
        );
        expect(await filePage.getDialogMessage()).toContain('copied to clipboard');
      });
      await filePage.confirmDialog();
    });

    test('CFTP_SHARE_TC_009 — Change Expiry updates the expiry date', async () => {
      const before = await filePage.getShareExpiry(fileName);
      const newDate = formatDate(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));

      await filePage.changeExpiry(fileName, newDate);

      await test.step(`Verify expiry date of file "${fileName}" changes`, async () => {
        await expect(filePage.getShareExpiryLocator(fileName), 'Expiry date must change').not.toHaveText(before);
      });
    });

    test('CFTP_SHARE_TC_010 — Cancel Change Expiry keeps the original expiry date', async () => {
      const before = await filePage.getShareExpiry(fileName);
      const attemptedDate = formatDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));

      await filePage.cancelChangeExpiry(fileName, attemptedDate);

      await test.step(`Verify expiry date of file "${fileName}" remains unchanged after cancelling`, async () => {
        await expect(filePage.getShareExpiryLocator(fileName), 'Expiry date must remain unchanged').toHaveText(before);
      });
    });

    test('CFTP_SHARE_TC_011a — Delete removes the file from Shares but it survives unshared in Home', async ({
      authenticatedPage,
    }) => {
      await filePage.deleteShare(fileName);

      await test.step(`Verify file "${fileName}" is no longer listed in Shares`, async () => {
        await expect(filePage.fileRow(fileName), 'File must no longer be listed in Shares').toBeHidden();
      });

      await goHome(filePage, authenticatedPage);
      await test.step(`Verify file "${fileName}" still exists in Home unshared`, async () => {
        await expect(filePage.fileRow(fileName), 'File must still exist in Home').toBeVisible();
      });
    });

    test('CFTP_SHARE_TC_011b — Cancel deleting the share keeps the file Public in Shares', async () => {
      await filePage.cancelDeleteShare(fileName);

      await test.step(`Verify file "${fileName}" remains listed in Shares as Public after cancelling delete`, async () => {
        await expect(filePage.fileRow(fileName), 'File must remain listed in Shares').toBeVisible();
        await expect(filePage.getShareStatusLocator(fileName)).toHaveText('Public');
      });
    });

    test('CFTP_SHARE_TC_026 — Download is enabled for a Public shared file and downloads successfully', async () => {
      await fileManager.selectFile(fileName);
      await test.step('Verify the Download icon is enabled once the file is selected', async () => {
        expect(await fileManager.isDownloadDisabled(), 'Download icon must be enabled once the file is selected').toBeFalsy();
      });

      const [download] = await fileManager.downloadViaToolbar(1);

      await test.step(`Verify the downloaded file matches the shared file name "${fileName}"`, async () => {
        expect(download.suggestedFilename(), 'Downloaded file must match the shared file name').toBe(fileName);
      });
    });

    test('CFTP_SHARE_TC_027 — Cut is enabled but blocked with an error for a Public shared file', async ({
      authenticatedPage,
    }) => {
      await fileManager.selectFile(fileName);
      await test.step('Verify the Cut icon is enabled once the file is selected', async () => {
        expect(await fileManager.isCutDisabled(), 'Cut icon must be enabled once the file is selected').toBeFalsy();
      });

      await fileManager.clickCutButton();

      await test.step('Verify an error dialog explains files cannot be moved out of Shares', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'An error dialog must appear').toHaveText('Error');
        expect(await fileManager.getDialogMessage(), 'Error message must explain files cannot be moved out of Shares').toBe(
          'Files cannot be moved out of the Shares folder. Use copy instead.',
        );
      });
      await fileManager.confirmDialog();

      await test.step(`Verify file "${fileName}" remains listed in Shares, unmoved`, async () => {
        await expect(filePage.fileRow(fileName), 'File must remain listed in Shares, unmoved').toBeVisible();
      });
    });

    test('CFTP_SHARE_TC_028 — Copy is enabled for a Public shared file and can be pasted into another folder', async ({
      authenticatedPage,
    }) => {
      await fileManager.selectFile(fileName);
      await test.step('Verify the Copy icon is enabled once the file is selected', async () => {
        expect(await fileManager.isCopyDisabled(), 'Copy icon must be enabled once the file is selected').toBeFalsy();
      });

      await fileManager.clickCopyButton();
      await test.step('Verify the clipboard indicator confirms the copy', async () => {
        expect(await fileManager.getClipboardInfoText(), 'Clipboard indicator must confirm the copy').toContain(
          '1 item copied',
        );
      });
      // Copy on a Shares-view item is itself a Share-record interaction, subject to the same
      // server-side contention documented for rapid successive Share writes elsewhere in this
      // suite (project_share_json_serialization_bug.md) — give it a moment before navigating away.
      await authenticatedPage.waitForTimeout(1_500);

      const destFolder = TestData.generateFolderName('auto_shareCopyDestPub');
      await filePage.navigateUp();
      await filePage.waitUntilAtHomeRoot();
      await filePage.createFolder(destFolder);
      await filePage.openFolder(destFolder);
      await fileManager.pasteViaToolbar();

      await test.step(`Verify copied file "${fileName}" appears in the destination folder`, async () => {
        await expect(filePage.fileRow(fileName), 'Copied file must appear in the destination folder').toBeVisible();
      });

      await filePage.navigateUp();
      await filePage.waitUntilAtHomeRoot();
      await filePage.deleteFile(destFolder).catch(() => undefined);
    });

    test('CFTP_SHARE_TC_029 — Delete is enabled for a Public shared file and removes it from Shares (survives unshared in Home)', async ({
      authenticatedPage,
    }) => {
      await fileManager.selectFile(fileName);
      await test.step('Verify the Delete icon is enabled once the file is selected', async () => {
        expect(await fileManager.isDeleteDisabled(), 'Delete icon must be enabled once the file is selected').toBeFalsy();
      });

      await fileManager.deleteSelectedViaToolbar(fileName);

      await test.step(`Verify file "${fileName}" is no longer listed in Shares`, async () => {
        await expect(filePage.fileRow(fileName), 'File must no longer be listed in Shares').toBeHidden();
      });

      await goHome(filePage, authenticatedPage);
      await test.step(`Verify file "${fileName}" still exists in Home unshared`, async () => {
        await expect(filePage.fileRow(fileName), 'File must still exist in Home').toBeVisible();
      });
    });
  });

  test.describe('Password Protected file', () => {
    let filePage: FileListPage;
    let fileManager: FileManagerPage;
    let fileName: string;

    test.beforeEach(async ({ authenticatedPage }) => {
      filePage = new FileListPage(authenticatedPage);
      fileManager = new FileManagerPage(authenticatedPage);
      fileName = TestData.generateFileName('auto_sharePwd');
      await filePage.createFile(fileName);
      await filePage.shareWithPassword(fileName, SHARE_PASSWORD);
      await filePage.confirmShareDialog();
      await filePage.openSharesFolder();
    });

    test.afterEach(async ({ authenticatedPage }) => {
      await cleanupFile(filePage, authenticatedPage, fileName);
    });

    test('CFTP_SHARE_TC_012 — Copy Link shows a confirmation dialog', async ({ authenticatedPage }) => {
      await filePage.copyShareLink(fileName);

      await test.step('Verify the Copy Link confirmation dialog appears', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'Copy Link dialog must appear').toHaveText(
          'Copy Link',
        );
        expect(await filePage.getDialogMessage()).toContain('copied to clipboard');
      });
      await filePage.confirmDialog();
    });

    test('CFTP_SHARE_TC_013 — Change Expiry updates the expiry date', async () => {
      const before = await filePage.getShareExpiry(fileName);
      const newDate = formatDate(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));

      await filePage.changeExpiry(fileName, newDate);

      await test.step(`Verify expiry date of file "${fileName}" changes`, async () => {
        await expect(filePage.getShareExpiryLocator(fileName), 'Expiry date must change').not.toHaveText(before);
      });
    });

    test('CFTP_SHARE_TC_014 — Cancel Change Expiry keeps the original expiry date', async () => {
      const before = await filePage.getShareExpiry(fileName);
      const attemptedDate = formatDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));

      await filePage.cancelChangeExpiry(fileName, attemptedDate);

      await test.step(`Verify expiry date of file "${fileName}" remains unchanged after cancelling`, async () => {
        await expect(filePage.getShareExpiryLocator(fileName), 'Expiry date must remain unchanged').toHaveText(before);
      });
    });

    test('CFTP_SHARE_TC_017 — Remove Password changes status to Public', async () => {
      await filePage.removeSharePassword(fileName);

      await test.step(`Verify status of file "${fileName}" changes to Public`, async () => {
        await expect(filePage.getShareStatusLocator(fileName)).toHaveText('Public');
      });
    });

    test('CFTP_SHARE_TC_018 — Cancel Remove Password leaves the file Password Protected', async () => {
      await filePage.cancelRemoveSharePassword(fileName);

      await test.step(`Verify file "${fileName}" remains Password Protected after cancelling Remove Password`, async () => {
        await expect(filePage.getShareStatusLocator(fileName)).toHaveText('Password Protected');
      });
    });

    test('CFTP_SHARE_TC_019 — Stop Sharing changes status to Stopped', async () => {
      await filePage.stopSharing(fileName);

      await test.step(`Verify status of file "${fileName}" changes to Stopped`, async () => {
        await expect(filePage.getShareStatusLocator(fileName)).toHaveText('Stopped');
      });
    });

    test('CFTP_SHARE_TC_020 — Cancel Stop Sharing leaves the file Password Protected', async () => {
      await filePage.cancelStopSharing(fileName);

      await test.step(`Verify file "${fileName}" remains Password Protected after cancelling Stop Sharing`, async () => {
        await expect(filePage.getShareStatusLocator(fileName)).toHaveText('Password Protected');
      });
    });

    test('CFTP_SHARE_TC_021 — Delete removes the file from Shares but it survives unshared in Home', async ({
      authenticatedPage,
    }) => {
      await filePage.deleteShare(fileName);

      await test.step(`Verify file "${fileName}" is no longer listed in Shares`, async () => {
        await expect(filePage.fileRow(fileName), 'File must no longer be listed in Shares').toBeHidden();
      });

      await goHome(filePage, authenticatedPage);
      await test.step(`Verify file "${fileName}" still exists in Home unshared`, async () => {
        await expect(filePage.fileRow(fileName), 'File must still exist in Home').toBeVisible();
      });
    });

    test('CFTP_SHARE_TC_022 — Cancel deleting the share keeps the file Password Protected in Shares', async () => {
      await filePage.cancelDeleteShare(fileName);

      await test.step(`Verify file "${fileName}" remains listed in Shares as Password Protected after cancelling delete`, async () => {
        await expect(filePage.fileRow(fileName), 'File must remain listed in Shares').toBeVisible();
        await expect(filePage.getShareStatusLocator(fileName)).toHaveText('Password Protected');
      });
    });

    test('CFTP_SHARE_TC_030 — Download is enabled for a Password Protected shared file and downloads successfully', async () => {
      await fileManager.selectFile(fileName);
      await test.step('Verify the Download icon is enabled once the file is selected', async () => {
        expect(await fileManager.isDownloadDisabled(), 'Download icon must be enabled once the file is selected').toBeFalsy();
      });

      const [download] = await fileManager.downloadViaToolbar(1);

      await test.step(`Verify the downloaded file matches the shared file name "${fileName}"`, async () => {
        expect(download.suggestedFilename(), 'Downloaded file must match the shared file name').toBe(fileName);
      });
    });

    test('CFTP_SHARE_TC_031 — Cut is enabled but blocked with an error for a Password Protected shared file', async ({
      authenticatedPage,
    }) => {
      await fileManager.selectFile(fileName);
      await test.step('Verify the Cut icon is enabled once the file is selected', async () => {
        expect(await fileManager.isCutDisabled(), 'Cut icon must be enabled once the file is selected').toBeFalsy();
      });

      await fileManager.clickCutButton();

      await test.step('Verify an error dialog explains files cannot be moved out of Shares', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'An error dialog must appear').toHaveText('Error');
        expect(await fileManager.getDialogMessage(), 'Error message must explain files cannot be moved out of Shares').toBe(
          'Files cannot be moved out of the Shares folder. Use copy instead.',
        );
      });
      await fileManager.confirmDialog();

      await test.step(`Verify file "${fileName}" remains listed in Shares, unmoved`, async () => {
        await expect(filePage.fileRow(fileName), 'File must remain listed in Shares, unmoved').toBeVisible();
      });
    });

    test('CFTP_SHARE_TC_032 — Copy is enabled for a Password Protected shared file and can be pasted into another folder', async ({
      authenticatedPage,
    }) => {
      await fileManager.selectFile(fileName);
      await test.step('Verify the Copy icon is enabled once the file is selected', async () => {
        expect(await fileManager.isCopyDisabled(), 'Copy icon must be enabled once the file is selected').toBeFalsy();
      });

      await fileManager.clickCopyButton();
      await test.step('Verify the clipboard indicator confirms the copy', async () => {
        expect(await fileManager.getClipboardInfoText(), 'Clipboard indicator must confirm the copy').toContain(
          '1 item copied',
        );
      });
      // Copy on a Shares-view item is itself a Share-record interaction, subject to the same
      // server-side contention documented for rapid successive Share writes elsewhere in this
      // suite (project_share_json_serialization_bug.md) — give it a moment before navigating away.
      await authenticatedPage.waitForTimeout(1_500);

      const destFolder = TestData.generateFolderName('auto_shareCopyDestPwd');
      await filePage.navigateUp();
      await filePage.waitUntilAtHomeRoot();
      await filePage.createFolder(destFolder);
      await filePage.openFolder(destFolder);
      await fileManager.pasteViaToolbar();

      await test.step(`Verify copied file "${fileName}" appears in the destination folder`, async () => {
        await expect(filePage.fileRow(fileName), 'Copied file must appear in the destination folder').toBeVisible();
      });

      await filePage.navigateUp();
      await filePage.waitUntilAtHomeRoot();
      await filePage.deleteFile(destFolder).catch(() => undefined);
    });

    test('CFTP_SHARE_TC_033 — Delete is enabled for a Password Protected shared file and removes it from Shares (survives unshared in Home)', async ({
      authenticatedPage,
    }) => {
      await fileManager.selectFile(fileName);
      await test.step('Verify the Delete icon is enabled once the file is selected', async () => {
        expect(await fileManager.isDeleteDisabled(), 'Delete icon must be enabled once the file is selected').toBeFalsy();
      });

      await fileManager.deleteSelectedViaToolbar(fileName);

      await test.step(`Verify file "${fileName}" is no longer listed in Shares`, async () => {
        await expect(filePage.fileRow(fileName), 'File must no longer be listed in Shares').toBeHidden();
      });

      await goHome(filePage, authenticatedPage);
      await test.step(`Verify file "${fileName}" still exists in Home unshared`, async () => {
        await expect(filePage.fileRow(fileName), 'File must still exist in Home').toBeVisible();
      });
    });
  });

  test.describe('Stopped file', () => {
    let filePage: FileListPage;
    let fileManager: FileManagerPage;
    let fileName: string;

    test.beforeEach(async ({ authenticatedPage }) => {
      filePage = new FileListPage(authenticatedPage);
      fileManager = new FileManagerPage(authenticatedPage);
      fileName = TestData.generateFileName('auto_shareStopped');
      await filePage.createFile(fileName);
      await filePage.shareFile(fileName);
      await filePage.confirmShareDialog();
      await filePage.openSharesFolder();
      await filePage.stopSharing(fileName);
      // Stop Sharing is itself a Share-record write (see project_share_json_serialization_bug.md) —
      // a test starting immediately after can hit the same server-side contention that affects
      // rapid successive Share writes elsewhere in this suite. Give it a moment to settle before
      // the test body's own actions (e.g. another Share-record mutation like Copy) begin.
      await authenticatedPage.waitForTimeout(1_500);
    });

    test.afterEach(async ({ authenticatedPage }) => {
      await cleanupFile(filePage, authenticatedPage, fileName);
    });

    test('CFTP_SHARE_TC_023 — Restart Sharing changes status back to Public', async ({ authenticatedPage }) => {
      await filePage.selectContextAction(fileName, 'restart-sharing');

      await test.step('Verify the Share Restarted confirmation dialog appears', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'Share Restarted dialog must appear').toHaveText(
          'Share Restarted',
        );
        expect(await filePage.getDialogMessage()).toContain('is now sharing again');
      });
      await filePage.confirmDialog();

      await test.step(`Verify status of file "${fileName}" changes back to Public`, async () => {
        await expect(filePage.getShareStatusLocator(fileName)).toHaveText('Public');
      });
    });

    test('CFTP_SHARE_TC_024 — Delete removes the file from Shares but it survives unshared in Home', async ({
      authenticatedPage,
    }) => {
      await filePage.deleteShare(fileName);

      await test.step(`Verify file "${fileName}" is no longer listed in Shares`, async () => {
        await expect(filePage.fileRow(fileName), 'File must no longer be listed in Shares').toBeHidden();
      });

      await goHome(filePage, authenticatedPage);
      await test.step(`Verify file "${fileName}" still exists in Home unshared`, async () => {
        await expect(filePage.fileRow(fileName), 'File must still exist in Home').toBeVisible();
      });
    });

    test('CFTP_SHARE_TC_025 — Cancel deleting the share keeps the file Stopped in Shares', async () => {
      await filePage.cancelDeleteShare(fileName);

      await test.step(`Verify file "${fileName}" remains listed in Shares as Stopped after cancelling delete`, async () => {
        await expect(filePage.fileRow(fileName), 'File must remain listed in Shares').toBeVisible();
        await expect(filePage.getShareStatusLocator(fileName)).toHaveText('Stopped');
      });
    });

    test('CFTP_SHARE_TC_034 — Download is enabled for a Stopped shared file and downloads successfully', async () => {
      await fileManager.selectFile(fileName);
      await test.step('Verify the Download icon is enabled once the file is selected', async () => {
        expect(await fileManager.isDownloadDisabled(), 'Download icon must be enabled once the file is selected').toBeFalsy();
      });

      const [download] = await fileManager.downloadViaToolbar(1);

      await test.step(`Verify the downloaded file matches the shared file name "${fileName}"`, async () => {
        expect(download.suggestedFilename(), 'Downloaded file must match the shared file name').toBe(fileName);
      });
    });

    test('CFTP_SHARE_TC_035 — Cut is enabled but blocked with an error for a Stopped shared file', async ({
      authenticatedPage,
    }) => {
      await fileManager.selectFile(fileName);
      await test.step('Verify the Cut icon is enabled once the file is selected', async () => {
        expect(await fileManager.isCutDisabled(), 'Cut icon must be enabled once the file is selected').toBeFalsy();
      });

      await fileManager.clickCutButton();

      await test.step('Verify an error dialog explains files cannot be moved out of Shares', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'An error dialog must appear').toHaveText('Error');
        expect(await fileManager.getDialogMessage(), 'Error message must explain files cannot be moved out of Shares').toBe(
          'Files cannot be moved out of the Shares folder. Use copy instead.',
        );
      });
      await fileManager.confirmDialog();

      await test.step(`Verify file "${fileName}" remains listed in Shares, unmoved`, async () => {
        await expect(filePage.fileRow(fileName), 'File must remain listed in Shares, unmoved').toBeVisible();
      });
    });

    test('CFTP_SHARE_TC_036 — Copy is enabled for a Stopped shared file and can be pasted into another folder', async ({
      authenticatedPage,
    }) => {
      // Stopped-file tests start from an extra Share-record write (Stop Sharing, in beforeEach) on
      // top of Copy's own — more headroom than the default 60s avoids riding right on the edge of
      // the documented server-side Share-write contention (project_share_json_serialization_bug.md).
      test.setTimeout(90_000);
      await fileManager.selectFile(fileName);
      await test.step('Verify the Copy icon is enabled once the file is selected', async () => {
        expect(await fileManager.isCopyDisabled(), 'Copy icon must be enabled once the file is selected').toBeFalsy();
      });

      await fileManager.clickCopyButton();
      await test.step('Verify the clipboard indicator confirms the copy', async () => {
        expect(await fileManager.getClipboardInfoText(), 'Clipboard indicator must confirm the copy').toContain(
          '1 item copied',
        );
      });
      // Copy on a Shares-view item is itself a Share-record interaction, subject to the same
      // server-side contention documented for rapid successive Share writes elsewhere in this
      // suite (project_share_json_serialization_bug.md) — give it a moment before navigating away.
      await authenticatedPage.waitForTimeout(1_500);

      const destFolder = TestData.generateFolderName('auto_shareCopyDestStopped');
      await filePage.navigateUp();
      await filePage.waitUntilAtHomeRoot();
      await filePage.createFolder(destFolder);
      await filePage.openFolder(destFolder);
      await fileManager.pasteViaToolbar();

      await test.step(`Verify copied file "${fileName}" appears in the destination folder`, async () => {
        await expect(filePage.fileRow(fileName), 'Copied file must appear in the destination folder').toBeVisible();
      });

      await filePage.navigateUp();
      await filePage.waitUntilAtHomeRoot();
      await filePage.deleteFile(destFolder).catch(() => undefined);
    });

    test('CFTP_SHARE_TC_037 — Delete is enabled for a Stopped shared file and removes it from Shares (survives unshared in Home)', async ({
      authenticatedPage,
    }) => {
      await fileManager.selectFile(fileName);
      await test.step('Verify the Delete icon is enabled once the file is selected', async () => {
        expect(await fileManager.isDeleteDisabled(), 'Delete icon must be enabled once the file is selected').toBeFalsy();
      });

      await fileManager.deleteSelectedViaToolbar(fileName);

      await test.step(`Verify file "${fileName}" is no longer listed in Shares`, async () => {
        await expect(filePage.fileRow(fileName), 'File must no longer be listed in Shares').toBeHidden();
      });

      await goHome(filePage, authenticatedPage);
      await test.step(`Verify file "${fileName}" still exists in Home unshared`, async () => {
        await expect(filePage.fileRow(fileName), 'File must still exist in Home').toBeVisible();
      });
    });
  });

  test.describe('Multi-select (2 Password Protected files)', () => {
    let filePage: FileListPage;
    let fileManager: FileManagerPage;
    let firstName: string;
    let secondName: string;

    test.beforeEach(async ({ authenticatedPage }) => {
      filePage = new FileListPage(authenticatedPage);
      fileManager = new FileManagerPage(authenticatedPage);
      firstName = TestData.generateFileName('auto_shareMsA');
      secondName = TestData.generateFileName('auto_shareMsB');
      await filePage.createFile(firstName);
      await filePage.shareWithPassword(firstName, SHARE_PASSWORD);
      await filePage.confirmShareDialog();
      await filePage.createFile(secondName);
      await filePage.shareWithPassword(secondName, SHARE_PASSWORD);
      await filePage.confirmShareDialog();
      // Two back-to-back Share-record writes can hit the documented server-side contention —
      // pace here the same way every other multi-select describe block in this file already does.
      await authenticatedPage.waitForTimeout(1_500);
      await filePage.openSharesFolder();
      await fileManager.selectFile(firstName);
      await fileManager.selectFile(secondName);
    });

    test.afterEach(async ({ authenticatedPage }) => {
      await cleanupFile(filePage, authenticatedPage, firstName);
      await cleanupFile(filePage, authenticatedPage, secondName);
    });

    test('CFTP_SHARE_TC_038 — Copy Link for two Password Protected shared files copies both links', async ({
      authenticatedPage,
    }) => {
      await filePage.copyShareLink(firstName);

      await test.step('Verify the Copy Link dialog confirms both links were copied', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'Copy Link dialog must appear').toHaveText(
          'Copy Link',
        );
        expect(await filePage.getDialogMessage(), 'Message must confirm both links were copied').toContain(
          '2 links copied to clipboard',
        );
      });
      await filePage.confirmDialog();
    });

    test('CFTP_SHARE_TC_039a — Change Expiry for two Password Protected shared files updates both dates', async () => {
      const beforeA = await filePage.getShareExpiry(firstName);
      const beforeB = await filePage.getShareExpiry(secondName);
      const newDate = formatDate(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));

      await filePage.changeExpiry(firstName, newDate);

      await test.step('Verify the expiry date changes for both selected files', async () => {
        await expect(filePage.getShareExpiryLocator(firstName), 'First file expiry must change').not.toHaveText(
          beforeA,
        );
        await expect(filePage.getShareExpiryLocator(secondName), 'Second file expiry must change').not.toHaveText(
          beforeB,
        );
      });
    });

    test('CFTP_SHARE_TC_039b — Cancel Change Expiry for two Password Protected shared files keeps both dates', async () => {
      const beforeA = await filePage.getShareExpiry(firstName);
      const beforeB = await filePage.getShareExpiry(secondName);
      const attemptedDate = formatDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));

      await filePage.cancelChangeExpiry(firstName, attemptedDate);

      await test.step('Verify the expiry date remains unchanged for both selected files after cancelling', async () => {
        await expect(
          filePage.getShareExpiryLocator(firstName),
          'First file expiry must remain unchanged',
        ).toHaveText(beforeA);
        await expect(
          filePage.getShareExpiryLocator(secondName),
          'Second file expiry must remain unchanged',
        ).toHaveText(beforeB);
      });
    });

    test('CFTP_SHARE_TC_040 — Remove Password for two Password Protected shared files changes both to Public', async () => {
      await filePage.removeSharePassword(firstName);

      await test.step('Verify status of both selected files changes to Public', async () => {
        await expect(filePage.getShareStatusLocator(firstName)).toHaveText('Public');
        await expect(filePage.getShareStatusLocator(secondName)).toHaveText('Public');
      });
    });

    test('CFTP_SHARE_TC_041 — Cancel Remove Password for two Password Protected shared files keeps both Password Protected', async () => {
      await filePage.cancelRemoveSharePassword(firstName);

      await test.step('Verify both selected files remain Password Protected after cancelling Remove Password', async () => {
        await expect(filePage.getShareStatusLocator(firstName)).toHaveText('Password Protected');
        await expect(filePage.getShareStatusLocator(secondName)).toHaveText('Password Protected');
      });
    });

    test('CFTP_SHARE_TC_042 — Stop Sharing for two Password Protected shared files changes both to Stopped', async () => {
      await filePage.stopSharing(firstName);

      await test.step('Verify status of both selected files changes to Stopped', async () => {
        await expect(filePage.getShareStatusLocator(firstName)).toHaveText('Stopped');
        await expect(filePage.getShareStatusLocator(secondName)).toHaveText('Stopped');
      });
    });

    test('CFTP_SHARE_TC_043 — Cancel Stop Sharing for two Password Protected shared files keeps both Password Protected', async () => {
      await filePage.cancelStopSharing(firstName);

      await test.step('Verify both selected files remain Password Protected after cancelling Stop Sharing', async () => {
        await expect(filePage.getShareStatusLocator(firstName)).toHaveText('Password Protected');
        await expect(filePage.getShareStatusLocator(secondName)).toHaveText('Password Protected');
      });
    });

    test('CFTP_SHARE_TC_044 — Delete for two Password Protected shared files removes both from Shares (survive unshared in Home)', async ({
      authenticatedPage,
    }) => {
      await filePage.deleteShare(firstName);

      await test.step('Verify both selected files are no longer listed in Shares', async () => {
        await expect(filePage.fileRow(firstName), 'First file must no longer be listed in Shares').toBeHidden();
        await expect(filePage.fileRow(secondName), 'Second file must no longer be listed in Shares').toBeHidden();
      });

      await goHome(filePage, authenticatedPage);
      await test.step('Verify both files still exist in Home unshared', async () => {
        await expect(filePage.fileRow(firstName), 'First file must still exist in Home').toBeVisible();
        await expect(filePage.fileRow(secondName), 'Second file must still exist in Home').toBeVisible();
      });
    });

    test('CFTP_SHARE_TC_045 — Cancel Delete for two Password Protected shared files keeps both listed', async () => {
      await filePage.cancelDeleteShare(firstName);

      await test.step('Verify both files remain listed in Shares as Password Protected after cancelling delete', async () => {
        await expect(filePage.fileRow(firstName), 'First file must remain listed in Shares').toBeVisible();
        await expect(filePage.fileRow(secondName), 'Second file must remain listed in Shares').toBeVisible();
        await expect(filePage.getShareStatusLocator(firstName)).toHaveText('Password Protected');
        await expect(filePage.getShareStatusLocator(secondName)).toHaveText('Password Protected');
      });
    });
  });

  test.describe('Multi-select (2 Public files)', () => {
    let filePage: FileListPage;
    let fileManager: FileManagerPage;
    let firstName: string;
    let secondName: string;

    test.beforeEach(async ({ authenticatedPage }) => {
      filePage = new FileListPage(authenticatedPage);
      fileManager = new FileManagerPage(authenticatedPage);
      firstName = TestData.generateFileName('auto_shareMsPubA');
      secondName = TestData.generateFileName('auto_shareMsPubB');
      await filePage.createFile(firstName);
      await filePage.shareFile(firstName);
      await filePage.confirmShareDialog();
      await filePage.createFile(secondName);
      await filePage.shareFile(secondName);
      await filePage.confirmShareDialog();
      // Two back-to-back Share-record writes can hit the documented server-side contention —
      // pace here the same way every other multi-select describe block in this file already does.
      await authenticatedPage.waitForTimeout(1_500);
      await filePage.openSharesFolder();
      await fileManager.selectFile(firstName);
      await fileManager.selectFile(secondName);
    });

    test.afterEach(async ({ authenticatedPage }) => {
      await cleanupFile(filePage, authenticatedPage, firstName);
      await cleanupFile(filePage, authenticatedPage, secondName);
    });

    test('CFTP_SHARE_TC_046 — Copy Link for two Public shared files copies both links', async ({
      authenticatedPage,
    }) => {
      await filePage.copyShareLink(firstName);

      await test.step('Verify the Copy Link dialog confirms both links were copied', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'Copy Link dialog must appear').toHaveText(
          'Copy Link',
        );
        expect(await filePage.getDialogMessage(), 'Message must confirm both links were copied').toContain(
          '2 links copied to clipboard',
        );
      });
      await filePage.confirmDialog();
    });

    test('CFTP_SHARE_TC_047 — Change Expiry for two Public shared files updates both dates', async () => {
      const beforeA = await filePage.getShareExpiry(firstName);
      const beforeB = await filePage.getShareExpiry(secondName);
      const newDate = formatDate(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));

      await filePage.changeExpiry(firstName, newDate);

      await test.step('Verify the expiry date changes for both selected files', async () => {
        await expect(filePage.getShareExpiryLocator(firstName), 'First file expiry must change').not.toHaveText(
          beforeA,
        );
        await expect(filePage.getShareExpiryLocator(secondName), 'Second file expiry must change').not.toHaveText(
          beforeB,
        );
      });
    });

    test('CFTP_SHARE_TC_048 — Cancel Change Expiry for two Public shared files keeps both dates', async () => {
      const beforeA = await filePage.getShareExpiry(firstName);
      const beforeB = await filePage.getShareExpiry(secondName);
      const attemptedDate = formatDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));

      await filePage.cancelChangeExpiry(firstName, attemptedDate);

      await test.step('Verify the expiry date remains unchanged for both selected files after cancelling', async () => {
        await expect(
          filePage.getShareExpiryLocator(firstName),
          'First file expiry must remain unchanged',
        ).toHaveText(beforeA);
        await expect(
          filePage.getShareExpiryLocator(secondName),
          'Second file expiry must remain unchanged',
        ).toHaveText(beforeB);
      });
    });

    test('CFTP_SHARE_TC_049 — Set Password for two Public shared files changes both to Password Protected', async () => {
      await filePage.submitSharePassword(firstName, SHARE_PASSWORD);

      await test.step('Verify status of both selected files changes to Password Protected', async () => {
        await expect(filePage.getShareStatusLocator(firstName)).toHaveText('Password Protected');
        await expect(filePage.getShareStatusLocator(secondName)).toHaveText('Password Protected');
      });
    });

    test('CFTP_SHARE_TC_050 — Cancel Set Password for two Public shared files keeps both Public', async () => {
      await filePage.cancelSharePassword(firstName, SHARE_PASSWORD);

      await test.step('Verify both selected files remain Public after cancelling Set Password', async () => {
        await expect(filePage.getShareStatusLocator(firstName)).toHaveText('Public');
        await expect(filePage.getShareStatusLocator(secondName)).toHaveText('Public');
      });
    });

    test('CFTP_SHARE_TC_051 — Stop Sharing for two Public shared files changes both to Stopped', async () => {
      await filePage.stopSharing(firstName);

      await test.step('Verify status of both selected files changes to Stopped', async () => {
        await expect(filePage.getShareStatusLocator(firstName)).toHaveText('Stopped');
        await expect(filePage.getShareStatusLocator(secondName)).toHaveText('Stopped');
      });
    });

    test('CFTP_SHARE_TC_052 — Cancel Stop Sharing for two Public shared files keeps both Public', async () => {
      await filePage.cancelStopSharing(firstName);

      await test.step('Verify both selected files remain Public after cancelling Stop Sharing', async () => {
        await expect(filePage.getShareStatusLocator(firstName)).toHaveText('Public');
        await expect(filePage.getShareStatusLocator(secondName)).toHaveText('Public');
      });
    });

    test('CFTP_SHARE_TC_053 — Delete for two Public shared files removes both from Shares (survive unshared in Home)', async ({
      authenticatedPage,
    }) => {
      await filePage.deleteShare(firstName);

      await test.step('Verify both selected files are no longer listed in Shares', async () => {
        await expect(filePage.fileRow(firstName), 'First file must no longer be listed in Shares').toBeHidden();
        await expect(filePage.fileRow(secondName), 'Second file must no longer be listed in Shares').toBeHidden();
      });

      await goHome(filePage, authenticatedPage);
      await test.step('Verify both files still exist in Home unshared', async () => {
        await expect(filePage.fileRow(firstName), 'First file must still exist in Home').toBeVisible();
        await expect(filePage.fileRow(secondName), 'Second file must still exist in Home').toBeVisible();
      });
    });

    test('CFTP_SHARE_TC_054 — Cancel Delete for two Public shared files keeps both listed', async () => {
      await filePage.cancelDeleteShare(firstName);

      await test.step('Verify both files remain listed in Shares as Public after cancelling delete', async () => {
        await expect(filePage.fileRow(firstName), 'First file must remain listed in Shares').toBeVisible();
        await expect(filePage.fileRow(secondName), 'Second file must remain listed in Shares').toBeVisible();
        await expect(filePage.getShareStatusLocator(firstName)).toHaveText('Public');
        await expect(filePage.getShareStatusLocator(secondName)).toHaveText('Public');
      });
    });
  });

  test.describe('Multi-select (2 Stopped files)', () => {
    let filePage: FileListPage;
    let fileManager: FileManagerPage;
    let firstName: string;
    let secondName: string;

    test.beforeEach(async ({ authenticatedPage }) => {
      filePage = new FileListPage(authenticatedPage);
      fileManager = new FileManagerPage(authenticatedPage);
      firstName = TestData.generateFileName('auto_shareMsStopA');
      secondName = TestData.generateFileName('auto_shareMsStopB');
      await filePage.createFile(firstName);
      await filePage.shareFile(firstName);
      await filePage.confirmShareDialog();
      await filePage.createFile(secondName);
      await filePage.shareFile(secondName);
      await filePage.confirmShareDialog();
      // Two back-to-back Share-record writes can hit the documented server-side contention —
      // pace here the same way every other multi-select describe block in this file already does.
      await authenticatedPage.waitForTimeout(1_500);
      await filePage.openSharesFolder();
      await filePage.stopSharing(firstName);
      await filePage.stopSharing(secondName);
      // Stop Sharing is a Share-record write, subject to the same server-side contention
      // documented for rapid successive Share writes elsewhere in this suite — pace before
      // the test body's own actions begin (project_share_json_serialization_bug.md).
      await authenticatedPage.waitForTimeout(1_500);
      await fileManager.selectFile(firstName);
      await fileManager.selectFile(secondName);
    });

    test.afterEach(async ({ authenticatedPage }) => {
      await cleanupFile(filePage, authenticatedPage, firstName);
      await cleanupFile(filePage, authenticatedPage, secondName);
    });

    test('CFTP_SHARE_TC_055 — Restart Sharing for two Stopped shared files changes both to Public', async ({
      authenticatedPage,
    }) => {
      await filePage.selectContextAction(firstName, 'restart-sharing');

      await test.step('Verify the Share Restarted confirmation dialog appears', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'Share Restarted dialog must appear').toHaveText(
          'Share Restarted',
        );
        expect(await filePage.getDialogMessage()).toContain('are now sharing again');
      });
      await filePage.confirmDialog();

      await test.step('Verify status of both selected files changes to Public', async () => {
        await expect(filePage.getShareStatusLocator(firstName)).toHaveText('Public');
        await expect(filePage.getShareStatusLocator(secondName)).toHaveText('Public');
      });
    });

    test('CFTP_SHARE_TC_056 — Delete for two Stopped shared files removes both from Shares (survive unshared in Home)', async ({
      authenticatedPage,
    }) => {
      await filePage.deleteShare(firstName);

      await test.step('Verify both selected files are no longer listed in Shares', async () => {
        await expect(filePage.fileRow(firstName), 'First file must no longer be listed in Shares').toBeHidden();
        await expect(filePage.fileRow(secondName), 'Second file must no longer be listed in Shares').toBeHidden();
      });

      await goHome(filePage, authenticatedPage);
      await test.step('Verify both files still exist in Home unshared', async () => {
        await expect(filePage.fileRow(firstName), 'First file must still exist in Home').toBeVisible();
        await expect(filePage.fileRow(secondName), 'Second file must still exist in Home').toBeVisible();
      });
    });

    test('CFTP_SHARE_TC_057 — Cancel Delete for two Stopped shared files keeps both listed', async () => {
      await filePage.cancelDeleteShare(firstName);

      await test.step('Verify both files remain listed in Shares as Stopped after cancelling delete', async () => {
        await expect(filePage.fileRow(firstName), 'First file must remain listed in Shares').toBeVisible();
        await expect(filePage.fileRow(secondName), 'Second file must remain listed in Shares').toBeVisible();
        await expect(filePage.getShareStatusLocator(firstName)).toHaveText('Stopped');
        await expect(filePage.getShareStatusLocator(secondName)).toHaveText('Stopped');
      });
    });
  });

  test.describe('Multi-select (mixed Public + Stopped)', () => {
    let filePage: FileListPage;
    let fileManager: FileManagerPage;
    let publicName: string;
    let stoppedName: string;

    test.beforeEach(async ({ authenticatedPage }) => {
      filePage = new FileListPage(authenticatedPage);
      fileManager = new FileManagerPage(authenticatedPage);
      publicName = TestData.generateFileName('auto_shareMsMixPub');
      stoppedName = TestData.generateFileName('auto_shareMsMixStop');
      await filePage.createFile(publicName);
      await filePage.shareFile(publicName);
      await filePage.confirmShareDialog();
      await filePage.createFile(stoppedName);
      await filePage.shareFile(stoppedName);
      await filePage.confirmShareDialog();
      // Two back-to-back Share-record writes can hit the documented server-side contention —
      // pace here the same way every other multi-select describe block in this file already does.
      await authenticatedPage.waitForTimeout(1_500);
      await filePage.openSharesFolder();
      await filePage.stopSharing(stoppedName);
      await authenticatedPage.waitForTimeout(1_500);
      await fileManager.selectFile(publicName);
      await fileManager.selectFile(stoppedName);
    });

    test.afterEach(async ({ authenticatedPage }) => {
      await cleanupFile(filePage, authenticatedPage, publicName);
      await cleanupFile(filePage, authenticatedPage, stoppedName);
    });

    test('CFTP_SHARE_TC_058 — Copy Link for two files (Public + Stopped) copies the Public one\'s link', async ({
      authenticatedPage,
    }) => {
      // A Stopped share has no active link to copy — unlike Set Password/Change Expiry, this
      // silently applies to just the Public file with no "N of M" warning first (real UI behavior,
      // verified via MCP recon — differs from the CSV, which assumes both links are copied).
      await filePage.copyShareLink(publicName);

      await test.step('Verify the Copy Link dialog confirms the Public link was copied', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'Copy Link dialog must appear').toHaveText(
          'Copy Link',
        );
        expect(await filePage.getDialogMessage(), 'Message must confirm the Public link was copied').toContain(
          'Link copied to clipboard',
        );
      });
      await filePage.confirmDialog();
    });

    test('CFTP_SHARE_TC_059 — Change Expiry for two files (Public + Stopped) only applies to the Public one', async () => {
      // Verified via MCP diagnostic: Change Expiry on a mixed selection shows the same "This will
      // only apply to 1 of 2 selected shares" warning as Set Password, then narrows to a per-file
      // dialog — it does NOT update both dates as the CSV assumes.
      const beforePublic = await filePage.getShareExpiry(publicName);
      const beforeStopped = await filePage.getShareExpiry(stoppedName);
      const newDate = formatDate(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));

      await filePage.changeExpiryMixed(publicName, newDate);

      await test.step('Verify Change Expiry only applies to the Public file', async () => {
        await expect(filePage.getShareExpiryLocator(publicName), 'Public file expiry must change').not.toHaveText(
          beforePublic,
        );
        await expect(
          filePage.getShareExpiryLocator(stoppedName),
          'Stopped file expiry must remain unchanged (not applicable to it)',
        ).toHaveText(beforeStopped);
      });
    });

    test('CFTP_SHARE_TC_060 — Cancel Change Expiry for two files (Public + Stopped) keeps both dates', async () => {
      const beforePublic = await filePage.getShareExpiry(publicName);
      const beforeStopped = await filePage.getShareExpiry(stoppedName);
      const attemptedDate = formatDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));

      await filePage.cancelChangeExpiryMixed(publicName, attemptedDate);

      await test.step('Verify the expiry date remains unchanged for both files after cancelling', async () => {
        await expect(
          filePage.getShareExpiryLocator(publicName),
          'Public file expiry must remain unchanged',
        ).toHaveText(beforePublic);
        await expect(
          filePage.getShareExpiryLocator(stoppedName),
          'Stopped file expiry must remain unchanged',
        ).toHaveText(beforeStopped);
      });
    });

    test('CFTP_SHARE_TC_061 — Set Password for two files (Public + Stopped) only applies to the Public one', async () => {
      await filePage.submitSharePasswordMixed(publicName, SHARE_PASSWORD);

      await test.step('Verify Set Password only applies to the Public file', async () => {
        await expect(filePage.getShareStatusLocator(publicName)).toHaveText('Password Protected');
        await expect(filePage.getShareStatusLocator(stoppedName)).toHaveText('Stopped');
      });
    });

    test('CFTP_SHARE_TC_062 — Cancel Set Password for two files (Public + Stopped) keeps the Public one Public', async () => {
      await filePage.cancelSharePasswordMixed(publicName, SHARE_PASSWORD);

      await test.step('Verify the Public file remains Public and the Stopped file remains Stopped after cancelling', async () => {
        await expect(filePage.getShareStatusLocator(publicName)).toHaveText('Public');
        await expect(filePage.getShareStatusLocator(stoppedName)).toHaveText('Stopped');
      });
    });

    test('CFTP_SHARE_TC_063 — Stop Sharing for two files (Public + Stopped) changes both to Stopped', async () => {
      await filePage.stopSharing(publicName);

      await test.step('Verify status of both selected files changes to Stopped', async () => {
        await expect(filePage.getShareStatusLocator(publicName)).toHaveText('Stopped');
        await expect(filePage.getShareStatusLocator(stoppedName)).toHaveText('Stopped');
      });
    });

    test('CFTP_SHARE_TC_064 — Cancel Stop Sharing for two files (Public + Stopped) keeps the original statuses', async () => {
      await filePage.cancelStopSharing(publicName);

      await test.step('Verify both files keep their original statuses after cancelling Stop Sharing', async () => {
        await expect(filePage.getShareStatusLocator(publicName)).toHaveText('Public');
        await expect(filePage.getShareStatusLocator(stoppedName)).toHaveText('Stopped');
      });
    });

    test('CFTP_SHARE_TC_065 — Restart Sharing for two files (Public + Stopped) changes both to Public', async ({
      authenticatedPage,
    }) => {
      await filePage.selectContextAction(publicName, 'restart-sharing');

      await test.step('Verify the Share Restarted confirmation dialog appears', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'Share Restarted dialog must appear').toHaveText(
          'Share Restarted',
        );
      });
      await filePage.confirmDialog();

      await test.step('Verify status of both selected files changes to Public', async () => {
        await expect(filePage.getShareStatusLocator(publicName)).toHaveText('Public');
        await expect(filePage.getShareStatusLocator(stoppedName)).toHaveText('Public');
      });
    });

    test('CFTP_SHARE_TC_066 — Delete for two files (Public + Stopped) removes both from Shares (survive unshared in Home)', async ({
      authenticatedPage,
    }) => {
      await filePage.deleteShare(publicName);

      await test.step('Verify both selected files are no longer listed in Shares', async () => {
        await expect(filePage.fileRow(publicName), 'Public file must no longer be listed in Shares').toBeHidden();
        await expect(filePage.fileRow(stoppedName), 'Stopped file must no longer be listed in Shares').toBeHidden();
      });

      await goHome(filePage, authenticatedPage);
      await test.step('Verify both files still exist in Home unshared', async () => {
        await expect(filePage.fileRow(publicName), 'Public file must still exist in Home').toBeVisible();
        await expect(filePage.fileRow(stoppedName), 'Stopped file must still exist in Home').toBeVisible();
      });
    });

    test('CFTP_SHARE_TC_067 — Cancel Delete for two files (Public + Stopped) keeps both listed', async () => {
      await filePage.cancelDeleteShare(publicName);

      await test.step('Verify both files remain listed in Shares with their original statuses after cancelling delete', async () => {
        await expect(filePage.fileRow(publicName), 'Public file must remain listed in Shares').toBeVisible();
        await expect(filePage.fileRow(stoppedName), 'Stopped file must remain listed in Shares').toBeVisible();
        await expect(filePage.getShareStatusLocator(publicName)).toHaveText('Public');
        await expect(filePage.getShareStatusLocator(stoppedName)).toHaveText('Stopped');
      });
    });

    test('CFTP_SHARE_TC_068 — Download is enabled for two files (Public + Stopped) and downloads successfully', async () => {
      await test.step('Verify the Download icon is enabled once both files are selected', async () => {
        expect(
          await fileManager.isDownloadDisabled(),
          'Download icon must be enabled once both files are selected',
        ).toBeFalsy();
      });

      const downloads = await fileManager.downloadViaToolbar(2);

      await test.step('Verify both selected files are downloaded', async () => {
        const filenames = downloads.map((d) => d.suggestedFilename());
        expect(filenames, 'Both selected files must be downloaded').toContain(publicName);
        expect(filenames, 'Both selected files must be downloaded').toContain(stoppedName);
      });
    });

    test('CFTP_SHARE_TC_069 — Cut is enabled but blocked with an error for two files (Public + Stopped)', async ({
      authenticatedPage,
    }) => {
      await test.step('Verify the Cut icon is enabled once both files are selected', async () => {
        expect(await fileManager.isCutDisabled(), 'Cut icon must be enabled once both files are selected').toBeFalsy();
      });

      await fileManager.clickCutButton();

      await test.step('Verify an error dialog explains files cannot be moved out of Shares', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'An error dialog must appear').toHaveText('Error');
        expect(await fileManager.getDialogMessage(), 'Error message must explain files cannot be moved out of Shares').toBe(
          'Files cannot be moved out of the Shares folder. Use copy instead.',
        );
      });
      await fileManager.confirmDialog();

      await test.step('Verify both files remain in Shares, unmoved', async () => {
        await expect(filePage.fileRow(publicName), 'Public file must remain in Shares, unmoved').toBeVisible();
        await expect(filePage.fileRow(stoppedName), 'Stopped file must remain in Shares, unmoved').toBeVisible();
      });
    });

    test('CFTP_SHARE_TC_070 — Copy is enabled for two files (Public + Stopped) and can be pasted into another folder', async ({
      authenticatedPage,
    }) => {
      await test.step('Verify the Copy icon is enabled once both files are selected', async () => {
        expect(await fileManager.isCopyDisabled(), 'Copy icon must be enabled once both files are selected').toBeFalsy();
      });

      await fileManager.clickCopyButton();
      await test.step('Verify the clipboard indicator confirms both items were copied', async () => {
        expect(await fileManager.getClipboardInfoText(), 'Clipboard indicator must confirm the copy').toContain(
          '2 items copied',
        );
      });
      await authenticatedPage.waitForTimeout(1_500);

      const destFolder = TestData.generateFolderName('auto_shareCopyDestMix');
      await filePage.navigateUp();
      await filePage.waitUntilAtHomeRoot();
      await filePage.createFolder(destFolder);
      await filePage.openFolder(destFolder);
      await fileManager.pasteViaToolbar();

      await test.step('Verify both copied files appear in the destination folder', async () => {
        await expect(filePage.fileRow(publicName), 'Public file must appear in the destination folder').toBeVisible();
        await expect(
          filePage.fileRow(stoppedName),
          'Stopped file must appear in the destination folder',
        ).toBeVisible();
      });

      await filePage.navigateUp();
      await filePage.waitUntilAtHomeRoot();
      await filePage.deleteFile(destFolder).catch(() => undefined);
    });

    test('CFTP_SHARE_TC_071 — Delete is enabled for two files (Public + Stopped) and removes both from Shares (survive unshared in Home)', async ({
      authenticatedPage,
    }) => {
      await test.step('Verify the Delete icon is enabled once both files are selected', async () => {
        expect(
          await fileManager.isDeleteDisabled(),
          'Delete icon must be enabled once both files are selected',
        ).toBeFalsy();
      });

      await fileManager.deleteSelectedViaToolbar(publicName);

      await test.step('Verify both selected files are no longer listed in Shares', async () => {
        await expect(filePage.fileRow(publicName), 'Public file must no longer be listed in Shares').toBeHidden();
        await expect(filePage.fileRow(stoppedName), 'Stopped file must no longer be listed in Shares').toBeHidden();
      });

      await goHome(filePage, authenticatedPage);
      await test.step('Verify both files still exist in Home unshared', async () => {
        await expect(filePage.fileRow(publicName), 'Public file must still exist in Home').toBeVisible();
        await expect(filePage.fileRow(stoppedName), 'Stopped file must still exist in Home').toBeVisible();
      });
    });
  });

  test.describe('Multi-select (mixed Public + Password Protected)', () => {
    let filePage: FileListPage;
    let fileManager: FileManagerPage;
    let publicName: string;
    let pwdName: string;

    test.beforeEach(async ({ authenticatedPage }) => {
      filePage = new FileListPage(authenticatedPage);
      fileManager = new FileManagerPage(authenticatedPage);
      publicName = TestData.generateFileName('auto_shareMsMixPubE');
      pwdName = TestData.generateFileName('auto_shareMsMixPwdE');
      await filePage.createFile(publicName);
      await filePage.shareFile(publicName);
      await filePage.confirmShareDialog();
      await filePage.createFile(pwdName);
      await filePage.shareWithPassword(pwdName, SHARE_PASSWORD);
      await filePage.confirmShareDialog();
      // Rapid back-to-back Share-record mutations (create + share twice) occasionally hit the
      // documented server-side rate-limit, leaving the union context menu's status computation
      // briefly stale — pace here so the menu is settled before tests read it.
      await authenticatedPage.waitForTimeout(1_500);
      await filePage.openSharesFolder();
      await fileManager.selectFile(publicName);
      await fileManager.selectFile(pwdName);
    });

    test.afterEach(async ({ authenticatedPage }) => {
      await cleanupFile(filePage, authenticatedPage, publicName);
      await cleanupFile(filePage, authenticatedPage, pwdName);
    });

    test('CFTP_SHARE_TC_072 — Copy Link for two files (Public + Password Protected) copies both links', async ({
      authenticatedPage,
    }) => {
      // Both statuses have an active link (unlike a Stopped share), so this bulk-applies directly
      // with no "N of M" restriction — verified via MCP recon.
      await filePage.copyShareLink(publicName);

      await test.step('Verify the Copy Link dialog confirms both links were copied', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'Copy Link dialog must appear').toHaveText(
          'Copy Link',
        );
        expect(await filePage.getDialogMessage(), 'Message must confirm both links were copied').toContain(
          '2 links copied to clipboard',
        );
      });
      await filePage.confirmDialog();
    });

    test('CFTP_SHARE_TC_073 — Change Expiry for two files (Public + Password Protected) updates both dates', async () => {
      // Both statuses are actively sharing, so Change Expiry bulk-applies directly with no
      // restriction warning — unlike a mix involving Stopped, which needs the "1 of N" narrowing.
      const beforePublic = await filePage.getShareExpiry(publicName);
      const beforePwd = await filePage.getShareExpiry(pwdName);
      const newDate = formatDate(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));

      await filePage.changeExpiry(publicName, newDate);

      await test.step('Verify the expiry date changes for both selected files', async () => {
        await expect(filePage.getShareExpiryLocator(publicName), 'Public file expiry must change').not.toHaveText(
          beforePublic,
        );
        await expect(
          filePage.getShareExpiryLocator(pwdName),
          'Password Protected file expiry must change',
        ).not.toHaveText(beforePwd);
      });
    });

    test('CFTP_SHARE_TC_074 — Cancel Change Expiry for two files (Public + Password Protected) keeps both dates', async () => {
      const beforePublic = await filePage.getShareExpiry(publicName);
      const beforePwd = await filePage.getShareExpiry(pwdName);
      const attemptedDate = formatDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));

      await filePage.cancelChangeExpiry(publicName, attemptedDate);

      await test.step('Verify the expiry date remains unchanged for both files after cancelling', async () => {
        await expect(
          filePage.getShareExpiryLocator(publicName),
          'Public file expiry must remain unchanged',
        ).toHaveText(beforePublic);
        await expect(
          filePage.getShareExpiryLocator(pwdName),
          'Password Protected file expiry must remain unchanged',
        ).toHaveText(beforePwd);
      });
    });

    test('CFTP_SHARE_TC_075 — Set Password for two files (Public + Password Protected) only applies to the Public one', async () => {
      // Set Password is only valid for a Public share — it needs the "1 of N" warning + narrowing
      // regardless of what the other status is, verified via MCP recon.
      await filePage.submitSharePasswordMixed(publicName, SHARE_PASSWORD);

      await test.step('Verify status of both selected files becomes Password Protected', async () => {
        await expect(filePage.getShareStatusLocator(publicName)).toHaveText('Password Protected');
        await expect(filePage.getShareStatusLocator(pwdName)).toHaveText('Password Protected');
      });
    });

    test('CFTP_SHARE_TC_076 — Cancel Set Password for two files (Public + Password Protected) keeps the Public one Public', async () => {
      await filePage.cancelSharePasswordMixed(publicName, SHARE_PASSWORD);

      await test.step('Verify the Public file remains Public and the Password Protected file is unaffected', async () => {
        await expect(filePage.getShareStatusLocator(publicName)).toHaveText('Public');
        await expect(filePage.getShareStatusLocator(pwdName)).toHaveText('Password Protected');
      });
    });

    test('CFTP_SHARE_TC_077 — Stop Sharing for two files (Public + Password Protected) changes both to Stopped', async () => {
      await filePage.stopSharing(publicName);

      await test.step('Verify status of both selected files changes to Stopped', async () => {
        await expect(filePage.getShareStatusLocator(publicName)).toHaveText('Stopped');
        await expect(filePage.getShareStatusLocator(pwdName)).toHaveText('Stopped');
      });
    });

    test('CFTP_SHARE_TC_078 — Cancel Stop Sharing for two files (Public + Password Protected) keeps the original statuses', async () => {
      await filePage.cancelStopSharing(publicName);

      await test.step('Verify both files keep their original statuses after cancelling Stop Sharing', async () => {
        await expect(filePage.getShareStatusLocator(publicName)).toHaveText('Public');
        await expect(filePage.getShareStatusLocator(pwdName)).toHaveText('Password Protected');
      });
    });

    test('CFTP_SHARE_TC_079 — Remove Password for two files (Public + Password Protected) only applies to the Password Protected one', async () => {
      // Remove Password skips the "N of M" warning entirely and narrows silently to just the
      // Password Protected file — verified via MCP recon (same pattern as every other status mix).
      await filePage.removeSharePassword(pwdName);

      await test.step('Verify both files become Public after Remove Password', async () => {
        await expect(filePage.getShareStatusLocator(pwdName)).toHaveText('Public');
        await expect(filePage.getShareStatusLocator(publicName)).toHaveText('Public');
      });
    });

    test('CFTP_SHARE_TC_080 — Cancel Remove Password for two files (Public + Password Protected) keeps the Password Protected one Password Protected', async () => {
      await filePage.cancelRemoveSharePassword(pwdName);

      await test.step('Verify the Password Protected file remains Password Protected and the Public file is unaffected', async () => {
        await expect(filePage.getShareStatusLocator(pwdName)).toHaveText('Password Protected');
        await expect(filePage.getShareStatusLocator(publicName)).toHaveText('Public');
      });
    });

    test('CFTP_SHARE_TC_081 — Delete for two files (Public + Password Protected) removes both from Shares (survive unshared in Home)', async ({
      authenticatedPage,
    }) => {
      await filePage.deleteShare(publicName);

      await test.step('Verify both selected files are no longer listed in Shares', async () => {
        await expect(filePage.fileRow(publicName), 'Public file must no longer be listed in Shares').toBeHidden();
        await expect(filePage.fileRow(pwdName), 'Password Protected file must no longer be listed in Shares').toBeHidden();
      });

      await goHome(filePage, authenticatedPage);
      await test.step('Verify both files still exist in Home unshared', async () => {
        await expect(filePage.fileRow(publicName), 'Public file must still exist in Home').toBeVisible();
        await expect(filePage.fileRow(pwdName), 'Password Protected file must still exist in Home').toBeVisible();
      });
    });

    test('CFTP_SHARE_TC_082 — Cancel Delete for two files (Public + Password Protected) keeps both listed', async () => {
      await filePage.cancelDeleteShare(publicName);

      await test.step('Verify both files remain listed in Shares with their original statuses after cancelling delete', async () => {
        await expect(filePage.fileRow(publicName), 'Public file must remain listed in Shares').toBeVisible();
        await expect(filePage.fileRow(pwdName), 'Password Protected file must remain listed in Shares').toBeVisible();
        await expect(filePage.getShareStatusLocator(publicName)).toHaveText('Public');
        await expect(filePage.getShareStatusLocator(pwdName)).toHaveText('Password Protected');
      });
    });

    test('CFTP_SHARE_TC_083 — Download is enabled for two files (Public + Password Protected) and downloads successfully', async () => {
      await test.step('Verify the Download icon is enabled once both files are selected', async () => {
        expect(
          await fileManager.isDownloadDisabled(),
          'Download icon must be enabled once both files are selected',
        ).toBeFalsy();
      });

      const downloads = await fileManager.downloadViaToolbar(2);

      await test.step('Verify both selected files are downloaded', async () => {
        const filenames = downloads.map((d) => d.suggestedFilename());
        expect(filenames, 'Both selected files must be downloaded').toContain(publicName);
        expect(filenames, 'Both selected files must be downloaded').toContain(pwdName);
      });
    });

    test('CFTP_SHARE_TC_084 — Cut is enabled but blocked with an error for two files (Public + Password Protected)', async ({
      authenticatedPage,
    }) => {
      await test.step('Verify the Cut icon is enabled once both files are selected', async () => {
        expect(await fileManager.isCutDisabled(), 'Cut icon must be enabled once both files are selected').toBeFalsy();
      });

      await fileManager.clickCutButton();

      await test.step('Verify an error dialog explains files cannot be moved out of Shares', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'An error dialog must appear').toHaveText('Error');
        expect(await fileManager.getDialogMessage(), 'Error message must explain files cannot be moved out of Shares').toBe(
          'Files cannot be moved out of the Shares folder. Use copy instead.',
        );
      });
      await fileManager.confirmDialog();

      await test.step('Verify both files remain in Shares, unmoved', async () => {
        await expect(filePage.fileRow(publicName), 'Public file must remain in Shares, unmoved').toBeVisible();
        await expect(filePage.fileRow(pwdName), 'Password Protected file must remain in Shares, unmoved').toBeVisible();
      });
    });

    test('CFTP_SHARE_TC_085 — Copy is enabled for two files (Public + Password Protected) and can be pasted into another folder', async ({
      authenticatedPage,
    }) => {
      await test.step('Verify the Copy icon is enabled once both files are selected', async () => {
        expect(await fileManager.isCopyDisabled(), 'Copy icon must be enabled once both files are selected').toBeFalsy();
      });

      await fileManager.clickCopyButton();
      await test.step('Verify the clipboard indicator confirms both items were copied', async () => {
        expect(await fileManager.getClipboardInfoText(), 'Clipboard indicator must confirm the copy').toContain(
          '2 items copied',
        );
      });
      await authenticatedPage.waitForTimeout(1_500);

      const destFolder = TestData.generateFolderName('auto_shareCopyDestMixE');
      await filePage.navigateUp();
      await filePage.waitUntilAtHomeRoot();
      await filePage.createFolder(destFolder);
      await filePage.openFolder(destFolder);
      await fileManager.pasteViaToolbar();

      await test.step('Verify both copied files appear in the destination folder', async () => {
        await expect(filePage.fileRow(publicName), 'Public file must appear in the destination folder').toBeVisible();
        await expect(
          filePage.fileRow(pwdName),
          'Password Protected file must appear in the destination folder',
        ).toBeVisible();
      });

      await filePage.navigateUp();
      await filePage.waitUntilAtHomeRoot();
      await filePage.deleteFile(destFolder).catch(() => undefined);
    });

    test('CFTP_SHARE_TC_086 — Delete is enabled for two files (Public + Password Protected) and removes both from Shares (survive unshared in Home)', async ({
      authenticatedPage,
    }) => {
      await test.step('Verify the Delete icon is enabled once both files are selected', async () => {
        expect(
          await fileManager.isDeleteDisabled(),
          'Delete icon must be enabled once both files are selected',
        ).toBeFalsy();
      });

      await fileManager.deleteSelectedViaToolbar(publicName);

      await test.step('Verify both selected files are no longer listed in Shares', async () => {
        await expect(filePage.fileRow(publicName), 'Public file must no longer be listed in Shares').toBeHidden();
        await expect(filePage.fileRow(pwdName), 'Password Protected file must no longer be listed in Shares').toBeHidden();
      });

      await goHome(filePage, authenticatedPage);
      await test.step('Verify both files still exist in Home unshared', async () => {
        await expect(filePage.fileRow(publicName), 'Public file must still exist in Home').toBeVisible();
        await expect(filePage.fileRow(pwdName), 'Password Protected file must still exist in Home').toBeVisible();
      });
    });
  });

  test.describe('Multi-select (mixed Password Protected + Stopped)', () => {
    let filePage: FileListPage;
    let fileManager: FileManagerPage;
    let pwdName: string;
    let stoppedName: string;

    test.beforeEach(async ({ authenticatedPage }) => {
      filePage = new FileListPage(authenticatedPage);
      fileManager = new FileManagerPage(authenticatedPage);
      pwdName = TestData.generateFileName('auto_shareMsMixPwdF');
      stoppedName = TestData.generateFileName('auto_shareMsMixStopF');
      await filePage.createFile(pwdName);
      await filePage.shareWithPassword(pwdName, SHARE_PASSWORD);
      await filePage.confirmShareDialog();
      await filePage.createFile(stoppedName);
      await filePage.shareFile(stoppedName);
      await filePage.confirmShareDialog();
      // Two back-to-back Share-record writes can hit the documented server-side contention —
      // pace here the same way every other multi-select describe block in this file already does.
      await authenticatedPage.waitForTimeout(1_500);
      await filePage.openSharesFolder();
      await filePage.stopSharing(stoppedName);
      await authenticatedPage.waitForTimeout(1_500);
      await fileManager.selectFile(pwdName);
      await fileManager.selectFile(stoppedName);
    });

    test.afterEach(async ({ authenticatedPage }) => {
      await cleanupFile(filePage, authenticatedPage, pwdName);
      await cleanupFile(filePage, authenticatedPage, stoppedName);
    });

    test('CFTP_SHARE_TC_087 — Copy Link for two files (Password Protected + Stopped) copies the Password Protected one\'s link', async ({
      authenticatedPage,
    }) => {
      // A Stopped share has no active link — Copy Link silently applies to just the Password
      // Protected file with no "N of M" warning first (real UI behavior, verified via MCP recon —
      // the message is singular, not "2 links copied" as the CSV assumes).
      await filePage.copyShareLink(pwdName);

      await test.step('Verify the Copy Link dialog confirms the Password Protected link was copied', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'Copy Link dialog must appear').toHaveText(
          'Copy Link',
        );
        expect(await filePage.getDialogMessage(), 'Message must confirm the Password Protected link was copied').toContain(
          'Link copied to clipboard',
        );
      });
      await filePage.confirmDialog();
    });

    test('CFTP_SHARE_TC_088 — Change Expiry for two files (Password Protected + Stopped) only applies to the Password Protected one', async () => {
      // Verified via MCP recon: Change Expiry on a mixed selection shows the "This will only apply
      // to 1 of 2 selected shares" warning, then narrows to a per-file dialog — it does NOT update
      // both dates as the CSV assumes (a Stopped share can't have its expiry changed).
      const beforePwd = await filePage.getShareExpiry(pwdName);
      const beforeStopped = await filePage.getShareExpiry(stoppedName);
      const newDate = formatDate(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));

      await filePage.changeExpiryMixed(pwdName, newDate);

      await test.step('Verify Change Expiry only applies to the Password Protected file', async () => {
        await expect(filePage.getShareExpiryLocator(pwdName), 'Password Protected file expiry must change').not.toHaveText(
          beforePwd,
        );
        await expect(
          filePage.getShareExpiryLocator(stoppedName),
          'Stopped file expiry must remain unchanged (not applicable to it)',
        ).toHaveText(beforeStopped);
      });
    });

    test('CFTP_SHARE_TC_089 — Cancel Change Expiry for two files (Password Protected + Stopped) keeps both dates', async () => {
      const beforePwd = await filePage.getShareExpiry(pwdName);
      const beforeStopped = await filePage.getShareExpiry(stoppedName);
      const attemptedDate = formatDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));

      await filePage.cancelChangeExpiryMixed(pwdName, attemptedDate);

      await test.step('Verify the expiry date remains unchanged for both files after cancelling', async () => {
        await expect(
          filePage.getShareExpiryLocator(pwdName),
          'Password Protected file expiry must remain unchanged',
        ).toHaveText(beforePwd);
        await expect(
          filePage.getShareExpiryLocator(stoppedName),
          'Stopped file expiry must remain unchanged',
        ).toHaveText(beforeStopped);
      });
    });

    test('CFTP_SHARE_TC_090 — Remove Password for two files (Password Protected + Stopped) only applies to the Password Protected one', async () => {
      // Remove Password skips the "N of M" warning entirely and narrows silently to just the
      // Password Protected file — verified via MCP recon. The Stopped file is left untouched,
      // which differs from the CSV's "status of selected files is changed to Public".
      await filePage.removeSharePassword(pwdName);

      await test.step('Verify Remove Password only applies to the Password Protected file', async () => {
        await expect(filePage.getShareStatusLocator(pwdName)).toHaveText('Public');
        await expect(filePage.getShareStatusLocator(stoppedName)).toHaveText('Stopped');
      });
    });

    test('CFTP_SHARE_TC_091 — Cancel Remove Password for two files (Password Protected + Stopped) keeps the Password Protected one Password Protected', async () => {
      await filePage.cancelRemoveSharePassword(pwdName);

      await test.step('Verify the Password Protected file remains Password Protected and the Stopped file is unaffected', async () => {
        await expect(filePage.getShareStatusLocator(pwdName)).toHaveText('Password Protected');
        await expect(filePage.getShareStatusLocator(stoppedName)).toHaveText('Stopped');
      });
    });

    test('CFTP_SHARE_TC_092 — Stop Sharing for two files (Password Protected + Stopped) changes both to Stopped', async () => {
      await filePage.stopSharing(pwdName);

      await test.step('Verify status of both selected files changes to Stopped', async () => {
        await expect(filePage.getShareStatusLocator(pwdName)).toHaveText('Stopped');
        await expect(filePage.getShareStatusLocator(stoppedName)).toHaveText('Stopped');
      });
    });

    test('CFTP_SHARE_TC_093 — Cancel Stop Sharing for two files (Password Protected + Stopped) keeps the original statuses', async () => {
      // The CSV title/expected result for this TC carry over stale "Public and Stopped" wording
      // from the earlier group — the actual precondition and pair under test here are Password
      // Protected + Stopped, so Cancel must leave both of those statuses unchanged.
      await filePage.cancelStopSharing(pwdName);

      await test.step('Verify both files keep their original statuses after cancelling Stop Sharing', async () => {
        await expect(filePage.getShareStatusLocator(pwdName)).toHaveText('Password Protected');
        await expect(filePage.getShareStatusLocator(stoppedName)).toHaveText('Stopped');
      });
    });

    test('CFTP_SHARE_TC_094 — Restart Sharing for two files (Password Protected + Stopped) changes both to Public', async ({
      authenticatedPage,
    }) => {
      // Verified via MCP recon: Restart Sharing bulk-applies with NO confirmation dialog first
      // (unlike Stop Sharing) — it goes straight to a "Share Restarted" result, and it strips
      // password protection as a side effect, converting the Password Protected file to Public too.
      await filePage.selectContextAction(pwdName, 'restart-sharing');

      await test.step('Verify the Share Restarted confirmation dialog appears', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'Share Restarted dialog must appear').toHaveText(
          'Share Restarted',
        );
      });
      await filePage.confirmDialog();

      await test.step('Verify status of both selected files changes to Public', async () => {
        await expect(filePage.getShareStatusLocator(pwdName)).toHaveText('Public');
        await expect(filePage.getShareStatusLocator(stoppedName)).toHaveText('Public');
      });
    });

    test('CFTP_SHARE_TC_095 — Delete for two files (Password Protected + Stopped) removes both from Shares (survive unshared in Home)', async ({
      authenticatedPage,
    }) => {
      await filePage.deleteShare(pwdName);

      await test.step('Verify both selected files are no longer listed in Shares', async () => {
        await expect(filePage.fileRow(pwdName), 'Password Protected file must no longer be listed in Shares').toBeHidden();
        await expect(filePage.fileRow(stoppedName), 'Stopped file must no longer be listed in Shares').toBeHidden();
      });

      await goHome(filePage, authenticatedPage);
      await test.step('Verify both files still exist in Home unshared', async () => {
        await expect(filePage.fileRow(pwdName), 'Password Protected file must still exist in Home').toBeVisible();
        await expect(filePage.fileRow(stoppedName), 'Stopped file must still exist in Home').toBeVisible();
      });
    });

    test('CFTP_SHARE_TC_096 — Cancel Delete for two files (Password Protected + Stopped) keeps both listed', async () => {
      await filePage.cancelDeleteShare(pwdName);

      await test.step('Verify both files remain listed in Shares with their original statuses after cancelling delete', async () => {
        await expect(filePage.fileRow(pwdName), 'Password Protected file must remain listed in Shares').toBeVisible();
        await expect(filePage.fileRow(stoppedName), 'Stopped file must remain listed in Shares').toBeVisible();
        await expect(filePage.getShareStatusLocator(pwdName)).toHaveText('Password Protected');
        await expect(filePage.getShareStatusLocator(stoppedName)).toHaveText('Stopped');
      });
    });

    test('CFTP_SHARE_TC_097 — Download is enabled for two files (Password Protected + Stopped) and downloads successfully', async () => {
      await test.step('Verify the Download icon is enabled once both files are selected', async () => {
        expect(
          await fileManager.isDownloadDisabled(),
          'Download icon must be enabled once both files are selected',
        ).toBeFalsy();
      });

      const downloads = await fileManager.downloadViaToolbar(2);

      await test.step('Verify both selected files are downloaded', async () => {
        const filenames = downloads.map((d) => d.suggestedFilename());
        expect(filenames, 'Both selected files must be downloaded').toContain(pwdName);
        expect(filenames, 'Both selected files must be downloaded').toContain(stoppedName);
      });
    });

    test('CFTP_SHARE_TC_098 — Cut is enabled but blocked with an error for two files (Password Protected + Stopped)', async ({
      authenticatedPage,
    }) => {
      await test.step('Verify the Cut icon is enabled once both files are selected', async () => {
        expect(await fileManager.isCutDisabled(), 'Cut icon must be enabled once both files are selected').toBeFalsy();
      });

      await fileManager.clickCutButton();

      await test.step('Verify an error dialog explains files cannot be moved out of Shares', async () => {
        await expect(authenticatedPage.getByTestId('dialog-title'), 'An error dialog must appear').toHaveText('Error');
        expect(await fileManager.getDialogMessage(), 'Error message must explain files cannot be moved out of Shares').toBe(
          'Files cannot be moved out of the Shares folder. Use copy instead.',
        );
      });
      await fileManager.confirmDialog();

      await test.step('Verify both files remain in Shares, unmoved', async () => {
        await expect(filePage.fileRow(pwdName), 'Password Protected file must remain in Shares, unmoved').toBeVisible();
        await expect(filePage.fileRow(stoppedName), 'Stopped file must remain in Shares, unmoved').toBeVisible();
      });
    });

    test('CFTP_SHARE_TC_099 — Copy is enabled for two files (Password Protected + Stopped) and can be pasted into another folder', async ({
      authenticatedPage,
    }) => {
      await test.step('Verify the Copy icon is enabled once both files are selected', async () => {
        expect(await fileManager.isCopyDisabled(), 'Copy icon must be enabled once both files are selected').toBeFalsy();
      });

      await fileManager.clickCopyButton();
      await test.step('Verify the clipboard indicator confirms both items were copied', async () => {
        expect(await fileManager.getClipboardInfoText(), 'Clipboard indicator must confirm the copy').toContain(
          '2 items copied',
        );
      });
      await authenticatedPage.waitForTimeout(1_500);

      const destFolder = TestData.generateFolderName('auto_shareCopyDestMixF');
      await filePage.navigateUp();
      await filePage.waitUntilAtHomeRoot();
      await filePage.createFolder(destFolder);
      await filePage.openFolder(destFolder);
      await fileManager.pasteViaToolbar();

      await test.step('Verify both copied files appear in the destination folder', async () => {
        await expect(filePage.fileRow(pwdName), 'Password Protected file must appear in the destination folder').toBeVisible();
        await expect(
          filePage.fileRow(stoppedName),
          'Stopped file must appear in the destination folder',
        ).toBeVisible();
      });

      await filePage.navigateUp();
      await filePage.waitUntilAtHomeRoot();
      await filePage.deleteFile(destFolder).catch(() => undefined);
    });

    test('CFTP_SHARE_TC_100 — Delete is enabled for two files (Password Protected + Stopped) and removes both from Shares (survive unshared in Home)', async ({
      authenticatedPage,
    }) => {
      await test.step('Verify the Delete icon is enabled once both files are selected', async () => {
        expect(
          await fileManager.isDeleteDisabled(),
          'Delete icon must be enabled once both files are selected',
        ).toBeFalsy();
      });

      await fileManager.deleteSelectedViaToolbar(pwdName);

      await test.step('Verify both selected files are no longer listed in Shares', async () => {
        await expect(filePage.fileRow(pwdName), 'Password Protected file must no longer be listed in Shares').toBeHidden();
        await expect(filePage.fileRow(stoppedName), 'Stopped file must no longer be listed in Shares').toBeHidden();
      });

      await goHome(filePage, authenticatedPage);
      await test.step('Verify both files still exist in Home unshared', async () => {
        await expect(filePage.fileRow(pwdName), 'Password Protected file must still exist in Home').toBeVisible();
        await expect(filePage.fileRow(stoppedName), 'Stopped file must still exist in Home').toBeVisible();
      });
    });
  });
});
