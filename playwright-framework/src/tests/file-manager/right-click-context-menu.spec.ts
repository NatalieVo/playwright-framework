import { test, expect } from '../../fixtures/auth.fixture';
import { FileListPage } from '../../pages/file-list.page';
import { LoginPage } from '../../pages/login.page';
import { TestData } from '../../utils/test-data';
import { createTempTextFile, deleteTempFile } from '../../utils/helpers';
import { env } from '../../utils/env.config';

test.describe('FileManager — Right-Click Context Menu', () => {
  let createdName: string | undefined;

  // openEmptyAreaContextMenu() right-clicks a fixed point near the bottom of the file list —
  // leftover items from other specs can fill that point, causing the file's own context menu
  // to open instead of the empty-area one. Clear stray test data before this file runs.
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.goto('/FileManager/4/', { waitUntil: 'domcontentloaded' });
    await new LoginPage(page).login(env.USERNAME, env.PASSWORD);
    await page.waitForSelector('[data-testid="app-header"]', { state: 'visible', timeout: 30_000 });

    const fileList = new FileListPage(page);
    await fileList.waitForLoaded();
    await page.waitForLoadState('networkidle');
    const leftoverNames = (await fileList.getAllItemNames())
      .map((name) => name.trim())
      .filter((name) => /^(cftp_|auto_share)/i.test(name));
    for (const name of leftoverNames) {
      await fileList.deleteFile(name).catch(() => undefined);
    }
    await context.close();
  });

  test.beforeEach(() => {
    createdName = undefined;
  });

  test.afterEach(async ({ authenticatedPage }) => {
    if (createdName) {
      const fileList = new FileListPage(authenticatedPage);
      await fileList.deleteFile(createdName).catch(() => undefined);
    }
  });

  test('CFTP_RIGHTCLICK_TC_001 — create a new file with a custom name via right-click on the page', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_rightclick_newfile');
    createdName = fileName;

    await fileList.createNewFileFromEmptyArea(fileName);

    await test.step(`Verify new file "${fileName}" is created with the given name`, async () => {
      await expect(fileList.fileRow(fileName), 'New file must be created with the given name').toBeVisible();
    });
  });

  test('CFTP_RIGHTCLICK_TC_002 — create a new file using the default name via right-click on the page', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);

    const defaultName = await fileList.createNewFileWithDefaultNameFromEmptyArea();
    createdName = defaultName;

    await test.step(`Verify new file "${defaultName}" is created using the default name`, async () => {
      await expect(fileList.fileRow(defaultName), 'New file must be created using the default name').toBeVisible();
    });
  });

  test('CFTP_RIGHTCLICK_TC_003 — cancel creating a new file via right-click on the page', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_rightclick_newfile_cancel');

    await fileList.cancelNewFileFromEmptyArea(fileName);

    await test.step(`Verify file "${fileName}" is not created after cancelling`, async () => {
      await expect(fileList.fileRow(fileName), 'File must not be created after cancelling').toHaveCount(0);
    });
  });

  test('CFTP_RIGHTCLICK_TC_004 — create a new folder via right-click on the page', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    const folderName = await fileList.createNewFolderWithDefaultNameFromEmptyArea();
    createdName = folderName;

    await test.step(`Verify new folder "${folderName}" is created`, async () => {
      await expect(fileList.fileRow(folderName), 'New folder must be created').toBeVisible();
    });
  });

  test('CFTP_RIGHTCLICK_TC_005 — cancel creating a new folder via right-click on the page', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    await fileList.waitForLoaded();
    const countBefore = await authenticatedPage.getByTestId('file-name').count();

    await fileList.cancelNewFolderFromEmptyArea();

    await test.step('Verify folder is not created after cancelling', async () => {
      await expect(
        authenticatedPage.getByTestId('file-name'),
        'Folder must not be created after cancelling',
      ).toHaveCount(countBefore);
    });
  });

  test('CFTP_RIGHTCLICK_TC_006 — Paste option is disabled when the clipboard is empty', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    await fileList.waitForLoaded();

    await test.step('Verify Paste is disabled when nothing has been cut or copied', async () => {
      expect(
        await fileList.isEmptyAreaPasteDisabled(),
        'Paste must be disabled when nothing has been cut or copied',
      ).toBeTruthy();
    });
  });

  test('CFTP_RIGHTCLICK_TC_007 — Paste option is disabled in the same folder right after copying a file', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_rightclick_copy_sameFolder');
    const filePath = createTempTextFile(fileName, 'Right-click paste test content');
    await fileList.uploadFile(filePath, fileName);
    createdName = fileName;

    await fileList.copyFile(fileName);

    await test.step('Verify Paste stays disabled in the same folder the file was copied from', async () => {
      expect(
        await fileList.isEmptyAreaPasteDisabled(),
        'Paste must stay disabled in the same folder the file was copied from',
      ).toBeTruthy();
    });

    deleteTempFile(filePath);
  });

  test('CFTP_RIGHTCLICK_TC_008 — paste a copied file into a different folder via right-click on the page', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_rightclick_copy_paste');
    const filePath = createTempTextFile(fileName, 'Right-click paste test content');
    await fileList.uploadFile(filePath, fileName);

    const folderName = await fileList.createNewFolderWithDefaultNameFromEmptyArea();

    await fileList.copyFile(fileName);
    await fileList.openFolder(folderName);
    await fileList.pasteFromEmptyArea();

    await test.step(`Verify copied file "${fileName}" appears in the destination folder`, async () => {
      await expect(fileList.fileRow(fileName), 'Copied file must appear in the destination folder').toBeVisible();
    });

    await fileList.navigateUp();
    await test.step(`Verify original file "${fileName}" remains in the source folder after Copy + Paste`, async () => {
      await expect(
        fileList.fileRow(fileName),
        'Original file must remain in the source folder after Copy + Paste',
      ).toBeVisible();
    });

    deleteTempFile(filePath);
    await fileList.deleteFile(fileName).catch(() => undefined);
    await fileList.deleteFile(folderName).catch(() => undefined);
  });

  test('CFTP_RIGHTCLICK_TC_009 — paste a cut file into a different folder via right-click on the page (move)', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_rightclick_cut_paste');
    const filePath = createTempTextFile(fileName, 'Right-click paste test content');
    await fileList.uploadFile(filePath, fileName);

    const folderName = await fileList.createNewFolderWithDefaultNameFromEmptyArea();

    await fileList.cutFile(fileName);
    await fileList.openFolder(folderName);
    await fileList.pasteFromEmptyArea();

    await test.step(`Verify cut file "${fileName}" appears in the destination folder`, async () => {
      await expect(fileList.fileRow(fileName), 'Cut file must appear in the destination folder').toBeVisible();
    });

    await fileList.navigateUp();
    await test.step(`Verify original file "${fileName}" no longer exists in the source folder after Cut + Paste`, async () => {
      await expect(
        fileList.fileRow(fileName),
        'Original file must no longer exist in the source folder after Cut + Paste',
      ).toHaveCount(0);
    });

    deleteTempFile(filePath);
    await fileList.deleteFile(folderName).catch(() => undefined);
  });
});
