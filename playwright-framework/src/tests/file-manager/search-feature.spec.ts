import { test, expect } from '../../fixtures/auth.fixture';
import { FileListPage } from '../../pages/file-list.page';
import { FileManagerPage } from '../../pages/dashboard.page';
import { TestData } from '../../utils/test-data';
import { createTempTextFile, deleteTempFile } from '../../utils/helpers';

test.describe('FileManager — Search Feature', () => {
  let keyword: string;
  let itemA: string;
  let itemB: string;

  test.beforeEach(async ({ authenticatedPage }) => {
    keyword = `cftp_search_${TestData.currentTimestamp()}`;
    itemA = `${keyword}_a`;
    itemB = `${keyword}_b`;
    const fileList = new FileListPage(authenticatedPage);
    await fileList.createFolder(itemA);
    await fileList.createFolder(itemB);
  });

  test.afterEach(async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);
    await fm.exitSearch().catch(() => undefined);
    const fileList = new FileListPage(authenticatedPage);
    // Some tests (e.g. TC_006) already delete these as part of their own body — deleteFile()
    // retries several times before giving up, so blindly calling it on an already-gone item
    // burns through all those retries and can exceed the test timeout. Check first.
    if (await fileList.isFileVisible(itemA)) {
      await fileList.deleteFile(itemA).catch(() => undefined);
    }
    if (await fileList.isFileVisible(itemB)) {
      await fileList.deleteFile(itemB).catch(() => undefined);
    }
  });

  test('CFTP_SEARCH_TC_001 — search returns the matching items', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.search(keyword);

    await test.step(`Verify search for "${keyword}" returns exactly the matching items`, async () => {
      await expect(fm.fileRow(itemA), 'First matching item must be shown in the search result').toBeVisible();
      await expect(fm.fileRow(itemB), 'Second matching item must be shown in the search result').toBeVisible();
      expect(await fm.getVisibleFileNames(), 'Search result must only contain the matching items').toHaveLength(2);
    });
  });

  test('CFTP_SEARCH_TC_002 — searching subfolders finds a nested match only when recursive is checked', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const parentFolder = TestData.generateFolderName('cftp_search_parent');
    const nestedKeyword = `cftp_search_nested_${TestData.currentTimestamp()}`;

    await fileList.createFolder(parentFolder);
    await fileList.openFolder(parentFolder);
    await fileList.createFolder(nestedKeyword);
    await fileList.navigateUp();

    await fm.openSearchBox();
    await fm.setSearchRecursive(false);
    await authenticatedPage.getByTestId('search-input').fill(nestedKeyword);
    await authenticatedPage.keyboard.press('Enter');
    await test.step(`Verify non-recursive search for "${nestedKeyword}" does not find the nested match`, async () => {
      await expect(
        fm.fileRow(nestedKeyword),
        'Non-recursive search from Home must not find a match nested inside a subfolder',
      ).toBeHidden();
    });

    // The search bar stays open with the previous result — re-use it instead of re-opening
    await fm.setSearchRecursive(true);
    await authenticatedPage.getByTestId('search-input').fill(nestedKeyword);
    await authenticatedPage.keyboard.press('Enter');
    await test.step(`Verify recursive search ("Sub folders" checked) for "${nestedKeyword}" finds the nested match`, async () => {
      await expect(
        fm.fileRow(nestedKeyword),
        'Recursive search ("Sub folders" checked) must find the nested match',
      ).toBeVisible();
    });

    await fm.exitSearch();
    await fileList.deleteFile(parentFolder);
  });

  test('CFTP_SEARCH_TC_003 — the number of search results shown matches the number of matching items', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.search(keyword);

    // The real UI has no dedicated "total records" counter — the result row count is the total shown
    await test.step('Verify result row count equals the number of matching items', async () => {
      await expect(fm.getFileNamesLocator(), 'Result row count must equal the number of matching items').toHaveCount(2);
    });
  });

  test('CFTP_SEARCH_TC_004 — navigating back after opening a search result exits search mode (state is not preserved)', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.search(keyword);
    await fm.fileRow(itemA).dblclick();
    await test.step('Verify opening a search result navigates into it and exits search mode', async () => {
      await expect(
        authenticatedPage.getByTestId('search-context-text'),
        'Opening a result must navigate into it and exit search mode',
      ).toBeHidden();
    });

    await fm.goBack();

    // Real-UI finding: the Back button returns to the normal Home listing — the search filter is not restored
    await test.step('Verify Back returns to the normal folder view without restoring the search results', async () => {
      await expect(
        authenticatedPage.getByTestId('search-context-text'),
        'Search results are not restored by Back — the app returns to the normal folder view',
      ).toBeHidden();
      await expect(fm.fileRow(itemA), 'Home listing must still show the item after navigating back').toBeVisible();
    });
  });

  test('CFTP_SEARCH_TC_005 — search box is cleared when reopened after closing', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.search(keyword);
    await fm.closeSearchBox();
    await fm.openSearchBox();

    await test.step('Verify search input is cleared after closing and reopening', async () => {
      expect(await fm.getSearchInputValue(), 'Search input must be cleared after closing and reopening').toBe('');
    });
  });

  test('CFTP_SEARCH_TC_006 — delete an item directly from the search result', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);

    await fm.search(keyword);
    await fileList.selectContextAction(itemA, 'delete');
    await fileList.confirmDialog();

    await test.step(`Verify item "${itemA}" is deleted directly from the search result`, async () => {
      await expect(fm.fileRow(itemA), 'Item must be deleted directly from the search result').toBeHidden();
    });
  });

  test('CFTP_SEARCH_TC_007 — a file opened from the search result is read-only (cannot be edited)', async ({
    authenticatedPage,
  }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const fileKeyword = `cftp_search_edit_${TestData.currentTimestamp()}.txt`;
    const filePath = createTempTextFile(fileKeyword, 'Original search-edit content');
    await fileList.uploadFile(filePath, fileKeyword);

    await fm.search(fileKeyword);
    await fileList.openFile(fileKeyword);

    // Real-UI finding: the preview textarea is disabled/read-only when opened via a search result
    // (editing only works when opening the file from the normal folder listing)
    await test.step('Verify preview textarea is read-only when the file is opened from a search result', async () => {
      expect(
        await authenticatedPage.getByTestId('preview-text-textarea').isDisabled(),
        'Preview textarea must be read-only when the file is opened from a search result',
      ).toBeTruthy();
    });
    await fileList.closePreview();

    deleteTempFile(filePath);
    await fm.exitSearch();
    await fileList.deleteFile(fileKeyword).catch(() => undefined);
  });

  test('CFTP_SEARCH_TC_008 — view a file directly from the search result', async ({ authenticatedPage }) => {
    const fileList = new FileListPage(authenticatedPage);
    const fm = new FileManagerPage(authenticatedPage);
    const fileKeyword = `cftp_search_view_${TestData.currentTimestamp()}.txt`;
    const filePath = createTempTextFile(fileKeyword, 'Content to view from search result');
    await fileList.uploadFile(filePath, fileKeyword);

    await fm.search(fileKeyword);
    await fileList.openFile(fileKeyword);

    await test.step(`Verify preview modal shows the correct file name "${fileKeyword}"`, async () => {
      expect(await fileList.getPreviewTitle(), 'Preview modal must show the correct file name').toBe(fileKeyword);
    });
    await fileList.closePreview();

    deleteTempFile(filePath);
    await fm.exitSearch();
    await fileList.deleteFile(fileKeyword).catch(() => undefined);
  });

  test('CFTP_SEARCH_TC_009 — search works when the keyword is pasted into the search box', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.openSearchBox();
    // fill() sets the input value directly, equivalent to a paste rather than key-by-key typing
    await authenticatedPage.getByTestId('search-input').fill(keyword);
    await authenticatedPage.keyboard.press('Enter');

    await test.step(`Verify search returns the matching items for pasted keyword "${keyword}"`, async () => {
      await expect(fm.fileRow(itemA), 'Search must return the matching item for a pasted keyword').toBeVisible();
      await expect(fm.fileRow(itemB), 'Search must return the matching item for a pasted keyword').toBeVisible();
    });
  });

  test('CFTP_SEARCH_TC_010 — searching an invalid keyword returns no results', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);

    await fm.search('zzz_no_such_file_999');

    await test.step('Verify no-results message is shown for an unmatched keyword', async () => {
      expect(await fm.isNoResultsShown(), 'No-results message must be shown for an unmatched keyword').toBeTruthy();
    });
  });
});
