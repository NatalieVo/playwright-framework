import { Page, Locator, Download, expect, test } from '@playwright/test';
import { BasePage } from './base.page';

export class FileManagerPage extends BasePage {
  private readonly appHeader = this.page.getByTestId('app-header');
  private readonly breadcrumbCurrent = this.page.getByTestId('breadcrumb-current');
  private readonly userMenuButton = this.page.getByTestId('user-menu-button');
  private readonly userMenuUsername = this.page.getByTestId('user-menu-username');
  private readonly logoutButton = this.page.getByTestId('user-menu-logout');
  private readonly toolbar = this.page.locator('div[data-testid="toolbar"]');
  private readonly searchButton = this.page.getByTestId('search-button');
  private readonly searchInput = this.page.getByTestId('search-input');
  private readonly searchCloseButton = this.page.getByTestId('search-close-button');
  private readonly searchRecursiveCheckbox = this.page.getByTestId('search-recursive-checkbox');
  private readonly searchContextText = this.page.getByTestId('search-context-text');
  private readonly exitSearchButton = this.page.getByTestId('exit-search-button');
  private readonly searchLocations = this.page.getByTestId('search-location');

  private readonly uploadButton = this.page.getByTestId('upload-button');
  private readonly newFileButton = this.page.getByTestId('new-file-button');
  private readonly newFolderButton = this.page.getByTestId('new-folder-button');

  private readonly dialogTitle = this.page.getByTestId('dialog-title');
  private readonly dialogMessage = this.page.getByTestId('dialog-message');
  private readonly dialogInput = this.page.getByTestId('dialog-input');
  private readonly dialogOkButton = this.page.getByTestId('dialog-ok-button');
  private readonly dialogCancelButton = this.page.getByTestId('dialog-cancel-button');
  private readonly clipboardInfo = this.page.getByTestId('clipboard-info');

  private readonly uploadOverwriteButton = this.page.getByTestId('dialog-overwrite-button');
  private readonly uploadSkipButton = this.page.getByTestId('dialog-skip-button');

  private readonly shareResultDialog = this.page.getByTestId('share-result-dialog');
  private readonly shareResultDialogOkButton = this.page.getByTestId('share-dialog-ok');
  private readonly overwriteConfirmDialog = this.page.getByTestId('overwrite-confirm-dialog');
  private readonly overwriteDialogOkButton = this.page.getByTestId('overwrite-dialog-ok');

  private readonly languageSelectorButton = this.page.getByTestId('language-selector-button');
  private readonly tableHeader = this.page.locator('[data-testid="file-list-table"] thead');
  private readonly fileListEmpty = this.page.getByTestId('file-list-empty');
  private readonly fileNames = this.page.getByTestId('file-name');
  private readonly fileRows = this.page.getByTestId('file-row');
  private readonly selectAllCheckbox = this.page.getByTestId('select-all-checkbox');
  private readonly uploadProgressBar = this.page.getByTestId('upload-progress-bar');

  // --- Breadcrumb bar (header-nav / header-right) ---
  private readonly backButton = this.page.getByTestId('nav-back-button');
  private readonly forwardButton = this.page.getByTestId('nav-forward-button');
  private readonly upButton = this.page.getByTestId('nav-up-button');
  private readonly refreshButton = this.page.getByTestId('nav-refresh-button');
  private readonly densityButton = this.page.getByTestId('theme-selector-button');
  private readonly manageAccountButton = this.page.getByTestId('user-menu-manage-account');
  private readonly firstFileRow = this.page.getByTestId('file-list-body').getByTestId('file-row').first();

  // --- Toolbar action icons ---
  private readonly downloadButton = this.page.getByTestId('download-button');
  private readonly cutButton = this.page.getByTestId('cut-button');
  private readonly copyButton = this.page.getByTestId('copy-button');
  private readonly pasteButton = this.page.getByTestId('paste-button');
  private readonly renameButton = this.page.getByTestId('rename-button');
  private readonly deleteButton = this.page.getByTestId('delete-button');
  private readonly shareButton = this.page.getByTestId('share-button');
  private readonly sharePasswordButton = this.page.getByTestId('share-password-button');

