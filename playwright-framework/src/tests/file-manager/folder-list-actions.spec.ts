import { test, expect } from '../../fixtures/auth.fixture';
import { FileListPage } from '../../pages/file-list.page';
import { TestData } from '../../utils/test-data';

test.describe('FileManager — Folder List Actions', () => {
  let folderName: string;

  test.beforeEach(async ({ authenticatedPage }) => {
    folderName = TestData.generateFolderName('cftp_folder');
    const fileList = new FileListPage(authenticatedPage);
    await fileList.createFolder(folderName);
  });

  test.afterEach(async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);
    // TC_008 already deletes the folder as part of its own body — deleteFile() retries several
    // times before giving up on a missing row, so blindly calling it here on an already-gone
    // folder burns through all those retries and can exceed the test timeout. Check first.
    if (await fileList.isFileVisible(folderName)) {
      await fileList.deleteFile(folderName).catch(() => undefined);
    }
  });

  test('CFTP_FOLDER_TC_001 — open the folder via the context menu Open', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.openFolderViaContextMenu(folderName);

    await test.step(`Verify breadcrumb shows the opened folder "${folderName}"`, async () => {
      await expect(
        authenticatedPage.getByTestId('breadcrumb-current'),
        'Breadcrumb must show the opened folder name',
      ).toHaveText(folderName);
    });
    await test.step('Verify Up button is enabled after navigating into the folder', async () => {
      await expect(
        authenticatedPage.getByTestId('nav-up-button'),
        'Up button must be enabled after navigating into the folder',
      ).toBeEnabled();
    });

    await fileList.navigateUp();
  });

  test('CFTP_FOLDER_TC_002 — download the folder as ZIP', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    const download = await fileList.downloadFolderAsZip(folderName);

    await test.step(`Verify downloaded ZIP is named after the folder "${folderName}"`, async () => {
      expect(download.suggestedFilename(), 'Downloaded ZIP must be named after the folder').toBe(
        `${folderName}.folder.zip`,
      );
    });
  });

  test('CFTP_FOLDER_TC_003 — rename folder successfully', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);
    const newName = TestData.generateFolderName('cftp_renamed_folder');

    await fileList.renameFile(folderName, newName);

    await test.step(`Verify folder is renamed from "${folderName}" to "${newName}"`, async () => {
      await expect(fileList.fileRow(newName), 'Folder must show the new name after renaming').toBeVisible();
      await expect(fileList.fileRow(folderName), 'Old folder name must no longer exist after renaming').toBeHidden();
    });
    folderName = newName;
  });

  test('CFTP_FOLDER_TC_004 — cancel rename keeps the original folder name', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);
    const attemptedName = TestData.generateFolderName('cftp_renamed_folder');

    await fileList.cancelRename(folderName, attemptedName);

    await test.step(`Verify folder name "${folderName}" remains unchanged after cancelling rename`, async () => {
      await expect(
        fileList.fileRow(folderName),
        'Folder name must stay unchanged after canceling rename',
      ).toBeVisible();
      await expect(fileList.fileRow(attemptedName), 'New name must not be saved after canceling').toBeHidden();
    });
  });

  test('CFTP_FOLDER_TC_005 — move folder to another folder at the same level (Cut + Paste)', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const destFolder = TestData.generateFolderName('cftp_move_target');
    await fileList.createFolder(destFolder);

    await fileList.cutFile(folderName);
    await fileList.openFolder(destFolder);
    await fileList.pasteHere();

    await test.step(`Verify folder "${folderName}" appears inside the destination folder after moving`, async () => {
      await expect(
        fileList.fileRow(folderName),
        'Folder must appear inside the destination folder after moving',
      ).toBeVisible();
    });
    await fileList.navigateUp();
    await test.step(`Verify folder "${folderName}" no longer exists at the original location after moving`, async () => {
      await expect(
        fileList.fileRow(folderName),
        'Folder must no longer be at the original location after moving',
      ).toBeHidden();
    });

    // The folder was moved into destFolder — deleting destFolder cleans up the moved folder as well
    await fileList.deleteFile(destFolder);
  });

  test('CFTP_FOLDER_TC_006 — move folder into a subfolder of another folder', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);
    const destFolder = TestData.generateFolderName('cftp_move_parent');
    const subFolder = TestData.generateFolderName('cftp_move_sub');

    await fileList.createFolder(destFolder);
    await fileList.openFolder(destFolder);
    await fileList.createFolder(subFolder);
    await fileList.navigateUp();

    await fileList.cutFile(folderName);
    await fileList.openFolder(destFolder);
    await fileList.openFolder(subFolder);
    await fileList.pasteHere();

    await test.step(`Verify folder "${folderName}" appears inside the subfolder after moving`, async () => {
      await expect(
        fileList.fileRow(folderName),
        'Folder must appear inside the subfolder after moving',
      ).toBeVisible();
    });
    await fileList.navigateUp();
    await test.step(`Verify folder "${folderName}" is not directly under the destination parent after moving into the subfolder`, async () => {
      await expect(
        fileList.fileRow(folderName),
        'Folder must not be directly under the destination parent — it was moved into the subfolder',
      ).toBeHidden();
    });
    await fileList.navigateUp();

    await fileList.deleteFile(destFolder);
  });

  test('CFTP_FOLDER_TC_007 — cancel moving the folder keeps it at its original location', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const destFolder = TestData.generateFolderName('cftp_move_cancel');
    await fileList.createFolder(destFolder);

    await fileList.cutFile(folderName);
    await fileList.openFolder(destFolder);
    // Do not paste — navigate back to the original folder to verify the move was cancelled
    await fileList.navigateUp();

    await test.step(`Verify folder "${folderName}" is still at its original location when not pasted`, async () => {
      await expect(
        fileList.fileRow(folderName),
        'Folder must still be at its original location when not pasted',
      ).toBeVisible();
    });

    await fileList.deleteFile(destFolder);
  });

  test('CFTP_FOLDER_TC_008 — delete folder successfully', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.selectContextAction(folderName, 'delete');
    await test.step('Verify delete confirmation dialog is shown', async () => {
      expect(await fileList.getDialogTitle(), 'Delete confirmation dialog must be shown').toBe('Confirm Delete');
    });
    await fileList.confirmDialog();

    await test.step(`Verify folder "${folderName}" is deleted after confirming delete`, async () => {
      await expect(fileList.fileRow(folderName), 'Folder must be deleted after confirming delete').toBeHidden();
    });
  });

  test('CFTP_FOLDER_TC_009 — cancel delete keeps the folder', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.cancelDeleteFile(folderName);

    await test.step(`Verify folder "${folderName}" still exists after cancelling delete`, async () => {
      await expect(fileList.fileRow(folderName), 'Folder must still exist after canceling delete').toBeVisible();
    });
  });
});
