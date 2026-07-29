const path = require('path');
const dotenv = require('dotenv');
const { chromium } = require('@playwright/test');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const BASE_URL = process.env.BASE_URL ?? 'https://localhost';
const USERNAME = process.env.APP_USERNAME ?? 'u1';
const PASSWORD = process.env.APP_PASSWORD ?? '111111Aa';

// Matches every naming convention used across specs via TestData.generateFileName/generateFolderName —
// most specs use 'cftp_*', but shared-folder-actions.spec.ts uses 'auto_share*'
const TEST_DATA_PREFIX = /^(cftp_|auto_share)/i;

async function login(page) {
  await page.goto(`${BASE_URL}/FileManager/4/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(USERNAME);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForSelector('[data-testid="app-header"]', { state: 'visible', timeout: 30_000 });
  // app-header renders before the file list finishes its async fetch — wait for the list itself
  await page.waitForSelector('[data-testid="file-list-container"]', { state: 'visible', timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

async function listTestDataRows(page) {
  const names = await page.locator('[data-testid="file-name"]').allInnerTexts();
  return names.map((n) => n.trim()).filter((n) => TEST_DATA_PREFIX.test(n));
}

async function deleteRow(page, name) {
  await page.locator('[data-testid="file-name"]').filter({ hasText: name }).click({ button: 'right' });
  await page.locator('div.context-menu[data-testid="context-menu"]').waitFor({ state: 'visible' });
  await page.getByTestId('context-delete').click();
  await page.getByTestId('dialog-ok-button').click();
  await page.locator('[data-testid="file-name"]').filter({ hasText: name }).waitFor({ state: 'hidden', timeout: 15_000 });
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const deleted = [];
  const failed = [];

  try {
    await login(page);

    const targets = await listTestDataRows(page);
    console.log(`Found ${targets.length} test-data item(s) at Home root: ${targets.join(', ') || '(none)'}`);

    for (const name of targets) {
      try {
        await deleteRow(page, name);
        deleted.push(name);
        console.log(`Deleted: ${name}`);
      } catch (err) {
        failed.push(name);
        console.error(`Failed to delete "${name}": ${err.message}`);
      }
    }

    const remaining = await listTestDataRows(page);
    if (remaining.length > 0) {
      console.warn(`Still present after cleanup: ${remaining.join(', ')}`);
    }
  } finally {
    await browser.close();
  }

  console.log(`\nCleanup summary — deleted: ${deleted.length}, failed: ${failed.length}`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
