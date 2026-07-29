import { test, expect } from '../../fixtures/auth.fixture';
import { FileListPage } from '../../pages/file-list.page';
import { FileManagerPage } from '../../pages/dashboard.page';
import { TestData } from '../../utils/test-data';
import { createTempTextFile, deleteTempFile } from '../../utils/helpers';
import { cleanupSharedItem } from '../../utils/share-cleanup';

test.describe('FileManager — Download via Options List', () => {
  test('CFTP_DOWNLOAD_OPTIONLIST_TC_001 — download a file via Download on the options list', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_dl_optlist');
    const filePath = createTempTextFile(fileName, 'Options list download content');
    await fileList.uploadFile(filePath, fileName);

    const download = await fileList.downloadFile(fileName);

    await test.step(`Verify downloaded file matches the original file name "${fileName}"`, async () => {
      expect(download.suggestedFilename(), 'Downloaded file must match the original file name').toBe(fileName);
    });

    deleteTempFile(filePath);
    await fileList.deleteFile(fileName).catch(() => undefined);
  });

  test('CFTP_DOWNLOAD_OPTIONLIST_TC_002 — download multiple selected files via Download on the options list', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const fileA = TestData.generateFileName('cftp_dl_optlist_a');
    const fileB = TestData.generateFileName('cftp_dl_optlist_b');
    const pathA = createTempTextFile(fileA, 'Options list multi A');
    const pathB = createTempTextFile(fileB, 'Options list multi B');
    await fileList.uploadFile(pathA, fileA);
    await fileList.uploadFile(pathB, fileB);
    await fm.selectFile(fileA);
    await fm.selectFile(fileB);

    const downloads = await fileList.downloadSelection(fileA, 2);

    const filenames = downloads.map((d) => d.suggestedFilename());
    await test.step(`Verify both downloaded files include "${fileA}" and "${fileB}"`, async () => {
      expect(filenames, 'Both selected files must be downloaded').toContain(fileA);
      expect(filenames, 'Both selected files must be downloaded').toContain(fileB);
    });

    deleteTempFile(pathA);
    deleteTempFile(pathB);
    await fileList.deleteFile(fileA).catch(() => undefined);
    await fileList.deleteFile(fileB).catch(() => undefined);
  });

  test('CFTP_DOWNLOAD_OPTIONLIST_TC_003 — download a folder as ZIP via Download on the options list', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const folderName = TestData.generateFolderName('cftp_dl_optlist_folder');
    await fileList.createFolder(folderName);

    const download = await fileList.downloadFolderAsZip(folderName);

    await test.step(`Verify folder is downloaded as a ZIP file "${folderName}.folder.zip"`, async () => {
      expect(download.suggestedFilename(), 'Folder must be downloaded as a ZIP file').toBe(`${folderName}.folder.zip`);
    });

    await fileList.deleteFile(folderName);
  });

  test('CFTP_DOWNLOAD_OPTIONLIST_TC_004 — download a shared (no password) file via the options list', async ({
    authenticatedPage,
  }) => {
    // cleanupSharedItem() below navigates into the Shares folder to unshare, and that folder
    // currently holds thousands of accumulated items (see
    // project_shares_folder_scale_and_breadcrumb_fixes.md), which alone can take over a minute to
    // render — give this more headroom than the default 60s.
    test.setTimeout(180_000);
    const fileList = new FileListPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_dl_optlist_shared');
    const filePath = createTempTextFile(fileName, 'Shared file options-list download');
    await fileList.uploadFile(filePath, fileName);
    await fileList.shareFile(fileName);
    await fileList.confirmShareDialog();

    const download = await fileList.downloadFile(fileName);

    await test.step(`Verify shared file "${fileName}" still downloads normally`, async () => {
      expect(download.suggestedFilename(), 'A publicly shared file must still download normally').toBe(fileName);
    });

    deleteTempFile(filePath);
    await cleanupSharedItem(authenticatedPage, fileList, fileName);
  });

  test('CFTP_DOWNLOAD_OPTIONLIST_TC_005 — download multiple shared (no password) files via the options list', async ({
    authenticatedPage,
  }) => {
    // Two back-to-back Share writes plus a multi-file download is inherently slower than the
    // other cases here, and Share writes fired in quick succession can hit a server-side
    // contention delay (see project_share_json_serialization_bug.md). On top of that, cleanup
    // below calls cleanupSharedItem() twice (once per file), and each call navigates into the
    // Shares folder, which currently holds thousands of accumulated items and alone can take over
    // a minute to render (see project_shares_folder_scale_and_breadcrumb_fixes.md) — give this a
    // lot more headroom than the default 60s instead of letting it ride right on the edge.
    test.setTimeout(300_000);
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const fileA = TestData.generateFileName('cftp_dl_optlist_shared_a');
    const fileB = TestData.generateFileName('cftp_dl_optlist_shared_b');
    const pathA = createTempTextFile(fileA, 'Shared multi A');
    const pathB = createTempTextFile(fileB, 'Shared multi B');
    await fileList.uploadFile(pathA, fileA);
    await fileList.uploadFile(pathB, fileB);
    await fileList.shareFile(fileA);
    await fileList.confirmShareDialog();
    await authenticatedPage.waitForTimeout(1_500);
    await fileList.shareFile(fileB);
    await fileList.confirmShareDialog();

    await fm.selectFile(fileA);
    await fm.selectFile(fileB);
    // Downloading an already-shared file appears to also pay the same server-side share-metadata
    // cost as other Share operations here (see project_shares_folder_scale_and_breadcrumb_fixes.md)
    // — the default 15s poll window is too tight for 2 shared downloads under that load.
    const downloads = await fileList.downloadSelection(fileA, 2, 60_000);

    const filenames = downloads.map((d) => d.suggestedFilename());
    await test.step(`Verify both shared files "${fileA}" and "${fileB}" still download normally`, async () => {
      expect(filenames, 'Both shared files must still download normally').toContain(fileA);
      expect(filenames, 'Both shared files must still download normally').toContain(fileB);
    });

    deleteTempFile(pathA);
    deleteTempFile(pathB);
    await cleanupSharedItem(authenticatedPage, fileList, fileA);
    await cleanupSharedItem(authenticatedPage, fileList, fileB);
  });

  test('CFTP_DOWNLOAD_OPTIONLIST_TC_006 — download a shared (with password) file via the options list', async ({
    authenticatedPage,
  }) => {
    // Same reasoning as TC_004: cleanupSharedItem() below pays the cost of navigating into the
    // large accumulated Shares folder (see project_shares_folder_scale_and_breadcrumb_fixes.md).
    test.setTimeout(180_000);
    const fileList = new FileListPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_dl_optlist_shared_pw');
    const filePath = createTempTextFile(fileName, 'Password-shared file options-list download');
    await fileList.uploadFile(filePath, fileName);
    await fileList.shareWithPassword(fileName, 'OptListShare@2026');
    await fileList.confirmShareDialog();

    const download = await fileList.downloadFile(fileName);

    await test.step(`Verify password-protected shared file "${fileName}" still downloads normally`, async () => {
      expect(download.suggestedFilename(), 'A password-protected shared file must still download normally').toBe(
        fileName,
      );
    });

    deleteTempFile(filePath);
    await cleanupSharedItem(authenticatedPage, fileList, fileName);
  });

  test('CFTP_DOWNLOAD_OPTIONLIST_TC_007 — download multiple shared (with password) files via the options list', async ({
    authenticatedPage,
  }) => {
    // Two back-to-back Share-with-Password writes plus a multi-file download is inherently
    // slower than the other cases here, and Share writes fired in quick succession can hit a
    // server-side contention delay (see project_share_json_serialization_bug.md). On top of that,
    // cleanup below calls cleanupSharedItem() twice (once per file), and each call navigates into
    // the Shares folder, which currently holds thousands of accumulated items and alone can take
    // over a minute to render (see project_shares_folder_scale_and_breadcrumb_fixes.md) — give this
    // a lot more headroom than the default 60s instead of letting it ride right on the edge.
    test.setTimeout(360_000);
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const fileA = TestData.generateFileName('cftp_dl_optlist_shared_pw_a');
    const fileB = TestData.generateFileName('cftp_dl_optlist_shared_pw_b');
    const pathA = createTempTextFile(fileA, 'Password-shared multi A');
    const pathB = createTempTextFile(fileB, 'Password-shared multi B');
    await fileList.uploadFile(pathA, fileA);
    await fileList.uploadFile(pathB, fileB);
    await fileList.shareWithPassword(fileA, 'OptListShare@2026');
    await fileList.confirmShareDialog();
    await authenticatedPage.waitForTimeout(1_500);
    await fileList.shareWithPassword(fileB, 'OptListShare@2026');
    await fileList.confirmShareDialog();

    await fm.selectFile(fileA);
    await fm.selectFile(fileB);
    // Same reasoning as TC_005: downloading already-shared files under the current large Shares
    // dataset needs more than the default 15s poll window (see
    // project_shares_folder_scale_and_breadcrumb_fixes.md).
    const downloads = await fileList.downloadSelection(fileA, 2, 60_000);

    const filenames = downloads.map((d) => d.suggestedFilename());
    await test.step(`Verify both password-shared files "${fileA}" and "${fileB}" still download normally`, async () => {
      expect(filenames, 'Both password-shared files must still download normally').toContain(fileA);
      expect(filenames, 'Both password-shared files must still download normally').toContain(fileB);
    });

    deleteTempFile(pathA);
    deleteTempFile(pathB);
    await cleanupSharedItem(authenticatedPage, fileList, fileA);
    await cleanupSharedItem(authenticatedPage, fileList, fileB);
  });
});
