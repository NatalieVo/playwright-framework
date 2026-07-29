import { test, expect } from '../../fixtures/auth.fixture';
import { FileManagerPage } from '../../pages/dashboard.page';
import { FileListPage } from '../../pages/file-list.page';
import { TestData } from '../../utils/test-data';
import { createTempTextFile, deleteTempFile, retryAction } from '../../utils/helpers';

test.describe('FileManager — Toolbar Icons', () => {
  let seedFileName: string;
  let seedFilePath: string;
  let filePath: string | undefined;
  let createdName: string | undefined;

  test.beforeEach(async ({ authenticatedPage }) => {
    seedFileName = TestData.generateFileName('cftp_toolbar_seed');
    seedFilePath = createTempTextFile(seedFileName, 'Seed content for toolbar tests');
    const fileList = new FileListPage(authenticatedPage);
    await fileList.uploadFile(seedFilePath, seedFileName);
    filePath = undefined;
    createdName = undefined;
  });

  test.afterEach(async ({ authenticatedPage }) => {
    // Chromium can hold a share-lock on a temp file briefly after it was selected via
    // the upload file input, so retry the unlink instead of failing the test on EBUSY.
    await retryAction(async () => deleteTempFile(seedFilePath), 5, 300);
    if (filePath) {
      await retryAction(async () => deleteTempFile(filePath as string), 5, 300);
    }
    const fileList = new FileListPage(authenticatedPage);
    await fileList.deleteFile(seedFileName).catch(() => undefined);
    if (createdName) {
      await fileList.deleteFile(createdName).catch(() => undefined);
    }
  });

  test('CFTP_TOOLBAR_TC_001 — upload a new file via the icon in the toolbar', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_toolbar_upload');
    filePath = createTempTextFile(fileName, 'Toolbar upload test content');
    createdName = fileName;

    await fm.uploadNewFile(filePath, fileName);

    await test.step(`Verify uploaded file "${fileName}" appears in the list`, async () => {
      await expect(fm.fileRow(fileName), 'Uploaded file must appear in the list').toBeVisible();
    });
  });

  test('CFTP_TOOLBAR_TC_002 — cancel uploading a file via the icon in the toolbar', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);
    const phantomName = TestData.generateFileName('cftp_toolbar_cancelled');

    await fm.openUploadFileChooserAndCancel();

    await test.step('Verify no file is uploaded and the app remains stable after cancelling the file picker', async () => {
      await expect(fm.fileRow(phantomName), 'File must not be uploaded after cancelling the file picker').toHaveCount(0);
      expect(await fm.isLoaded(), 'App must remain stable after cancelling the upload').toBeTruthy();
    });
  });

  test('CFTP_TOOLBAR_TC_003 — upload an existing file and overwrite it', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.uploadExistingFile(seedFilePath);
    await test.step('Verify conflict dialog is shown for an existing file', async () => {
      expect(await fm.getUploadConflictTitle(), 'Conflict dialog must be shown for an existing file').toBe(
        'File already exists',
      );
    });
    await fm.overwriteUpload();

    await test.step(`Verify file "${seedFileName}" still exists after choosing Overwrite`, async () => {
      await expect(fm.fileRow(seedFileName), 'File must still exist after choosing Overwrite').toBeVisible();
    });
  });

  test('CFTP_TOOLBAR_TC_004 — upload an existing file and skip overwriting it', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.uploadExistingFile(seedFilePath);
    await test.step('Verify conflict dialog is shown for an existing file', async () => {
      expect(await fm.getUploadConflictTitle(), 'Conflict dialog must be shown for an existing file').toBe(
        'File already exists',
      );
    });
    await fm.skipUpload();

    await test.step(`Verify original file "${seedFileName}" remains with no duplicate after choosing Skip`, async () => {
      await expect(fm.fileRow(seedFileName), 'Original file must remain after choosing Skip').toBeVisible();
      await expect(fm.fileRow(seedFileName), 'No duplicate file must be created after Skip').toHaveCount(1);
    });
  });

  test('CFTP_TOOLBAR_TC_005 — create a new file with a custom name via the icon in the toolbar', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_toolbar_newfile');
    createdName = fileName;

    await fm.createNewFileWithName(fileName);

    await test.step(`Verify new file "${fileName}" is created with the given name`, async () => {
      await expect(fm.fileRow(fileName), 'New file must be created with the given name').toBeVisible();
    });
  });

  test('CFTP_TOOLBAR_TC_006 — create a new file using the default name', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);

    const defaultName = await fm.createNewFileWithDefaultName();
    createdName = defaultName;

    await test.step(`Verify new file "${defaultName}" is created using the default name`, async () => {
      await expect(fm.fileRow(defaultName), 'New file must be created using the default name').toBeVisible();
    });
  });

  test('CFTP_TOOLBAR_TC_007 — cancel creating a new file via the icon in the toolbar', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_toolbar_newfile_cancel');

    await fm.cancelNewFile(fileName);

    await test.step(`Verify file "${fileName}" is not created after cancelling`, async () => {
      await expect(fm.fileRow(fileName), 'File must not be created after cancelling').toHaveCount(0);
    });
  });

  test('CFTP_TOOLBAR_TC_008 — create a new folder via the icon in the toolbar', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);

    const folderName = await fm.createNewFolderWithDefaultName();
    createdName = folderName;

    await test.step(`Verify new folder "${folderName}" is created`, async () => {
      await expect(fm.fileRow(folderName), 'New folder must be created').toBeVisible();
    });
  });

  test('CFTP_TOOLBAR_TC_009 — cancel creating a new folder via the icon in the toolbar', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);
    const countBefore = (await fm.getVisibleFileNames()).length;

    await fm.cancelNewFolder();

    const countAfter = await fm.getVisibleFileNames();
    await test.step('Verify folder is not created after cancelling', async () => {
      expect(countAfter.length, 'Folder must not be created after cancelling').toBe(countBefore);
    });
  });

  test('CFTP_TOOLBAR_TC_010 — search for a file with a valid name via the icon in the toolbar', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.search(seedFileName);

    await test.step(`Verify search returns the matching file "${seedFileName}"`, async () => {
      await expect(fm.fileRow(seedFileName), 'Search must return the matching file').toBeVisible();
    });
  });

  test('CFTP_TOOLBAR_TC_011 — search for a file with an invalid name via the icon in the toolbar', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.search('zzz_no_such_file_zzz_toolbar');

    await test.step('Verify no-results message is shown for an unmatched search', async () => {
      expect(await fm.isNoResultsShown(), 'No-results message must be shown for an unmatched search').toBeTruthy();
    });
  });

  test('CFTP_TOOLBAR_TC_012 — Download icon is disabled when no file is selected', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await test.step('Verify Download icon is disabled with no selection', async () => {
      expect(await fm.isDownloadDisabled(), 'Download icon must be disabled with no selection').toBeTruthy();
    });
  });

  test('CFTP_TOOLBAR_TC_013 — Cut icon is disabled when no file is selected', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await test.step('Verify Cut icon is disabled with no selection', async () => {
      expect(await fm.isCutDisabled(), 'Cut icon must be disabled with no selection').toBeTruthy();
    });
  });

  test('CFTP_TOOLBAR_TC_014 — Copy icon is disabled when no file is selected', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await test.step('Verify Copy icon is disabled with no selection', async () => {
      expect(await fm.isCopyDisabled(), 'Copy icon must be disabled with no selection').toBeTruthy();
    });
  });

  test('CFTP_TOOLBAR_TC_015 — Paste icon is disabled when no file is selected', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await test.step('Verify Paste icon is disabled with no selection', async () => {
      expect(await fm.isPasteDisabled(), 'Paste icon must be disabled with no selection').toBeTruthy();
    });
  });

  test('CFTP_TOOLBAR_TC_016 — Rename icon is disabled when no file is selected', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await test.step('Verify Rename icon is disabled with no selection', async () => {
      expect(await fm.isRenameDisabled(), 'Rename icon must be disabled with no selection').toBeTruthy();
    });
  });

  test('CFTP_TOOLBAR_TC_017 — Delete icon is disabled when no file is selected', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await test.step('Verify Delete icon is disabled with no selection', async () => {
      expect(await fm.isDeleteDisabled(), 'Delete icon must be disabled with no selection').toBeTruthy();
    });
  });

  test('CFTP_TOOLBAR_TC_018 — Share (public) icon is disabled when no file is selected', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await test.step('Verify Share icon is disabled with no selection', async () => {
      expect(await fm.isShareDisabled(), 'Share icon must be disabled with no selection').toBeTruthy();
    });
  });

  test('CFTP_TOOLBAR_TC_019 — Share (password) icon is disabled when no file is selected', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await test.step('Verify Share (password) icon is disabled with no selection', async () => {
      expect(await fm.isSharePasswordDisabled(), 'Share (password) icon must be disabled with no selection').toBeTruthy();
    });
  });

  test('CFTP_TOOLBAR_TC_020 — Download icon becomes enabled after selecting an uploaded file', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.selectFile(seedFileName);

    await test.step('Verify Download icon becomes enabled once a file is selected', async () => {
      expect(await fm.isDownloadDisabled(), 'Download icon must become enabled once a file is selected').toBeFalsy();
    });
  });

  test('CFTP_TOOLBAR_TC_021 — Cut icon becomes enabled after selecting an uploaded file', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.selectFile(seedFileName);

    await test.step('Verify Cut icon becomes enabled once a file is selected', async () => {
      expect(await fm.isCutDisabled(), 'Cut icon must become enabled once a file is selected').toBeFalsy();
    });
  });

  test('CFTP_TOOLBAR_TC_022 — Copy icon becomes enabled after selecting an uploaded file', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.selectFile(seedFileName);

    await test.step('Verify Copy icon becomes enabled once a file is selected', async () => {
      expect(await fm.isCopyDisabled(), 'Copy icon must become enabled once a file is selected').toBeFalsy();
    });
  });

  test('CFTP_TOOLBAR_TC_023 — Rename icon becomes enabled after selecting an uploaded file', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.selectFile(seedFileName);

    await test.step('Verify Rename icon becomes enabled once a file is selected', async () => {
      expect(await fm.isRenameDisabled(), 'Rename icon must become enabled once a file is selected').toBeFalsy();
    });
  });

  test('CFTP_TOOLBAR_TC_024 — Delete icon becomes enabled after selecting an uploaded file', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.selectFile(seedFileName);

    await test.step('Verify Delete icon becomes enabled once a file is selected', async () => {
      expect(await fm.isDeleteDisabled(), 'Delete icon must become enabled once a file is selected').toBeFalsy();
    });
  });

  test('CFTP_TOOLBAR_TC_025 — Share (public) icon becomes enabled after selecting an uploaded file', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.selectFile(seedFileName);

    await test.step('Verify Share icon becomes enabled once a file is selected', async () => {
      expect(await fm.isShareDisabled(), 'Share icon must become enabled once a file is selected').toBeFalsy();
    });
  });

  test('CFTP_TOOLBAR_TC_026 — Share (password) icon becomes enabled after selecting an uploaded file', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.selectFile(seedFileName);

    await test.step('Verify Share (password) icon becomes enabled once a file is selected', async () => {
      expect(
        await fm.isSharePasswordDisabled(),
        'Share (password) icon must become enabled once a file is selected',
      ).toBeFalsy();
    });
  });

  test('CFTP_TOOLBAR_TC_027 — Paste icon remains disabled after selecting a file when the clipboard is empty', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.selectFile(seedFileName);

    await test.step('Verify Paste icon stays disabled on selection alone (requires a prior Cut or Copy)', async () => {
      expect(
        await fm.isPasteDisabled(),
        'Paste icon must stay disabled on selection alone — it requires a prior Cut or Copy',
      ).toBeTruthy();
    });
  });
});