  constructor(page: Page) {
    super(page);
  }

  fileRow(name: string): Locator {
    return this.fileNames.filter({ hasText: name });
  }

  async isLoaded(): Promise<boolean> {
    return test.step('Check if FileManager app has loaded (app header visible)', async () => this.isVisible(this.appHeader));
  }

  async getCurrentPath(): Promise<string> {
    return test.step('Get current breadcrumb path text', async () => this.getText(this.breadcrumbCurrent));
  }

  getBreadcrumbLocator(): Locator {
    return this.breadcrumbCurrent;
  }

  getDialogTitleLocator(): Locator {
    return this.dialogTitle;
  }

  async getLoggedInUsername(): Promise<string> {
    return test.step('Get logged-in username from the user menu', async () => {
      await this.click(this.userMenuButton);
      await this.waitForVisible(this.userMenuUsername);
      const name = await this.getText(this.userMenuUsername);
      await this.click(this.userMenuButton);
      return name.trim();
    });
  }

  async logout(): Promise<void> {
    await test.step('Log out of the application', async () => {
      await this.click(this.userMenuButton);
      await this.waitForVisible(this.logoutButton);
      await this.click(this.logoutButton);
      // Confirm logout dialog
      const confirmOk = this.page.getByRole('button', { name: 'OK' });
      await this.waitForVisible(confirmOk);
      await Promise.all([
        this.page.waitForURL(/Login/, { waitUntil: 'domcontentloaded', timeout: 15_000 }),
        this.click(confirmOk),
      ]);
    });
  }

  async isToolbarVisible(): Promise<boolean> {
    return test.step('Check if the toolbar is visible', async () => this.isVisible(this.toolbar));
  }

  async search(keyword: string): Promise<void> {
    await test.step(`Search for "${keyword}" using the toolbar search box`, async () => {
      await this.click(this.searchButton);
      await this.fill(this.searchInput, keyword);
      await this.page.keyboard.press('Enter');
    });
  }

  async cancelLogout(): Promise<void> {
    await test.step('Open the logout confirmation dialog and cancel it', async () => {
      await this.click(this.userMenuButton);
      await this.waitForVisible(this.logoutButton);
      await this.click(this.logoutButton);
      await this.waitForVisible(this.dialogCancelButton);
      await this.click(this.dialogCancelButton);
    });
  }

  // --- Upload (navigation bar icon) ---
  async uploadNewFile(filePath: string, fileName: string): Promise<void> {
    await test.step(`Upload new file "${fileName}" via the toolbar Upload icon (source: "${filePath}")`, async () => {
      const [chooser] = await Promise.all([
        this.page.waitForEvent('filechooser'),
        this.click(this.uploadButton),
      ]);
      await chooser.setFiles(filePath);
      await this.waitForVisible(this.fileRow(fileName), 15_000);
    });
  }

  // For large/slow uploads (e.g. multi-GB files) — waits for the row to appear with a
  // caller-supplied timeout instead of the normal 15s default.
  async uploadNewFileAndWait(filePath: string, fileName: string, timeout: number): Promise<void> {
    await test.step(`Upload new file "${fileName}" via the toolbar Upload icon and wait up to ${timeout}ms (source: "${filePath}")`, async () => {
      const [chooser] = await Promise.all([
        this.page.waitForEvent('filechooser'),
        this.click(this.uploadButton),
      ]);
      await chooser.setFiles(filePath);
      await this.waitForVisible(this.fileRow(fileName), timeout);
    });
  }

