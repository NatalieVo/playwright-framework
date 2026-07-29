import { test, expect } from '../../fixtures/auth.fixture';
import { FileListPage } from '../../pages/file-list.page';
import { TestData } from '../../utils/test-data';
import { createTempTextFile, deleteTempFile } from '../../utils/helpers';
import { cleanupSharedItem } from '../../utils/share-cleanup';

test.describe('FileManager — File List Actions', () => {
  let filePath: string;
  let fileName: string;

  test.beforeEach(async ({ authenticatedPage }) => {
    fileName = TestData.generateFileName('cftp_file');
    filePath = createTempTextFile(fileName, 'Automated test content - do not delete');
    const fileList = new FileListPage(authenticatedPage);
    await fileList.uploadFile(filePath, fileName);
  });

  test.afterEach(async ({ authenticatedPage }) => {
    deleteTempFile(filePath);
    await authenticatedPage.waitForLoadState('networkidle').catch(() => undefined);
    const fileList = new FileListPage(authenticatedPage);
    // Several tests in this describe share this file (TC_012-015) — unshare it first if still
    // shared, or this leaks an orphaned Share record every run (project_share_json_serialization_bug.md).
    await cleanupSharedItem(authenticatedPage, fileList, fileName);
  });

  test('CFTP_FILELIST_TC_001 — open the uploaded file via the context menu Open', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.openFile(fileName);

    await test.step(`Verify the preview modal displays the correct file name "${fileName}"`, async () => {
      expect(await fileList.getPreviewTitle(), 'Preview modal must display the correct file name').toBe(fileName);
    });
    await fileList.closePreview();
  });

  test('CFTP_FILELIST_TC_002 — double click opens the file (preview modal)', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.doubleClickFile(fileName);

    await test.step(`Verify double-clicking opens the file preview modal for "${fileName}"`, async () => {
      expect(await fileList.getPreviewTitle(), 'Double click must open the file preview modal').toBe(fileName);
    });
    await fileList.closePreview();
  });

  test('CFTP_FILELIST_TC_003 — download the uploaded file', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    const download = await fileList.downloadFile(fileName);

    await test.step(`Verify downloaded file name matches the original file name "${fileName}"`, async () => {
      expect(download.suggestedFilename(), 'Downloaded file must match the original file name').toBe(fileName);
    });
  });

  test('CFTP_FILELIST_TC_004 — rename file successfully', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);
    const newName = TestData.generateFileName('renamed_file');

    await fileList.renameFile(fileName, newName);

    await test.step(`Verify file is renamed from "${fileName}" to "${newName}"`, async () => {
      await expect(fileList.fileRow(newName), 'File must show the new name after renaming').toBeVisible();
      await expect(fileList.fileRow(fileName), 'Old file name must no longer exist after renaming').toBeHidden();
    });
    fileName = newName;
  });

  test('CFTP_FILELIST_TC_005 — cancel rename keeps the original file name', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);
    const attemptedName = TestData.generateFileName('renamed_file');

    await fileList.cancelRename(fileName, attemptedName);

    await test.step(`Verify rename is cancelled and file name "${fileName}" stays unchanged`, async () => {
      await expect(fileList.fileRow(fileName), 'File name must stay unchanged after canceling rename').toBeVisible();
      await expect(fileList.fileRow(attemptedName), 'New name must not be saved after canceling').toBeHidden();
    });
  });

  test('CFTP_FILELIST_TC_006 — move file to another folder (Cut + Paste)', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);
    const folderName = TestData.generateFolderName('cftp_move_target');

    await authenticatedPage.getByTestId('new-folder-button').click();
    await fileList.fillDialogInput(folderName);
    await fileList.confirmDialog();
    await fileList.cutFile(fileName);
    await fileList.openFolder(folderName);
    await fileList.pasteHere();

    await test.step(`Verify file "${fileName}" appears in destination folder "${folderName}" after moving`, async () => {
      await expect(fileList.fileRow(fileName), 'File must appear in the destination folder after moving').toBeVisible();
    });
    await fileList.navigateUp();
    await test.step(`Verify file "${fileName}" no longer exists at the original location after moving`, async () => {
      await expect(fileList.fileRow(fileName), 'File must no longer be at the old location after moving').toBeHidden();
    });

    // The file was moved into the folder — deleting the folder cleans up the file inside as well
    await fileList.deleteFile(folderName);
  });

  test('CFTP_FILELIST_TC_007 — cancel move keeps the file at its original location', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);
    const folderName = TestData.generateFolderName('cftp_move_cancel');

    await authenticatedPage.getByTestId('new-folder-button').click();
    await fileList.fillDialogInput(folderName);
    await fileList.confirmDialog();
    await fileList.cutFile(fileName);
    await fileList.openFolder(folderName);
    // Do not paste — navigate back to the original folder to verify the move was cancelled
    await fileList.navigateUp();

    await test.step(`Verify file "${fileName}" is still at its original location when not pasted`, async () => {
      await expect(fileList.fileRow(fileName), 'File must still be at its original location when not pasted').toBeVisible();
    });

    await fileList.deleteFile(folderName);
  });

  test('CFTP_FILELIST_TC_008 — copy file to another folder (Copy + Paste)', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);
    const folderName = TestData.generateFolderName('cftp_copy_target');

    await authenticatedPage.getByTestId('new-folder-button').click();
    await fileList.fillDialogInput(folderName);
    await fileList.confirmDialog();
    await fileList.copyFile(fileName);
    await fileList.openFolder(folderName);
    await fileList.pasteHere();

    await test.step(`Verify file "${fileName}" is copied into destination folder "${folderName}"`, async () => {
      await expect(fileList.fileRow(fileName), 'File must be copied into the destination folder').toBeVisible();
    });
    await fileList.navigateUp();
    await test.step(`Verify original file "${fileName}" still exists after copying`, async () => {
      await expect(fileList.fileRow(fileName), 'Original file must still exist after copying').toBeVisible();
    });

    await fileList.deleteFile(folderName);
  });

  test('CFTP_FILELIST_TC_009 — cancel copy does not create a duplicate', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);
    const folderName = TestData.generateFolderName('cftp_copy_cancel');

    await authenticatedPage.getByTestId('new-folder-button').click();
    await fileList.fillDialogInput(folderName);
    await fileList.confirmDialog();
    await fileList.copyFile(fileName);
    await fileList.openFolder(folderName);
    // Do not paste
    await test.step(`Verify no duplicate of file "${fileName}" exists in destination folder "${folderName}" when not pasted`, async () => {
      await expect(fileList.fileRow(fileName), 'There must be no duplicate in the destination folder when not pasted').toBeHidden();
    });
    await fileList.navigateUp();

    await test.step(`Verify original file "${fileName}" still exists`, async () => {
      await expect(fileList.fileRow(fileName), 'Original file must still exist').toBeVisible();
    });

    await fileList.deleteFile(folderName);
  });

  test('CFTP_FILELIST_TC_010 — edit file content and save', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);
    const newContent = `Edited content ${Date.now()}`;

    await fileList.openFile(fileName);
    await fileList.setPreviewContent(newContent);
    await fileList.savePreview();
    await fileList.closePreview();

    await fileList.openFile(fileName);
    await test.step(`Verify file content is saved as "${newContent}" after clicking Save`, async () => {
      expect(await fileList.getPreviewContent(), 'File content must be saved after clicking Save').toBe(newContent);
    });
    await fileList.closePreview();
  });

  test('CFTP_FILELIST_TC_011 — cancel edit does not save the content', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.openFile(fileName);
    const originalContent = await fileList.getPreviewContent();
    await fileList.closePreview();

    await fileList.openFile(fileName);
    await fileList.setPreviewContent(`Should not be saved ${Date.now()}`);
    await fileList.closePreview();

    await fileList.openFile(fileName);
    await test.step('Verify file content does not change when closed without saving', async () => {
      expect(await fileList.getPreviewContent(), 'File content must not change when closed without saving').toBe(originalContent);
    });
    await fileList.closePreview();
  });

  test('CFTP_FILELIST_TC_012 — share (public) the file successfully', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.shareFile(fileName);
    const link = await fileList.getShareLink();

    await test.step('Verify share link is generated and contains "/Share/"', async () => {
      expect(link, 'Share link must be generated and contain /Share/').toContain('/Share/');
    });
    await fileList.confirmShareDialog();
  });

  test('CFTP_FILELIST_TC_013 — share (public) a file that was already shared before', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.shareFile(fileName);
    await fileList.confirmShareDialog();

    await fileList.shareFile(fileName);
    const overwriteMsg = await fileList.getOverwriteMessage();
    await test.step('Verify confirmation message for overwriting an existing share is shown', async () => {
      expect(overwriteMsg, 'Must show a confirmation message for overwriting an existing share').toContain('already exist');
    });

    await fileList.confirmOverwriteShare();
    const link = await fileList.getShareLink();
    await test.step('Verify a new share dialog with a link appears after confirming overwrite', async () => {
      expect(link, 'Share dialog with a new link must appear after confirming overwrite').toContain('/Share/');
    });
    await fileList.confirmShareDialog();
  });

  test('CFTP_FILELIST_TC_014 — cancel overwriting an existing share', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.shareFile(fileName);
    await fileList.confirmShareDialog();

    await fileList.shareFile(fileName);
    await fileList.cancelOverwriteShare();

    await test.step('Verify overwrite dialog closes after canceling', async () => {
      await expect(
        authenticatedPage.getByTestId('overwrite-confirm-dialog'),
        'Overwrite dialog must close after canceling',
      ).toBeHidden();
    });
  });

  test('CFTP_FILELIST_TC_015 — share (password) the file successfully', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.shareWithPassword(fileName, 'Share@2026');
    const link = await fileList.getShareLink();

    await test.step('Verify password-protected share link is generated', async () => {
      expect(link, 'Password-protected share link must be generated').toContain('/Share/');
    });
    await fileList.confirmShareDialog();
  });

  test('CFTP_FILELIST_TC_016 — cancel share (password)', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.selectContextAction(fileName, 'share-password');
    await fileList.fillDialogInput('Share@2026');
    await fileList.cancelDialog();

    await test.step('Verify dialog closes after canceling share (password)', async () => {
      await expect(authenticatedPage.getByTestId('dialog-title'), 'Dialog must close after canceling').toBeHidden();
    });
  });

  test('CFTP_FILELIST_TC_017 — share (password) with an invalid password (<4 characters)', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.shareWithPassword(fileName, 'ab1');

    await test.step('Verify an error dialog is shown for invalid password (less than 4 characters)', async () => {
      expect(await fileList.getDialogTitle(), 'Must show an error dialog').toBe('Error');
      expect(await fileList.getDialogMessage(), 'Error message must match the password validation text').toBe(
        'Password must be at least 4 characters and must not start or end with a space.',
      );
    });
    await fileList.confirmDialog();
    // After closing the error dialog, the app returns to the password input dialog — close it too so no dialog blocks the UI
    await fileList.cancelDialog();
  });

  test('CFTP_FILELIST_TC_018 — delete file successfully', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.selectContextAction(fileName, 'delete');
    await test.step('Verify delete confirmation dialog is shown', async () => {
      expect(await fileList.getDialogTitle(), 'Delete confirmation dialog must be shown').toBe('Confirm Delete');
    });
    await fileList.confirmDialog();

    await test.step(`Verify file "${fileName}" is deleted after confirming delete`, async () => {
      await expect(fileList.fileRow(fileName), 'File must be deleted after confirming delete').toBeHidden();
    });
  });

  test('CFTP_FILELIST_TC_019 — cancel delete keeps the file', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);

    await fileList.cancelDeleteFile(fileName);

    await test.step(`Verify file "${fileName}" still exists after canceling delete`, async () => {
      await expect(fileList.fileRow(fileName), 'File must still exist after canceling delete').toBeVisible();
    });
  });
});
