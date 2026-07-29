import { Page, Locator, Download, expect, test } from '@playwright/test';
import { BasePage } from './base.page';

export class FileListPage extends BasePage {
  private readonly uploadButton = this.page.getByTestId('upload-button');
  private readonly newFileButton = this.page.getByTestId('new-file-button');
  private readonly newFolderButton = this.page.getByTestId('new-folder-button');
  private readonly pasteButton = this.page.getByTestId('paste-button');
  private readonly upButton = this.page.getByTestId('nav-up-button');

  private readonly dialogTitle = this.page.getByTestId('dialog-title');
  private readonly dialogMessage = this.page.getByTestId('dialog-message');
  private readonly dialogInput = this.page.getByTestId('dialog-input');
  private readonly dialogOkButton = this.page.getByTestId('dialog-ok-button');
  private readonly dialogCancelButton = this.page.getByTestId('dialog-cancel-button');

  private readonly shareDialogLink = this.page.getByTestId('share-row-0').locator('.share-dialog-filename');
  private readonly shareResultRows = this.page.locator('[data-testid^="share-row-"]');
  private readonly shareDialogOkButton = this.page.getByTestId('share-dialog-ok');

  private readonly overwriteDialogMessage = this.page.locator('[data-testid="overwrite-confirm-dialog"] .share-dialog-message');
  private readonly overwriteDialogOkButton = this.page.getByTestId('overwrite-dialog-ok');
  private readonly overwriteDialogCancelButton = this.page.getByTestId('overwrite-dialog-cancel');

  private readonly previewTitle = this.page.getByTestId('preview-title');
  private readonly previewTextarea = this.page.getByTestId('preview-text-textarea');
  private readonly previewSaveButton = this.page.getByTestId('preview-save-btn');
  private readonly previewCloseButton = this.page.getByTestId('preview-close-btn');
  private readonly previewDiscardButton = this.page.getByTestId('preview-discard-btn');

  private readonly fileListContainer = this.page.getByTestId('file-list-container');
  private readonly selectAllCheckbox = this.page.getByTestId('select-all-checkbox');
  private readonly toolbarDeleteButton = this.page.getByTestId('delete-button');
  private readonly breadcrumbCurrent = this.page.getByTestId('breadcrumb-current');
  private readonly fileRows = this.page.getByTestId('file-row');

  constructor(page: Page) {
    super(page);
  }

  fileRow(name: string): Locator {
    return this.page.locator('[data-testid="file-name"]').filter({ hasText: name });
  }

  async uploadFile(filePath: string, fileName: string): Promise<void> {
    await test.step(`Upload file "${fileName}" (source: "${filePath}")`, async () => {
      const [chooser] = await Promise.all([
        this.page.waitForEvent('filechooser'),
        this.uploadButton.click(),
      ]);
      await chooser.setFiles(filePath);
      await this.waitForVisible(this.fileRow(fileName), 15_000);
    });
  }

  async openContextMenu(fileName: string): Promise<void> {
    await test.step(`Right-click file row "${fileName}" to open the context menu`, async () => {
      await this.fileRow(fileName).click({ button: 'right' });
      await this.waitForVisible(this.page.locator('div.context-menu[data-testid="context-menu"]'));
    });
  }

  private contextAction(action: string): Locator {
    return this.page.getByTestId(`context-${action}`);
  }

  // Retries the right-click + menu-item click as one unit: in a long file list, an occasional
  // right-click doesn't render the expected action in time (or lands while a prior menu is
  // still closing) — pressing Escape and retrying clears that instead of failing the test.
  // Escape is only pressed BETWEEN retries (never before the first attempt) — pressing it
  // upfront deselects any multi-select checkboxes the caller relies on (regressed every
  // multi-select spec until caught: Escape clears the whole "N items selected" state).
  async selectContextAction(fileName: string, action: string): Promise<void> {
    await test.step(`Select context menu action "${action}" for file "${fileName}"`, async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) {
          await this.page.keyboard.press('Escape').catch(() => undefined);
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
        try {
          await this.openContextMenu(fileName);
          await this.click(this.contextAction(action));
          return;
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError;
    });
  }

  async isFileVisible(fileName: string): Promise<boolean> {
    return test.step(`Check if file "${fileName}" is visible in the list`, async () => this.isVisible(this.fileRow(fileName)));
  }