  // Uploads every path in one file-chooser selection (bulk upload). The upload runs as a background
  // operation independent of the current folder view — the file list does NOT live-refresh as each
  // upload completes (confirmed live: the progress bar kept advancing well after navigating away
  // from the folder, while the list itself stayed empty) — so waiting for a specific row to appear
  // is unreliable for a large batch. The progress bar itself never hides either — it stays visible
  // and its aria-valuetext switches to the literal string "Upload complete" (confirmed live via a
  // failed toBeHidden() poll log showing that exact stable value) — wait on that text, then force a
  // list refresh since the view won't reflect the finished upload on its own.
  async uploadMultipleNewFiles(filePaths: string[], timeout: number): Promise<void> {
    await test.step(`Upload ${filePaths.length} new file(s) via the toolbar Upload icon`, async () => {
      const [chooser] = await Promise.all([
        this.page.waitForEvent('filechooser'),
        this.click(this.uploadButton),
      ]);
      await chooser.setFiles(filePaths);
      await expect(this.uploadProgressBar).toHaveAttribute('aria-valuetext', 'Upload complete', { timeout });
      await this.refresh();
    });
  }

  async isUploadProgressVisible(): Promise<boolean> {
    return test.step('Check if the upload progress bar is visible', async () => this.isVisible(this.uploadProgressBar));
  }

  async openUploadFileChooserAndCancel(): Promise<void> {
    await test.step('Open the upload file chooser via the toolbar Upload icon and dismiss it without selecting a file', async () => {
      // Simulates the user dismissing the native file picker without selecting a file
      await Promise.all([
        this.page.waitForEvent('filechooser'),
        this.click(this.uploadButton),
      ]);
    });
  }

  async uploadExistingFile(filePath: string): Promise<void> {
    await test.step(`Upload file "${filePath}" via the toolbar Upload icon (expecting an overwrite conflict dialog)`, async () => {
      const [chooser] = await Promise.all([
        this.page.waitForEvent('filechooser'),
        this.click(this.uploadButton),
      ]);
      await chooser.setFiles(filePath);
      await this.waitForVisible(this.dialogTitle);
    });
  }

  async getUploadConflictTitle(): Promise<string> {
    return test.step('Get upload-conflict dialog title text', async () => this.getText(this.dialogTitle));
  }

  async overwriteUpload(): Promise<void> {
    await test.step('Confirm "Overwrite" for the upload conflict dialog', async () => {
      await this.click(this.uploadOverwriteButton);
    });
  }

  async skipUpload(): Promise<void> {
    await test.step('Confirm "Skip" for the upload conflict dialog', async () => {
      await this.click(this.uploadSkipButton);
    });
  }

  // --- New File (navigation bar icon) ---
  async createNewFileWithName(name: string): Promise<void> {
    await test.step(`Create new file with name "${name}" via the toolbar New File icon`, async () => {
      await this.click(this.newFileButton);
      await this.waitForVisible(this.dialogInput);
      await this.fill(this.dialogInput, name);
      await this.click(this.dialogOkButton);
      await this.waitForVisible(this.fileRow(name), 15_000);
    });
  }

  async createNewFileWithDefaultName(): Promise<string> {
    return test.step('Create new file with the default name via the toolbar New File icon', async () => {
      await this.click(this.newFileButton);
      await this.waitForVisible(this.dialogInput);
      const defaultName = await this.dialogInput.inputValue();
      await this.click(this.dialogOkButton);
      await this.waitForVisible(this.fileRow(defaultName), 15_000);
      return defaultName;
    });
  }

  async cancelNewFile(name: string): Promise<void> {
    await test.step(`Cancel creating new file with attempted name "${name}" via the toolbar New File icon`, async () => {
      await this.click(this.newFileButton);
      await this.waitForVisible(this.dialogInput);
      await this.fill(this.dialogInput, name);
      await this.click(this.dialogCancelButton);
    });
  }

  // --- New Folder (navigation bar icon) ---
  async createNewFolderWithDefaultName(): Promise<string> {
    return test.step('Create new folder with the default name via the toolbar New Folder icon', async () => {
      await this.click(this.newFolderButton);
      await this.waitForVisible(this.dialogInput);
      const defaultName = await this.dialogInput.inputValue();
      await this.click(this.dialogOkButton);
      await this.waitForVisible(this.fileRow(defaultName), 15_000);
      return defaultName;
    });
  }

  async cancelNewFolder(): Promise<void> {
    await test.step('Cancel creating new folder via the toolbar New Folder icon', async () => {
      await this.click(this.newFolderButton);
      await this.waitForVisible(this.dialogInput);
      await this.click(this.dialogCancelButton);
    });
  }

