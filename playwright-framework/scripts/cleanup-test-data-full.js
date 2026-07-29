const path = require('path');
const dotenv = require('dotenv');
const { chromium } = require('@playwright/test');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const BASE_URL = process.env.BASE_URL ?? 'https://localhost';
const USERNAME = process.env.APP_USERNAME ?? 'u1';
const PASSWORD = process.env.APP_PASSWORD ?? '111111Aa';

// Matches every naming convention used across specs via TestData.generateFileName/generateFolderName.
const TEST_DATA_PREFIX = /^(cftp_|auto_share)/i;

async function login(page) {
  await page.goto(`${BASE_URL}/FileManager/4/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(USERNAME);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForSelector('[data-testid="app-header"]', { state: 'visible', timeout: 30_000 });
  await page.waitForSelector('[data-testid="file-list-container"]', { state: 'visible', timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

async function goHome(page) {
  await page.goto(`${BASE_URL}/FileManager/4/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="file-list-container"]', { state: 'visible', timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

async function openShares(page) {
  await page.locator('[data-testid="file-name"]').filter({ hasText: /^Shares$/ }).dblclick();
  await page.waitForSelector('[data-testid="breadcrumb-current"]', { state: 'visible', timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  // Same client-side lag documented for context menus right after entering Shares — settle here too.
  await page.waitForTimeout(1_500);
}

async function listTestDataRows(page) {
  const names = await page.locator('[data-testid="file-name"]').allInnerTexts();
  return names.map((n) => n.trim()).filter((n) => TEST_DATA_PREFIX.test(n));
}

async function rightClickAction(page, name, action) {
  await page.locator('[data-testid="file-name"]').filter({ hasText: name }).click({ button: 'right' });
  await page.locator('div.context-menu[data-testid="context-menu"]').waitFor({ state: 'visible' });
  await page.getByTestId(`context-${action}`).click();
  await page.getByTestId('dialog-ok-button').click();
  await page.locator('[data-testid="file-name"]').filter({ hasText: name }).waitFor({ state: 'hidden', timeout: 15_000 });
}

async function cleanupPhase(page, label, action) {
  const targets = await listTestDataRows(page);
  console.log(`[${label}] Found ${targets.length} test-data item(s): ${targets.join(', ') || '(none)'}`);

  const deleted = [];
  const failed = [];
  for (const name of targets) {
    try {
      await rightClickAction(page, name, action);
      deleted.push(name);
      console.log(`[${label}] Removed: ${name}`);
    } catch (err) {
      failed.push(name);
      console.error(`[${label}] Failed to remove "${name}": ${err.message}`);
    }
  }

  const remaining = await listTestDataRows(page);
  if (remaining.length > 0) {
    console.warn(`[${label}] Still present after cleanup: ${remaining.join(', ')}`);
  }
  return { deleted, failed };
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const summary = { shares: { deleted: 0, failed: 0 }, home: { deleted: 0, failed: 0 } };

  try {
    await login(page);

    // Phase 1: unshare any leftover test items inside the Shares folder first — unsharing before
    // deleting the underlying file is the same order the suite's own cleanupFile() helper uses,
    // to avoid leaving an orphaned Share record behind (project_share_json_serialization_bug.md).
    await openShares(page);
    const sharesResult = await cleanupPhase(page, 'Shares', 'remove-share');
    summary.shares = { deleted: sharesResult.deleted.length, failed: sharesResult.failed.length };

    // Phase 2: delete any leftover test items (now unshared, or never shared) sitting at Home root.
    await goHome(page);
    const homeResult = await cleanupPhase(page, 'Home', 'delete');
    summary.home = { deleted: homeResult.deleted.length, failed: homeResult.failed.length };
  } finally {
    await browser.close();
  }

  console.log(
    `\nCleanup summary — Shares: deleted ${summary.shares.deleted}, failed ${summary.shares.failed} | ` +
      `Home: deleted ${summary.home.deleted}, failed ${summary.home.failed}`,
  );
  if (summary.shares.failed > 0 || summary.home.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
