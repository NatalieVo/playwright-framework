import { test, expect } from '../../fixtures/auth.fixture';
import { FileListPage } from '../../pages/file-list.page';
import { FileManagerPage } from '../../pages/dashboard.page';
import { TestData } from '../../utils/test-data';
import { cleanupSharedItem } from '../../utils/share-cleanup';

test.describe('FileManager — Multi-Select Actions', () => {
  let firstName: string;
  let secondName: string;

  test.beforeEach(async ({ authenticatedPage }) => {
    firstName = TestData.generateFolderName('cftp_ms_1');
    secondName = TestData.generateFolderName('cftp_ms_2');
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    await fileList.createFolder(firstName);
    await fileList.createFolder(secondName);
    await fm.selectFile(firstName);
    await fm.selectFile(secondName);
  });

  test.afterEach(async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);
    // Some tests (move/delete) already clean these up as part of their own body, and TC_006/TC_008
    // share these items — cleanupSharedItem() unshares first (or this leaks an orphaned Share record
    // every run, see project_share_json_serialization_bug.md) and is itself a no-op if the item is
    // already gone, so it safely covers both cases without wasting retries on an already-deleted item.
    await cleanupSharedItem(authenticatedPage, fileList, firstName);
    await cleanupSharedItem(authenticatedPage, fileList, secondName);
  });

  test('CFTP_MULTISELECT_TC_001 — download multiple selected items', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    const downloads = await fileList.downloadSelection(firstName, 2);

    const filenames = downloads.map((d) => d.suggestedFilename());
    await test.step(`Verify both selected items "${firstName}" and "${secondName}" are downloaded`, async () => {
      expect(filenames, 'Both selected items must be downloaded').toContain(`${firstName}.folder.zip`);
      expect(filenames, 'Both selected items must be downloaded').toContain(`${secondName}.folder.zip`);
    });
  });

  test('CFTP_MULTISELECT_TC_002 — move multiple selected items to a folder (Cut + Paste)', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const destFolder = TestData.generateFolderName('cftp_ms_move_target');
    await fileList.createFolder(destFolder);
    // Creating the destination folder refreshes the list and clears the checkbox selection — re-select
    await fm.selectFile(firstName);
    await fm.selectFile(secondName);

    await fileList.cutFile(firstName);
    await fileList.openFolder(destFolder);
    await fileList.pasteHere();

    await test.step(`Verify both selected items "${firstName}" and "${secondName}" appear in destination folder "${destFolder}" after moving`, async () => {
      await expect(fileList.fileRow(firstName), 'First item must appear in the destination folder').toBeVisible();
      await expect(fileList.fileRow(secondName), 'Second item must appear in the destination folder').toBeVisible();
    });
    await fileList.navigateUp();
    await test.step(`Verify both selected items "${firstName}" and "${secondName}" no longer exist at the original location after moving`, async () => {
      await expect(fileList.fileRow(firstName), 'First item must no longer be at the original location').toBeHidden();
      await expect(fileList.fileRow(secondName), 'Second item must no longer be at the original location').toBeHidden();
    });

    // Both items were moved into destFolder — deleting it cleans them up too
    await fileList.deleteFile(destFolder);
  });

  test('CFTP_MULTISELECT_TC_003 — cancel moving multiple selected items keeps them at their original location', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const destFolder = TestData.generateFolderName('cftp_ms_move_cancel');
    await fileList.createFolder(destFolder);
    await fm.selectFile(firstName);
    await fm.selectFile(secondName);

    await fileList.cutFile(firstName);
    await fileList.openFolder(destFolder);
    // Do not paste — navigate back to verify the move was not applied
    await fileList.navigateUp();

    await test.step(`Verify both selected items "${firstName}" and "${secondName}" remain at their original location when not pasted`, async () => {
      await expect(fileList.fileRow(firstName), 'First item must still be at its original location').toBeVisible();
      await expect(fileList.fileRow(secondName), 'Second item must still be at its original location').toBeVisible();
    });

    await fileList.deleteFile(destFolder);
  });

  test('CFTP_MULTISELECT_TC_004 — copy multiple selected items to a folder (Copy + Paste)', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const destFolder = TestData.generateFolderName('cftp_ms_copy_target');
    await fileList.createFolder(destFolder);
    await fm.selectFile(firstName);
    await fm.selectFile(secondName);

    await fileList.copyFile(firstName);
    await fileList.openFolder(destFolder);
    await fileList.pasteHere();

    await test.step(`Verify both selected items "${firstName}" and "${secondName}" are copied into destination folder "${destFolder}"`, async () => {
      await expect(fileList.fileRow(firstName), 'First item must be copied into the destination folder').toBeVisible();
      await expect(fileList.fileRow(secondName), 'Second item must be copied into the destination folder').toBeVisible();
    });
    await fileList.navigateUp();
    await test.step(`Verify both original items "${firstName}" and "${secondName}" still exist after copying`, async () => {
      await expect(fileList.fileRow(firstName), 'First original item must still exist after copying').toBeVisible();
      await expect(fileList.fileRow(secondName), 'Second original item must still exist after copying').toBeVisible();
    });

    await fileList.deleteFile(destFolder);
  });

  test('CFTP_MULTISELECT_TC_005 — cancel copying multiple selected items does not create duplicates', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const destFolder = TestData.generateFolderName('cftp_ms_copy_cancel');
    await fileList.createFolder(destFolder);
    await fm.selectFile(firstName);
    await fm.selectFile(secondName);

    await fileList.copyFile(firstName);
    await fileList.openFolder(destFolder);
    // Do not paste
    await test.step(`Verify no duplicates of "${firstName}" and "${secondName}" exist in destination folder "${destFolder}" when not pasted`, async () => {
      await expect(fileList.fileRow(firstName), 'No duplicate of the first item in the destination folder').toBeHidden();
      await expect(fileList.fileRow(secondName), 'No duplicate of the second item in the destination folder').toBeHidden();
    });
    await fileList.navigateUp();

    await test.step(`Verify both original items "${firstName}" and "${secondName}" still exist`, async () => {
      await expect(fileList.fileRow(firstName), 'First original item must still exist').toBeVisible();
      await expect(fileList.fileRow(secondName), 'Second original item must still exist').toBeVisible();
    });

    await fileList.deleteFile(destFolder);
  });

  test('CFTP_MULTISELECT_TC_006 — share (public) multiple selected items', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.shareFile(firstName);

    await test.step('Verify a share link was generated for each of the 2 selected items', async () => {
      expect(await fileList.getShareResultCount(), 'A share link must be generated for each selected item').toBe(2);
    });
    await fileList.confirmShareDialog();
  });

  test('CFTP_MULTISELECT_TC_007 — cancel sharing (public) multiple selected items via Escape does not share them', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);

    // The real UI applies Share (public) immediately with no confirm/cancel step —
    // the closest equivalent to "cancel" is dismissing the context menu before choosing it.
    await fileList.openContextMenu(firstName);
    await authenticatedPage.keyboard.press('Escape');

    await test.step('Verify no share result dialog appears when the share action is dismissed', async () => {
      await expect(
        authenticatedPage.getByTestId('share-result-dialog'),
        'No share result dialog must appear when the action was dismissed',
      ).toBeHidden();
    });
  });

  test('CFTP_MULTISELECT_TC_008 — share (password) multiple selected items', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.shareWithPassword(firstName, 'MultiShare@2026');

    await test.step('Verify a password-protected share link was generated for each of the 2 selected items', async () => {
      expect(await fileList.getShareResultCount(), 'A share link must be generated for each selected item').toBe(2);
    });
    await fileList.confirmShareDialog();
  });

  test('CFTP_MULTISELECT_TC_009 — cancel sharing (password) multiple selected items', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.selectContextAction(firstName, 'share-password');
    await fileList.fillDialogInput('MultiShare@2026');
    await fileList.cancelDialog();

    await test.step('Verify dialog closes after canceling share (password) for multiple items', async () => {
      await expect(authenticatedPage.getByTestId('dialog-title'), 'Dialog must close after canceling').toBeHidden();
    });
  });

  test('CFTP_MULTISELECT_TC_010 — delete multiple selected items', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.selectContextAction(firstName, 'delete');
    const message = await fileList.getDialogMessage();
    await test.step(`Verify delete confirmation message lists both selected items "${firstName}" and "${secondName}"`, async () => {
      expect(message, 'Delete confirmation message must list both selected items').toContain(firstName);
      expect(message, 'Delete confirmation message must list both selected items').toContain(secondName);
    });
    await fileList.confirmDialog();

    await test.step(`Verify both selected items "${firstName}" and "${secondName}" are deleted`, async () => {
      await expect(fileList.fileRow(firstName), 'First item must be deleted').toBeHidden();
      await expect(fileList.fileRow(secondName), 'Second item must be deleted').toBeHidden();
    });
  });

  test('CFTP_MULTISELECT_TC_011 — cancel deleting multiple selected items keeps them', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.selectContextAction(firstName, 'delete');
    await fileList.cancelDialog();

    await test.step(`Verify both selected items "${firstName}" and "${secondName}" still exist after canceling delete`, async () => {
      await expect(fileList.fileRow(firstName), 'First item must still exist after canceling delete').toBeVisible();
      await expect(fileList.fileRow(secondName), 'Second item must still exist after canceling delete').toBeVisible();
    });
  });
});