  // Checks every row currently in the list. Verify the item names first (e.g. against a known
  // safe prefix) before calling this — it has no built-in filtering, so it will select whatever
  // is on screen, real data included.
  async selectAllVisible(): Promise<void> {
    await test.step('Select all visible items via the header "select all" checkbox', async () => {
      await this.click(this.selectAllCheckbox);
    });
  }

  private fileRowContainer(name: string): Locator {
    return this.fileRows.filter({ hasText: name });
  }

  async deselectFile(fileName: string): Promise<void> {
    await test.step(`Deselect file "${fileName}" via its row checkbox`, async () => {
      await this.fileRowContainer(fileName).getByTestId('row-checkbox').uncheck();
    });
  }

  // Verified live: the Shares pseudo-folder row's Delete action is disabled both on the toolbar
  // (isDeleteDisabled()) and in this per-row context menu — check both when testing "Shares can't
  // be deleted". Closes the menu afterward so the caller's page state is unaffected either way.
  async isContextActionDisabled(fileName: string, action: string): Promise<boolean> {
    return test.step(`Check if context menu action "${action}" is disabled for file "${fileName}"`, async () => {
      await this.openContextMenu(fileName);
      const disabled = await this.contextAction(action).isDisabled();
      await this.page.keyboard.press('Escape');
      return disabled;
    });
  }

  async deleteAllSelected(): Promise<void> {
    await test.step('Delete all selected items via the toolbar Delete icon', async () => {
      await this.click(this.toolbarDeleteButton);
      await this.confirmDialog();
      // confirmDialog() only clicks OK — its overlay can still be closing/present for a moment
      // after that, which blocks the very next action (e.g. another round's select-all checkbox
      // click) with "dialog-overlay intercepts pointer events". Wait for it to actually be gone.
      await this.waitForHidden(this.page.getByTestId('dialog-overlay'), 10_000).catch(() => undefined);
    });
  }

  async getAllItemNames(): Promise<string[]> {
    return test.step('Get all item names currently in the list', async () =>
      this.page.locator('[data-testid="file-name"]').allInnerTexts(),
    );
  }

  async waitForLoaded(): Promise<void> {
    await test.step('Wait for the file list container to be visible (page loaded)', async () => {
      await this.waitForVisible(this.fileListContainer);
    });
  }

  // --- Right-click on empty page area (New File / New Folder / Paste) ---
  async openEmptyAreaContextMenu(): Promise<void> {
    await test.step('Right-click an empty area of the file list to open the context menu', async () => {
      await this.waitForLoaded();
      const box = await this.fileListContainer.boundingBox();
      if (!box) {
        throw new Error('file-list-container not found — cannot right-click an empty area');
      }
      await this.page.mouse.click(box.x + box.width / 2, box.y + box.height - 20, { button: 'right' });
      await this.waitForVisible(this.page.locator('div.context-menu[data-testid="context-menu"]'));
    });
  }

  async selectEmptyAreaContextAction(action: string): Promise<void> {
    await test.step(`Select empty-area context menu action "${action}"`, async () => {
      await this.openEmptyAreaContextMenu();
      await this.click(this.contextAction(action));
    });
  }

  async getDialogInputValue(): Promise<string> {
    return test.step('Get dialog input value', async () => this.dialogInput.inputValue());
  }

  async createNewFileFromEmptyArea(name: string): Promise<void> {
    await test.step(`Create new file with name "${name}" via right-click on empty area`, async () => {
      await this.selectEmptyAreaContextAction('new-file');
      await this.fillDialogInput(name);
      await this.confirmDialog();
      await this.waitForVisible(this.fileRow(name), 15_000);
    });
  }

  async createNewFileWithDefaultNameFromEmptyArea(): Promise<string> {
    return test.step('Create new file with the default name via right-click on empty area', async () => {
      await this.selectEmptyAreaContextAction('new-file');
      const defaultName = await this.getDialogInputValue();
      await this.confirmDialog();
      await this.waitForVisible(this.fileRow(defaultName), 15_000);
      return defaultName;
    });
  }

  async cancelNewFileFromEmptyArea(name: string): Promise<void> {
    await test.step(`Cancel creating new file with attempted name "${name}" via right-click on empty area`, async () => {
      await this.selectEmptyAreaContextAction('new-file');
      await this.fillDialogInput(name);
      await this.cancelDialog();
    });
  }

