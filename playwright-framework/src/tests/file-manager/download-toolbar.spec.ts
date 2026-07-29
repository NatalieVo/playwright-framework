import { test, expect } from '../../fixtures/auth.fixture';
import { FileListPage } from '../../pages/file-list.page';
import { FileManagerPage } from '../../pages/dashboard.page';
import { TestData } from '../../utils/test-data';
import { createTempTextFile, deleteTempFile } from '../../utils/helpers';
import { cleanupSharedItem } from '../../utils/share-cleanup';
import * as fs from 'fs';

test.describe('FileManager — Download via Toolbar', () => {
  test('CFTP_DOWNLOAD_TOOLBAR_TC_001 — download a single selected file via the Download icon on the toolbar', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_dl_toolbar');
    const filePath = createTempTextFile(fileName, 'Toolbar download test content');
    await fileList.uploadFile(filePath, fileName);

    await fm.selectFile(fileName);
    const [download] = await fm.downloadViaToolbar(1);

    await test.step(`Verify toolbar download produces the selected file "${fileName}"`, async () => {
      expect(download.suggestedFilename(), 'Toolbar download must produce the selected file').toBe(fileName);
    });

    deleteTempFile(filePath);
    await fileList.deleteFile(fileName).catch(() => undefined);
  });

  test('CFTP_DOWNLOAD_TOOLBAR_TC_002 — download multiple selected files via the Download icon on the toolbar', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const fileA = TestData.generateFileName('cftp_dl_toolbar_a');
    const fileB = TestData.generateFileName('cftp_dl_toolbar_b');
    const pathA = createTempTextFile(fileA, 'Toolbar multi download A');
    const pathB = createTempTextFile(fileB, 'Toolbar multi download B');
    await fileList.uploadFile(pathA, fileA);
    await fileList.uploadFile(pathB, fileB);

    await fm.selectFile(fileA);
    await fm.selectFile(fileB);
    const downloads = await fm.downloadViaToolbar(2);

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

  test('CFTP_DOWNLOAD_TOOLBAR_TC_003 — download a selected folder via the Download icon on the toolbar (as ZIP)', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const folderName = TestData.generateFolderName('cftp_dl_toolbar_folder');
    await fileList.createFolder(folderName);

    await fm.selectFile(folderName);
    const [download] = await fm.downloadViaToolbar(1);

    await test.step(`Verify folder is downloaded as a ZIP file "${folderName}.folder.zip"`, async () => {
      expect(download.suggestedFilename(), 'Folder must be downloaded as a ZIP file').toBe(`${folderName}.folder.zip`);
    });

    await fileList.deleteFile(folderName);
  });

  test('CFTP_DOWNLOAD_TOOLBAR_TC_004 — download a shared (no password) file via the toolbar', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_dl_toolbar_shared');
    const filePath = createTempTextFile(fileName, 'Shared file toolbar download');
    await fileList.uploadFile(filePath, fileName);
    await fileList.shareFile(fileName);
    await fileList.confirmShareDialog();
    // A Share-record write can hit the documented server-side contention (see
    // project_share_json_serialization_bug.md) — a late-arriving row refresh right after this can
    // silently clear a selection made too soon. Pace here the same way shares-management.spec.ts
    // does after its own Share-record writes, so the row has settled before we select it.
    await authenticatedPage.waitForTimeout(1_500);

    await fm.selectFile(fileName);
    const [download] = await fm.downloadViaToolbar(1);

    await test.step(`Verify shared file "${fileName}" still downloads normally via the toolbar`, async () => {
      expect(download.suggestedFilename(), 'A publicly shared file must still download normally via the toolbar').toBe(
        fileName,
      );
    });

    deleteTempFile(filePath);
    await cleanupSharedItem(authenticatedPage, fileList, fileName);
  });

  test('CFTP_DOWNLOAD_TOOLBAR_TC_005 — download multiple shared (no password) files via the toolbar', async ({
    authenticatedPage,
  }) => {
    // Two back-to-back Share writes plus a multi-file download is inherently slower than the
    // other cases here, and Share writes fired in quick succession can hit a server-side
    // contention delay (see project_share_json_serialization_bug.md) — give this one more
    // headroom than the default 60s instead of letting it ride right on the edge.
    test.setTimeout(90_000);
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const fileA = TestData.generateFileName('cftp_dl_toolbar_shared_a');
    const fileB = TestData.generateFileName('cftp_dl_toolbar_shared_b');
    const pathA = createTempTextFile(fileA, 'Shared multi A');
    const pathB = createTempTextFile(fileB, 'Shared multi B');
    await fileList.uploadFile(pathA, fileA);
    await fileList.uploadFile(pathB, fileB);
    // Share each file individually via its own context menu (no checkbox selection involved yet)
    await fileList.shareFile(fileA);
    await fileList.confirmShareDialog();
    await authenticatedPage.waitForTimeout(1_500);
    await fileList.shareFile(fileB);
    await fileList.confirmShareDialog();

    // Select both only once, right before downloading, to avoid a stale checkbox re-render race
    await fm.selectFile(fileA);
    await fm.selectFile(fileB);
    const downloads = await fm.downloadViaToolbar(2);

    const filenames = downloads.map((d) => d.suggestedFilename());
    await test.step(`Verify both shared files "${fileA}" and "${fileB}" still download normally via the toolbar`, async () => {
      expect(filenames, 'Both shared files must still download normally via the toolbar').toContain(fileA);
      expect(filenames, 'Both shared files must still download normally via the toolbar').toContain(fileB);
    });

    deleteTempFile(pathA);
    deleteTempFile(pathB);
    await cleanupSharedItem(authenticatedPage, fileList, fileA);
    await cleanupSharedItem(authenticatedPage, fileList, fileB);
  });

  test('CFTP_DOWNLOAD_TOOLBAR_TC_006 — download a shared (with password) file via the toolbar', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_dl_toolbar_shared_pw');
    const filePath = createTempTextFile(fileName, 'Password-shared file toolbar download');
    await fileList.uploadFile(filePath, fileName);
    await fileList.shareWithPassword(fileName, 'ToolbarShare@2026');
    await fileList.confirmShareDialog();

    await fm.selectFile(fileName);
    const [download] = await fm.downloadViaToolbar(1);

    await test.step(`Verify password-protected shared file "${fileName}" still downloads normally via the toolbar`, async () => {
      expect(
        download.suggestedFilename(),
        'A password-protected shared file must still download normally via the toolbar',
      ).toBe(fileName);
    });

    deleteTempFile(filePath);
    await cleanupSharedItem(authenticatedPage, fileList, fileName);
  });

  test('CFTP_DOWNLOAD_TOOLBAR_TC_007 — download multiple shared (with password) files via the toolbar', async ({
    authenticatedPage,
  }) => {
    // Two back-to-back Share-with-Password writes plus a multi-file download is inherently
    // slower than the other cases here, and Share writes fired in quick succession can hit a
    // server-side contention delay (see project_share_json_serialization_bug.md) — give this one
    // more headroom than the default 60s instead of letting it ride right on the edge.
    test.setTimeout(90_000);
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const fileA = TestData.generateFileName('cftp_dl_toolbar_shared_pw_a');
    const fileB = TestData.generateFileName('cftp_dl_toolbar_shared_pw_b');
    const pathA = createTempTextFile(fileA, 'Password-shared multi A');
    const pathB = createTempTextFile(fileB, 'Password-shared multi B');
    await fileList.uploadFile(pathA, fileA);
    await fileList.uploadFile(pathB, fileB);
    // Share each file individually via its own context menu (no checkbox selection involved yet)
    await fileList.shareWithPassword(fileA, 'ToolbarShare@2026');
    await fileList.confirmShareDialog();
    await authenticatedPage.waitForTimeout(1_500);
    await fileList.shareWithPassword(fileB, 'ToolbarShare@2026');
    await fileList.confirmShareDialog();

    // Select both only once, right before downloading, to avoid a stale checkbox re-render race
    await fm.selectFile(fileA);
    await fm.selectFile(fileB);
    const downloads = await fm.downloadViaToolbar(2);

    const filenames = downloads.map((d) => d.suggestedFilename());
    await test.step(`Verify both password-shared files "${fileA}" and "${fileB}" still download normally via the toolbar`, async () => {
      expect(filenames, 'Both password-shared files must still download normally via the toolbar').toContain(fileA);
      expect(filenames, 'Both password-shared files must still download normally via the toolbar').toContain(fileB);
    });

    deleteTempFile(pathA);
    deleteTempFile(pathB);
    await cleanupSharedItem(authenticatedPage, fileList, fileA);
    await cleanupSharedItem(authenticatedPage, fileList, fileB);
  });

  test('CFTP_DOWNLOAD_TOOLBAR_TC_008 — the Download icon is clickable once a file is selected', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_dl_toolbar_clickable');
    const filePath = createTempTextFile(fileName, 'Clickable check content');
    await fileList.uploadFile(filePath, fileName);

    await fm.selectFile(fileName);

    await test.step(`Verify Download icon is clickable once file "${fileName}" is selected`, async () => {
      expect(await fm.isDownloadDisabled(), 'Download icon must be clickable (enabled) once a file is selected').toBeFalsy();
    });

    deleteTempFile(filePath);
    await fileList.deleteFile(fileName).catch(() => undefined);
  });

  test('CFTP_DOWNLOAD_TOOLBAR_TC_009 — the Download icon is disabled (not clickable) when no file is selected', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    // Real-UI finding: instead of showing a message on click, the app disables the Download icon
    // entirely when nothing is selected, preventing the click altogether.
    await test.step('Verify Download icon is disabled with no selection', async () => {
      expect(await fm.isDownloadDisabled(), 'Download icon must be disabled with no selection').toBeTruthy();
    });
  });

  test('CFTP_DOWNLOAD_TOOLBAR_TC_010 — the downloaded file size matches the original file size', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_dl_toolbar_size');
    const content = 'Size verification content — must match after download';
    const filePath = createTempTextFile(fileName, content);
    await fileList.uploadFile(filePath, fileName);

    await fm.selectFile(fileName);
    const [download] = await fm.downloadViaToolbar(1);
    const savedPath = await download.path();

    await test.step('Verify download is saved to disk', async () => {
      expect(savedPath, 'Download must be saved to disk').not.toBeNull();
    });
    const downloadedSize = fs.statSync(savedPath as string).size;
    const originalSize = fs.statSync(filePath).size;
    await test.step('Verify downloaded file size matches the original file size', async () => {
      expect(downloadedSize, 'Downloaded file size must equal the original file size').toBe(originalSize);
    });

    deleteTempFile(filePath);
    await fileList.deleteFile(fileName).catch(() => undefined);
  });

  test('CFTP_DOWNLOAD_TOOLBAR_TC_011 — the downloaded file name matches the original file name', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_dl_toolbar_name');
    const filePath = createTempTextFile(fileName, 'Name verification content');
    await fileList.uploadFile(filePath, fileName);

    await fm.selectFile(fileName);
    const [download] = await fm.downloadViaToolbar(1);

    await test.step(`Verify downloaded file name matches the original file name "${fileName}"`, async () => {
      expect(download.suggestedFilename(), 'Downloaded file name must match the original file name').toBe(fileName);
    });

    deleteTempFile(filePath);
    await fileList.deleteFile(fileName).catch(() => undefined);
  });

  test('CFTP_DOWNLOAD_TOOLBAR_TC_012 — the original file remains unchanged in FileManager after downloading', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_dl_toolbar_remains');
    const filePath = createTempTextFile(fileName, 'Original file must remain after download');
    await fileList.uploadFile(filePath, fileName);

    await fm.selectFile(fileName);
    await fm.downloadViaToolbar(1);

    await test.step(`Verify original file "${fileName}" remains in FileManager after downloading`, async () => {
      await expect(fileList.fileRow(fileName), 'Original file must still exist in FileManager after downloading').toBeVisible();
    });

    deleteTempFile(filePath);
    await fileList.deleteFile(fileName).catch(() => undefined);
  });

  test('CFTP_DOWNLOAD_TOOLBAR_TC_013 — the downloaded file can be opened and its content read', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const fileName = TestData.generateFileName('cftp_dl_toolbar_open');
    const content = 'Content that must be readable after download';
    const filePath = createTempTextFile(fileName, content);
    await fileList.uploadFile(filePath, fileName);

    await fm.selectFile(fileName);
    const [download] = await fm.downloadViaToolbar(1);
    const savedPath = await download.path();

    await test.step('Verify downloaded file is saved to disk', async () => {
      expect(savedPath, 'Downloaded file must be saved to disk').not.toBeNull();
    });
    const downloadedContent = fs.readFileSync(savedPath as string, 'utf-8');
    await test.step('Verify downloaded file content is readable and matches the original', async () => {
      expect(downloadedContent, 'Downloaded file content must be readable and match the original').toBe(content);
    });

    deleteTempFile(filePath);
    await fileList.deleteFile(fileName).catch(() => undefined);
  });

  test('CFTP_DOWNLOAD_TOOLBAR_TC_014 — multiple selected files download simultaneously via the toolbar', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const fileA = TestData.generateFileName('cftp_dl_toolbar_simul_a');
    const fileB = TestData.generateFileName('cftp_dl_toolbar_simul_b');
    const pathA = createTempTextFile(fileA, 'Simultaneous download A');
    const pathB = createTempTextFile(fileB, 'Simultaneous download B');
    await fileList.uploadFile(pathA, fileA);
    await fileList.uploadFile(pathB, fileB);

    await fm.selectFile(fileA);
    await fm.selectFile(fileB);
    const downloads = await fm.downloadViaToolbar(2);

    await test.step('Verify all selected files are downloaded', async () => {
      expect(downloads, 'All selected files must be downloaded').toHaveLength(2);
    });

    deleteTempFile(pathA);
    deleteTempFile(pathB);
    await fileList.deleteFile(fileA).catch(() => undefined);
    await fileList.deleteFile(fileB).catch(() => undefined);
  });
});