  // --- Language selector (navigation bar icon) ---
  async changeLanguage(languageCode: string): Promise<void> {
    await test.step(`Change language to "${languageCode}" via the language selector`, async () => {
      await this.click(this.languageSelectorButton);
      await this.click(this.page.getByTestId(`language-option-${languageCode}`));
    });
  }

  async getTableHeaderText(): Promise<string> {
    return test.step('Get file list table header text', async () => this.tableHeader.innerText());
  }

  getTableHeaderLocator(): Locator {
    return this.tableHeader;
  }

  // --- Search (navigation bar icon) ---
  async getVisibleFileNames(): Promise<string[]> {
    return test.step('Get all visible file names in the list', async () => this.fileNames.allTextContents());
  }

  getFileNamesLocator(): Locator {
    return this.fileNames;
  }

  async isNoResultsShown(): Promise<boolean> {
    return test.step('Check if the "no results" empty state is shown', async () => this.isVisible(this.fileListEmpty));
  }

  async openSearchBox(): Promise<void> {
    await test.step('Open the search box via the toolbar Search icon', async () => {
      await this.click(this.searchButton);
      await this.waitForVisible(this.searchInput);
    });
  }

  async getSearchInputValue(): Promise<string> {
    return test.step('Get the current search input value', async () => this.searchInput.inputValue());
  }

  async closeSearchBox(): Promise<void> {
    await test.step('Close the search box', async () => {
      await this.click(this.searchCloseButton);
    });
  }

  async isSearchRecursiveChecked(): Promise<boolean> {
    return test.step('Check if the "search recursively" checkbox is checked', async () =>
      this.searchRecursiveCheckbox.isChecked(),
    );
  }

  async setSearchRecursive(checked: boolean): Promise<void> {
    await test.step(`Set "search recursively" checkbox to ${checked ? 'checked' : 'unchecked'}`, async () => {
      if (checked) {
        await this.searchRecursiveCheckbox.check();
      } else {
        await this.searchRecursiveCheckbox.uncheck();
      }
    });
  }

  async getSearchContextText(): Promise<string> {
    return test.step('Get search context text (current search scope)', async () => this.getText(this.searchContextText));
  }

  async exitSearch(): Promise<void> {
    await test.step('Exit the search results view', async () => {
      await this.click(this.exitSearchButton);
    });
  }

  getSearchLocationsLocator(): Locator {
    return this.searchLocations;
  }

  // --- Breadcrumb bar: Back / Forward / Up / Refresh ---
  async goBack(): Promise<void> {
    await test.step('Click the Back navigation button', async () => {
      await this.click(this.backButton);
    });
  }

  async goForward(): Promise<void> {
    await test.step('Click the Forward navigation button', async () => {
      await this.click(this.forwardButton);
    });
  }

  async goUp(): Promise<void> {
    await test.step('Click the Up navigation button', async () => {
      await this.click(this.upButton);
    });
  }

  async refresh(): Promise<void> {
    await test.step('Click the Refresh navigation button', async () => {
      await this.click(this.refreshButton);
    });
  }

  async isBackDisabled(): Promise<boolean> {
    return test.step('Check if the Back button is disabled', async () => this.backButton.isDisabled());
  }

  async isForwardDisabled(): Promise<boolean> {
    return test.step('Check if the Forward button is disabled', async () => this.forwardButton.isDisabled());
  }

  async isUpDisabled(): Promise<boolean> {
    return test.step('Check if the Up button is disabled', async () => this.upButton.isDisabled());
  }

  // --- Breadcrumb bar: density view toggle ---
  async getDensityButtonTitle(): Promise<string> {
    return test.step('Get the density/view-toggle button title attribute', async () =>
      (await this.densityButton.getAttribute('title')) ?? '',
    );
  }

  async toggleDensity(): Promise<void> {
    await test.step('Toggle compact/comfortable view density', async () => {
      await this.click(this.densityButton);
    });
  }