  async createNewFolderWithDefaultNameFromEmptyArea(): Promise<string> {
    return test.step('Create new folder with the default name via right-click on empty area', async () => {
      await this.selectEmptyAreaContextAction('new-folder');
      const defaultName = await this.getDialogInputValue();
      await this.confirmDialog();
      await this.waitForVisible(this.fileRow(defaultName), 15_000);
      return defaultName;
    });
  }

  async cancelNewFolderFromEmptyArea(): Promise<void> {
    await test.step('Cancel creating new folder via right-click on empty area', async () => {
      await this.selectEmptyAreaContextAction('new-folder');
      await this.cancelDialog();
    });
  }

  async isEmptyAreaPasteDisabled(): Promise<boolean> {
    return test.step('Check if Paste is disabled in the empty-area context menu', async () => {
      await this.openEmptyAreaContextMenu();
      const disabled = await this.contextAction('paste').isDisabled();
      await this.page.keyboard.press('Escape');
      return disabled;
    });
  }

  async pasteFromEmptyArea(): Promise<void> {
    await test.step('Paste via right-click on empty area', async () => {
      await this.selectEmptyAreaContextAction('paste');
    });
  }

  // --- Generic dialog (Rename / Delete / Share password / Error) ---
  async getDialogTitle(): Promise<string> {
    return test.step('Get dialog title text', async () => this.getText(this.dialogTitle));
  }

  async getDialogMessage(): Promise<string> {
    return test.step('Get dialog message text', async () => this.getText(this.dialogMessage));
  }

  async fillDialogInput(value: string): Promise<void> {
    await test.step(`Fill dialog input with value "${value}"`, async () => {
      await this.fill(this.dialogInput, value);
    });
  }

  // Same as fillDialogInput(), but masks the value in the step title — use for passwords so
  // credentials don't end up in a published Allure report.
  async fillDialogInputSecret(value: string, label: string = 'secret value'): Promise<void> {
    await test.step(`Fill dialog input with ${label} (value masked for security)`, async () => {
      await this.fillSecret(this.dialogInput, value, label);
    });
  }

  async confirmDialog(): Promise<void> {
    await test.step('Confirm the dialog (click OK)', async () => {
      await this.click(this.dialogOkButton);
    });
  }

  async cancelDialog(): Promise<void> {
    await test.step('Cancel the dialog', async () => {
      await this.click(this.dialogCancelButton);
    });
  }

  // --- Rename ---
  async renameFile(fileName: string, newName: string): Promise<void> {
    await test.step(`Rename file "${fileName}" to "${newName}" via context menu`, async () => {
      await this.selectContextAction(fileName, 'rename');
      await this.fillDialogInput(newName);
      await this.confirmDialog();
      await this.waitForVisible(this.fileRow(newName));
    });
  }

  async cancelRename(fileName: string, attemptedName: string): Promise<void> {
    await test.step(`Cancel renaming file "${fileName}" (attempted name "${attemptedName}")`, async () => {
      await this.selectContextAction(fileName, 'rename');
      await this.fillDialogInput(attemptedName);
      await this.cancelDialog();
    });
  }

  // --- Delete ---
  async deleteFile(fileName: string): Promise<void> {
    await test.step(`Delete file "${fileName}" via context menu`, async () => {
      await this.selectContextAction(fileName, 'delete');
      await this.confirmDialog();
      await this.waitForHidden(this.fileRow(fileName));
    });
  }

  async cancelDeleteFile(fileName: string): Promise<void> {
    await test.step(`Cancel deleting file "${fileName}" via context menu`, async () => {
      await this.selectContextAction(fileName, 'delete');
      await this.cancelDialog();
    });
  }

  // --- Cut / Copy / Paste (Move & Copy equivalent) ---
  async cutFile(fileName: string): Promise<void> {
    await test.step(`Cut file "${fileName}" via context menu`, async () => {
      await this.selectContextAction(fileName, 'cut');
    });
  }

  async copyFile(fileName: string): Promise<void> {
    await test.step(`Copy file "${fileName}" via context menu`, async () => {
      await this.selectContextAction(fileName, 'copy');
    });
  }

  async pasteHere(): Promise<void> {
    await test.step('Paste into the current folder via the toolbar Paste icon', async () => {
      await this.click(this.pasteButton);
    });
  }

