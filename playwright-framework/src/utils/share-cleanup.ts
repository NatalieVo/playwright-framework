import { Page } from '@playwright/test';
import { FileListPage } from '../pages/file-list.page';

// This cleanup helper is called after nearly every test across several spec files, so it hits a
// hard page navigation far more often than the original single-spec cleanupFile() it was extracted
// from. waitForLoaded()'s default 5s expect timeout occasionally isn't enough for the file list to
// render on a fresh goto() under load — retry the navigation itself instead of tightening every
// caller's own timeouts.
async function goHome(page: Page, filePage: FileListPage): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto('/FileManager/4/', { waitUntil: 'domcontentloaded' });
    try {
      await filePage.waitForVisible(page.getByTestId('file-list-container'), 10_000);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
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

// Deleting a file/folder does not remove its Share record — the record survives as an orphan,
// visible only inside the Shares view (Search doesn't index it either), and silently accumulates
// across every run (see project_share_json_serialization_bug.md). Any test that shares an item and
// then deletes it must unshare first, or this leaks a fresh orphan Share record every run. Safe to
// call on an item that was never shared — the Shares-folder check below is a no-op in that case.
export async function cleanupSharedItem(page: Page, filePage: FileListPage, name: string): Promise<void> {
  await goHome(page, filePage);
  await filePage.openSharesFolder();
  if (await filePage.isFileVisible(name)) {
    await filePage.deleteShare(name).catch(() => undefined);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    await goHome(page, filePage);
    if (!(await stillExists(filePage, name))) {
      return; // already gone (or never existed)
    }
    await filePage.deleteFile(name).catch(() => undefined);
    // Deleting an item that's still shared also mutates its share record — pace retries the same
    // way other rapid Share writes need to be paced, or a failing attempt just repeats instantly.
    await page.waitForTimeout(1_500);
    await goHome(page, filePage);
    if (!(await stillExists(filePage, name))) {
      return;
    }
  }
}