  async getFirstRowHeight(): Promise<number> {
    return test.step('Get the bounding-box height of the first file row', async () => {
      const box = await this.firstFileRow.boundingBox();
      return box?.height ?? 0;
    });
  }

  // --- Breadcrumb bar: account menu ---
  async goToManageAccount(): Promise<void> {
    await test.step('Navigate to the Manage Account page via the user menu', async () => {
      await this.click(this.userMenuButton);
      await this.waitForVisible(this.manageAccountButton);
      await this.click(this.manageAccountButton);
    });
  }

  // --- Toolbar: file selection ---
  private fileRowContainer(name: string): Locator {
    return this.fileRows.filter({ hasText: name });
  }

  async selectFile(name: string): Promise<void> {
    await test.step(`Select file "${name}" via its row checkbox`, async () => {
      await this.fileRowContainer(name).getByTestId('row-checkbox').check();
    });
  }

  async deselectFile(name: string): Promise<void> {
    await test.step(`Deselect file "${name}" via its row checkbox`, async () => {
      await this.fileRowContainer(name).getByTestId('row-checkbox').uncheck();
    });
  }

  // Checks every row currently in the list, real data included — verify the current folder's
  // contents first (e.g. against a known safe prefix, or that it's a dedicated test subfolder)
  // before calling this.
  async selectAllVisible(): Promise<void> {
    await test.step('Select all visible items via the header "select all" checkbox', async () => {
      await this.click(this.selectAllCheckbox);
    });
  }

  // --- Toolbar: action icon enabled/disabled state ---
  async isDownloadDisabled(): Promise<boolean> {
    return test.step('Check if the Download toolbar icon is disabled', async () => this.downloadButton.isDisabled());
  }

  async isCutDisabled(): Promise<boolean> {
    return test.step('Check if the Cut toolbar icon is disabled', async () => this.cutButton.isDisabled());
  }

  async isCopyDisabled(): Promise<boolean> {
    return test.step('Check if the Copy toolbar icon is disabled', async () => this.copyButton.isDisabled());
  }

  async isPasteDisabled(): Promise<boolean> {
    return test.step('Check if the Paste toolbar icon is disabled', async () => this.pasteButton.isDisabled());
  }

  async isRenameDisabled(): Promise<boolean> {
    return test.step('Check if the Rename toolbar icon is disabled', async () => this.renameButton.isDisabled());
  }

  async isDeleteDisabled(): Promise<boolean> {
    return test.step('Check if the Delete toolbar icon is disabled', async () => this.deleteButton.isDisabled());
  }

  async isShareDisabled(): Promise<boolean> {
    return test.step('Check if the Share (public) toolbar icon is disabled', async () => this.shareButton.isDisabled());
  }

  async isSharePasswordDisabled(): Promise<boolean> {
    return test.step('Check if the Share with Password toolbar icon is disabled', async () =>
      this.sharePasswordButton.isDisabled(),
    );
  }

  // --- Toolbar: share ---
  async clickShareButton(): Promise<void> {
    await test.step('Click the Share (public) toolbar icon', async () => {
      await this.click(this.shareButton);
    });
  }

  async clickSharePasswordButton(): Promise<void> {
    await test.step('Click the Share with Password toolbar icon', async () => {
      await this.click(this.sharePasswordButton);
    });
  }