  async openFolder(folderName: string): Promise<void> {
    await test.step(`Open folder "${folderName}" by double-click`, async () => {
      await this.fileRow(folderName).dblclick();
      await this.waitForHidden(this.upButton, 5_000).catch(() => undefined);
      await this.waitForVisible(this.upButton, 5_000);
    });
  }

  async openFolderViaContextMenu(folderName: string): Promise<void> {
    await test.step(`Open folder "${folderName}" via context menu "Open"`, async () => {
      await this.selectContextAction(folderName, 'open');
      await this.waitForHidden(this.upButton, 5_000).catch(() => undefined);
      await this.waitForVisible(this.upButton, 5_000);
    });
  }

  async navigateUp(): Promise<void> {
    await test.step('Navigate up one folder level', async () => {
      await this.click(this.upButton);
    });
  }

  // The Up button's disabled state reflects the app's actual resolved current-folder state (it's
  // only disabled at Home root — verified real behavior), unlike breadcrumb text which can update
  // optimistically before the folder listing itself has finished refreshing. Use this after
  // navigateUp() when the very next action (e.g. createFolder) depends on truly being at Home —
  // a plain navigateUp() alone can leave the next action racing the listing refresh.
  async waitUntilAtHomeRoot(): Promise<void> {
    await test.step('Wait until back at Home root (Up button becomes disabled)', async () => {
      await expect(this.upButton, 'Up button must become disabled once back at Home root').toBeDisabled({
        timeout: 10_000,
      });
    });
  }

  async createFolder(name: string): Promise<void> {
    await test.step(`Create folder "${name}" via the toolbar New Folder icon`, async () => {
      await this.click(this.newFolderButton);
      await this.fillDialogInput(name);
      await this.confirmDialog();
      await this.waitForVisible(this.fileRow(name), 15_000);
    });
  }

  async createFile(name: string): Promise<void> {
    await test.step(`Create file "${name}" via the toolbar New File icon`, async () => {
      await this.click(this.newFileButton);
      await this.fillDialogInput(name);
      await this.confirmDialog();
      await this.waitForVisible(this.fileRow(name), 15_000);
    });
  }

  // --- Open / Preview / Edit ---
  async openFile(fileName: string): Promise<void> {
    await test.step(`Open file "${fileName}" via context menu (preview)`, async () => {
      await this.selectContextAction(fileName, 'open');
      await this.waitForVisible(this.previewTitle);
    });
  }

  async doubleClickFile(fileName: string): Promise<void> {
    await test.step(`Open file "${fileName}" via double-click (preview)`, async () => {
      await this.fileRow(fileName).dblclick({ force: true });
      await this.waitForVisible(this.previewTitle);
    });
  }

  async getPreviewTitle(): Promise<string> {
    return test.step('Get preview modal title text', async () => this.getText(this.previewTitle));
  }

  async getPreviewContent(): Promise<string> {
    return test.step('Get preview textarea content', async () => this.previewTextarea.inputValue());
  }

  async setPreviewContent(content: string): Promise<void> {
    await test.step(`Set preview textarea content to "${content}"`, async () => {
      await this.fill(this.previewTextarea, content);
    });
  }

  async savePreview(): Promise<void> {
    await test.step('Save preview content', async () => {
      await this.click(this.previewSaveButton);
    });
  }

  async closePreview(): Promise<void> {
    await test.step('Close the preview modal', async () => {
      await this.click(this.previewCloseButton);
      if (await this.previewDiscardButton.isVisible()) {
        await this.click(this.previewDiscardButton);
      }
    });
  }

  // --- Download ---
  async downloadFile(fileName: string): Promise<Download> {
    return test.step(`Download file "${fileName}" via context menu`, async () => {
      const [download] = await Promise.all([
        this.page.waitForEvent('download', (d) => d.suggestedFilename() === fileName),
        this.selectContextAction(fileName, 'download'),
      ]);
      return download;
    });
  }

  async downloadFolderAsZip(folderName: string): Promise<Download> {
    return test.step(`Download folder "${folderName}" as ZIP via context menu`, async () => {
      const zipName = `${folderName}.folder.zip`;
      const [download] = await Promise.all([
        this.page.waitForEvent('download', (d) => d.suggestedFilename() === zipName),
        this.selectContextAction(folderName, 'download'),
      ]);
      return download;
    });
  }

