const path = require('path');
const dotenv = require('dotenv');
const { chromium } = require('@playwright/test');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
const BASE_URL = process.env.BASE_URL ?? 'https://localhost';
const USERNAME = process.env.APP_USERNAME ?? 'u1';
const PASSWORD = process.env.APP_PASSWORD ?? '111111Aa';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/FileManager/4/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(USERNAME);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForSelector('[data-testid="file-list-container"]', { state: 'visible', timeout: 30000 });
  await page.waitForLoadState('networkidle');

  await page.locator('[data-testid="file-name"]').filter({ hasText: /^Shares$/ }).dblclick();
  await page.waitForSelector('[data-testid="breadcrumb-current"]', { state: 'visible' });
  await page.waitForLoadState('networkidle');

  const pattern = process.argv[2] ? new RegExp(process.argv[2]) : /^(cftp_|auto_share)/i;
  const names = await page.locator('[data-testid="file-name"]').allInnerTexts();
  const matches = names.map((n) => n.trim()).filter((n) => pattern.test(n));
  console.log(`Orphaned Share records matching ${pattern}:`, matches.length ? matches.join(', ') : '(none)');

  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