  // Re-sharing an already-shared item shows an overwrite-confirmation dialog before the share
  // result dialog — race both so this works for first-time shares and re-shares alike. Confirmed
  // live: for a very large batch (10000 items), the share completes server-side but the app never
  // renders ANY result dialog at all (verified via screenshot — no modal, toolbar fully interactive,
  // "10000 items selected" still shown) — not a slow-render case, there is simply no dialog to
  // confirm. Treat a missing dialog as a no-op; the caller's own Shares-folder status check is the
  // authoritative verification of whether the share actually took effect either way.
  async confirmShareResultDialog(): Promise<void> {
    await test.step('Confirm the share result dialog (handling overwrite confirmation, or no dialog for very large batches)', async () => {
      const overwritePromise = this.overwriteConfirmDialog.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => null);
      const resultPromise = this.shareResultDialog.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => null);
      await Promise.race([overwritePromise, resultPromise]);

      if (await this.overwriteConfirmDialog.isVisible()) {
        await this.click(this.overwriteDialogOkButton);
        await this.shareResultDialog.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
      }

      if (await this.shareResultDialog.isVisible()) {
        await this.shareResultDialogOkButton.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
        await this.click(this.shareResultDialogOkButton);
        await this.waitForHidden(this.shareResultDialog, 5_000).catch(() => undefined);
      }
    });
  }

  async shareViaToolbar(): Promise<void> {
    await test.step('Share the selected item(s) publicly via the toolbar icon', async () => {
      await this.clickShareButton();
      await this.confirmShareResultDialog();
    });
  }

  async sharePasswordViaToolbar(password: string): Promise<void> {
    await test.step('Share the selected item(s) with a masked password via the toolbar icon', async () => {
      await this.clickSharePasswordButton();
      // A large selection can take a while to prepare the password prompt server-side — wait on
      // the input explicitly first, with a longer budget, past fillSecret()'s default 5s wait.
      await this.dialogInput.waitFor({ state: 'visible', timeout: 60_000 });
      await this.fillSecret(this.dialogInput, password, 'share password');
      await this.click(this.dialogOkButton);
      await this.confirmShareResultDialog();
    });
  }

  // --- Toolbar: download ---
  async downloadViaToolbar(expectedCount: number = 1): Promise<Download[]> {
    return test.step(`Download the selected item(s) via the toolbar Download icon (expecting >= ${expectedCount} download(s))`, async () => {
      const downloads: Download[] = [];
      const onDownload = (d: Download) => downloads.push(d);
      this.page.on('download', onDownload);
      await this.click(this.downloadButton);
      await expect.poll(() => downloads.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(expectedCount);
      this.page.off('download', onDownload);
      return downloads;
    });
  }

  // --- Toolbar: cut / copy / delete (checkbox-selected rows) ---
  async getDialogTitle(): Promise<string> {
    return test.step('Get dialog title text', async () => this.getText(this.dialogTitle));
  }

  async getDialogMessage(): Promise<string> {
    return test.step('Get dialog message text', async () => this.getText(this.dialogMessage));
  }

  async confirmDialog(): Promise<void> {
    await test.step('Confirm the dialog (click OK)', async () => {
      await this.click(this.dialogOkButton);
    });
  }

  async clickCutButton(): Promise<void> {
    await test.step('Click the Cut toolbar icon', async () => {
      await this.click(this.cutButton);
    });
  }

  async clickDeleteButton(): Promise<void> {
    await test.step('Click the Delete toolbar icon', async () => {
      await this.click(this.deleteButton);
    });
  }

  async clickCopyButton(): Promise<void> {
    await test.step('Click the Copy toolbar icon', async () => {
      await this.click(this.copyButton);
    });
  }

  async getClipboardInfoText(): Promise<string> {
    return test.step('Get clipboard info text', async () => this.getText(this.clipboardInfo));
  }

  async pasteViaToolbar(): Promise<void> {
    await test.step('Paste via the toolbar Paste icon', async () => {
      await this.click(this.pasteButton);
    });
  }

  async deleteSelectedViaToolbar(fileName: string, timeout?: number): Promise<void> {
    await test.step(`Delete the selected item(s) via the toolbar Delete icon (verify "${fileName}" is removed)`, async () => {
      await this.click(this.deleteButton);
      await this.confirmDialog();
      await this.waitForHidden(this.fileRow(fileName), timeout);
    });
  }

  // For bulk delete (e.g. after selectAllVisible()) where waiting on one specific row isn't
  // meaningful — waits for the empty-state placeholder instead.
  async deleteAllSelected(timeout?: number): Promise<void> {
    await test.step('Delete all selected item(s) via the toolbar Delete icon', async () => {
      await this.click(this.deleteButton);
      await this.confirmDialog();
      await this.waitForVisible(this.fileListEmpty, timeout);
    });
  }
}