  // --- Multi-select (checkbox) actions — the context menu applies to every checked row ---
  async downloadSelection(anySelectedName: string, expectedCount: number, timeout: number = 15_000): Promise<Download[]> {
    return test.step(`Download selected items via context menu (anchor "${anySelectedName}", expecting >= ${expectedCount} download(s))`, async () => {
      const downloads: Download[] = [];
      const onDownload = (d: Download) => downloads.push(d);
      this.page.on('download', onDownload);
      await this.selectContextAction(anySelectedName, 'download');
      await expect.poll(() => downloads.length, { timeout }).toBeGreaterThanOrEqual(expectedCount);
      this.page.off('download', onDownload);
      return downloads;
    });
  }

  // --- Share (public) ---
  async shareFile(fileName: string): Promise<void> {
    await test.step(`Share file "${fileName}" publicly via context menu`, async () => {
      await this.selectContextAction(fileName, 'share');
    });
  }

  async getShareLink(): Promise<string> {
    return test.step('Get the generated share link', async () => {
      await this.waitForVisible(this.shareDialogLink);
      return (await this.shareDialogLink.getAttribute('title')) ?? '';
    });
  }

  async getShareResultCount(): Promise<number> {
    return test.step('Get share result row count', async () => {
      await this.waitForVisible(this.shareResultRows.first());
      return this.shareResultRows.count();
    });
  }

  async confirmShareDialog(): Promise<void> {
    await test.step('Confirm the share result dialog (click OK)', async () => {
      // General server latency can occasionally push the OK button past click()'s default 5s
      // implicit wait — wait on it explicitly first, with a longer budget.
      await this.shareDialogOkButton.waitFor({ state: 'visible', timeout: 60_000 });
      await this.click(this.shareDialogOkButton);
      await this.waitForHidden(this.page.getByTestId('share-result-dialog'), 5_000).catch(() => undefined);
    });
  }

  // --- Share (password) ---
  async shareWithPassword(fileName: string, password: string): Promise<void> {
    await test.step(`Share file "${fileName}" with a masked password via context menu`, async () => {
      await this.selectContextAction(fileName, 'share-password');
      // Opening this dialog first fetches the full Shares list server-side to resolve the file's
      // current share status — with a large accumulated Shares dataset that request alone can take
      // well past the default 5s (see project_shares_folder_scale_and_breadcrumb_fixes.md). Wait for
      // the input to actually exist before filling it, same as confirmShareDialog() already does for
      // the plain Share result dialog.
      await this.dialogInput.waitFor({ state: 'visible', timeout: 60_000 });
      await this.fillDialogInputSecret(password, 'share password');
      await this.confirmDialog();
    });
  }

  // --- Overwrite existing share confirmation ---
  async getOverwriteMessage(): Promise<string> {
    return test.step('Get overwrite-share confirmation message', async () => this.getText(this.overwriteDialogMessage));
  }

  async confirmOverwriteShare(): Promise<void> {
    await test.step('Confirm overwriting the existing share', async () => {
      await this.click(this.overwriteDialogOkButton);
    });
  }

  async cancelOverwriteShare(): Promise<void> {
    await test.step('Cancel overwriting the existing share', async () => {
      await this.click(this.overwriteDialogCancelButton);
    });
  }

  // --- Shares folder: right-click actions on already-shared files (Public / Password Protected / Stopped) ---
  private shareRow(fileName: string): Locator {
    return this.page.locator('tr').filter({ has: this.fileRow(fileName) });
  }

  // The status badge is styled with CSS text-transform: uppercase, so innerText() (which reflects
  // rendered casing) would return e.g. "PUBLIC" — toHaveText()/textContent() reflect the real value.
  // Prefer the *Locator() getters with expect(...).toHaveText() in tests — it auto-retries against
  // the SPA's re-render instead of racing a one-shot read.
  getShareStatusLocator(fileName: string): Locator {
    return this.shareRow(fileName).getByTestId('share-status');
  }

  async getShareStatus(fileName: string): Promise<string> {
    return test.step(`Get share status for file "${fileName}"`, async () => {
      const locator = this.getShareStatusLocator(fileName);
      await this.waitForVisible(locator);
      return ((await locator.textContent()) ?? '').trim();
    });
  }

  getShareExpiryLocator(fileName: string): Locator {
    return this.shareRow(fileName).getByTestId('share-expiry');
  }

  async getShareExpiry(fileName: string): Promise<string> {
    return test.step(`Get share expiry date for file "${fileName}"`, async () => this.getText(this.getShareExpiryLocator(fileName)));
  }

  // Dedicated exact-match navigation into the Shares folder — a plain openFolder('Shares') uses a
  // substring filter that can collide with disposable test file names containing "share" + a
  // capital letter (e.g. "auto_shareStopped_..." case-insensitively contains "shareS" = "shares").
  //
  // Verifies the breadcrumb actually reads "Shares" rather than just checking the Up button is
  // present — root-caused via trace inspection (see task.md): the Up button is visible both at
  // Home and inside Shares, so the old wait passed even when the double-click occasionally failed
  // to navigate at all, leaving every subsequent Shares-only context action ("stop-sharing",
  // "set-password", etc.) failing with "element not found" because the test was silently still on
  // the Home page. Retries the double-click itself if the breadcrumb doesn't update in time.
  async openSharesFolder(): Promise<void> {
    await test.step('Navigate into the Shares folder', async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          // Only click if not already inside Shares — a previous attempt's dblclick can succeed
          // while its breadcrumb check still times out (breadcrumb text lags real navigation after
          // a huge batch operation); retrying the click then hangs forever since there's no
          // "Shares" row to find once we're already inside it.
          const alreadyInShares = await this.breadcrumbCurrent
            .textContent()
            .then((t) => t === 'Shares')
            .catch(() => false);
          if (!alreadyInShares) {
            await this.page
              .locator('[data-testid="file-name"]')
              .filter({ hasText: /^Shares$/ })
              .dblclick({ timeout: 90_000 });
          }
          // The breadcrumb text itself can lag well behind the actual navigation after a huge
          // batch operation (10000-item share/upload) settles — give it real room.
          await expect(
            this.breadcrumbCurrent,
            'Breadcrumb must show "Shares" once navigation into the Shares folder completes',
          ).toHaveText('Shares', { timeout: 2 * 60 * 1000 });
          // The breadcrumb (and each row's Status column) updates from a different client-side data
          // source than the per-row "share capabilities" used to populate the context menu — verified
          // via screenshot across 3 separate failures: menu opened on the right row, Status already
          // read Public/Password Protected, yet the entire Share action group (Set Password, Copy
          // Link, Stop Sharing, Remove Share...) was simply absent from the menu. That second source
          // lags behind by a similar margin to the documented Share-record write contention
          // (project_share_json_serialization_bug.md) — settle here before any caller opens a context
          // menu on a row inside Shares. A fixed sleep here isn't reliable when the server is under
          // heavier contention (observed still failing after 1.5s during a long full-suite run), so
          // wait for the in-flight capabilities fetch to actually settle instead of guessing a
          // duration. selectContextAction()'s own Escape+reopen retry loop remains the second line of
          // defense for whatever lag still slips past this.
          await this.page.waitForLoadState('networkidle');
          return;
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError;
    });
  }

  async copyShareLink(fileName: string): Promise<void> {
    await test.step(`Copy share link for file "${fileName}" via context menu`, async () => {
      await this.selectContextAction(fileName, 'copy-link');
    });
  }

  async changeExpiry(fileName: string, dateYYYYMMDD: string): Promise<void> {
    await test.step(`Change share expiry date for file "${fileName}" to "${dateYYYYMMDD}"`, async () => {
      await this.selectContextAction(fileName, 'change-expiry');
      await this.fillDialogInput(dateYYYYMMDD);
      await this.confirmDialog();
    });
  }

  async cancelChangeExpiry(fileName: string, attemptedDateYYYYMMDD: string): Promise<void> {
    await test.step(`Cancel changing share expiry date for file "${fileName}" (attempted "${attemptedDateYYYYMMDD}")`, async () => {
      await this.selectContextAction(fileName, 'change-expiry');
      await this.fillDialogInput(attemptedDateYYYYMMDD);
      await this.cancelDialog();
    });
  }

  // Change Expiry on a mixed-status multi-select (e.g. one Public + one Stopped share) shows the
  // same "This will only apply to N of M selected shares. Continue?" intermediate confirmation as
  // Set Password, then narrows to the normal per-file expiry dialog for just the applicable share(s).
  async changeExpiryMixed(fileName: string, dateYYYYMMDD: string): Promise<void> {
    await test.step(`Change share expiry date to "${dateYYYYMMDD}" for a mixed-status multi-select (anchor "${fileName}")`, async () => {
      await this.selectContextAction(fileName, 'change-expiry');
      await this.confirmDialog();
      await this.fillDialogInput(dateYYYYMMDD);
      await this.confirmDialog();
    });
  }

  async cancelChangeExpiryMixed(fileName: string, attemptedDateYYYYMMDD: string): Promise<void> {
    await test.step(`Cancel changing share expiry date for a mixed-status multi-select (anchor "${fileName}", attempted "${attemptedDateYYYYMMDD}")`, async () => {
      await this.selectContextAction(fileName, 'change-expiry');
      await this.confirmDialog();
      await this.fillDialogInput(attemptedDateYYYYMMDD);
      await this.cancelDialog();
    });
  }

  // "Set Password" (Public file) and "Change Password" (Password Protected file) share the same context action
  async submitSharePassword(fileName: string, password: string): Promise<void> {
    await test.step(`Set a masked share password for file "${fileName}"`, async () => {
      await this.selectContextAction(fileName, 'set-password');
      await this.fillDialogInputSecret(password, 'share password');
      await this.confirmDialog();
    });
  }

  async cancelSharePassword(fileName: string, attemptedPassword: string): Promise<void> {
    await test.step(`Cancel setting a masked share password for file "${fileName}"`, async () => {
      await this.selectContextAction(fileName, 'set-password');
      await this.fillDialogInputSecret(attemptedPassword, 'attempted share password');
      await this.cancelDialog();
    });
  }

  // Set Password on a mixed-status multi-select (e.g. one Public + one Stopped share) shows an
  // extra confirmation first — a Stopped share can't have a password set directly, so the app
  // warns "This will only apply to N of M selected shares. Continue?" before narrowing to the
  // normal per-file password dialog for just the applicable share(s).
  async submitSharePasswordMixed(fileName: string, password: string): Promise<void> {
    await test.step(`Set a masked share password for a mixed-status multi-select (anchor "${fileName}")`, async () => {
      await this.selectContextAction(fileName, 'set-password');
      await this.confirmDialog();
      await this.fillDialogInputSecret(password, 'share password');
      await this.confirmDialog();
    });
  }

  async cancelSharePasswordMixed(fileName: string, attemptedPassword: string): Promise<void> {
    await test.step(`Cancel setting a masked share password for a mixed-status multi-select (anchor "${fileName}")`, async () => {
      await this.selectContextAction(fileName, 'set-password');
      await this.confirmDialog();
      await this.fillDialogInputSecret(attemptedPassword, 'attempted share password');
      await this.cancelDialog();
    });
  }

  async removeSharePassword(fileName: string): Promise<void> {
    await test.step(`Remove share password for file "${fileName}" via context menu`, async () => {
      await this.selectContextAction(fileName, 'remove-password');
      await this.confirmDialog();
    });
  }

  async cancelRemoveSharePassword(fileName: string): Promise<void> {
    await test.step(`Cancel removing share password for file "${fileName}"`, async () => {
      await this.selectContextAction(fileName, 'remove-password');
      await this.cancelDialog();
    });
  }

  async stopSharing(fileName: string): Promise<void> {
    await test.step(`Stop sharing file "${fileName}" via context menu`, async () => {
      await this.selectContextAction(fileName, 'stop-sharing');
      await this.confirmDialog();
    });
  }

  async cancelStopSharing(fileName: string): Promise<void> {
    await test.step(`Cancel stop-sharing file "${fileName}"`, async () => {
      await this.selectContextAction(fileName, 'stop-sharing');
      await this.cancelDialog();
    });
  }

  async restartSharing(fileName: string): Promise<void> {
    await test.step(`Restart sharing file "${fileName}" via context menu`, async () => {
      await this.selectContextAction(fileName, 'restart-sharing');
      await this.confirmDialog();
    });
  }

  async deleteShare(fileName: string): Promise<void> {
    await test.step(`Remove share record for file "${fileName}" via context menu`, async () => {
      await this.selectContextAction(fileName, 'remove-share');
      await this.confirmDialog();
      await this.waitForHidden(this.fileRow(fileName));
    });
  }

  async cancelDeleteShare(fileName: string): Promise<void> {
    await test.step(`Cancel removing share record for file "${fileName}"`, async () => {
      await this.selectContextAction(fileName, 'remove-share');
      await this.cancelDialog();
    });
  }
}
