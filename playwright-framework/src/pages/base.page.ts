import { Page, Locator, expect, test } from '@playwright/test';

export abstract class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async navigate(path: string = ''): Promise<void> {
    await test.step(`Navigate to URL "${path || '/'}"`, async () => {
      await this.page.goto(path);
      await this.page.waitForLoadState('domcontentloaded');
    });
  }

  async waitForPageLoad(): Promise<void> {
    await test.step('Wait for page network activity to become idle', async () => {
      await this.page.waitForLoadState('networkidle');
    });
  }

  async click(locator: Locator): Promise<void> {
    await test.step(`Click element ${locator}`, async () => {
      await expect(locator).toBeEnabled();
      await locator.click();
    });
  }

  async fill(locator: Locator, value: string): Promise<void> {
    await test.step(`Fill element ${locator} with value "${value}"`, async () => {
      await expect(locator).toBeEditable();
      await locator.clear();
      await locator.fill(value);
    });
  }

  // Same as fill(), but never renders the raw value into the step title — use for passwords so
  // credentials don't end up in a published Allure report (e.g. the GitHub Pages history).
  async fillSecret(locator: Locator, value: string, label: string = 'secret value'): Promise<void> {
    await test.step(`Fill element ${locator} with ${label} (value masked for security)`, async () => {
      await expect(locator).toBeEditable();
      await locator.clear();
      await locator.fill(value);
    });
  }

  async getText(locator: Locator): Promise<string> {
    return test.step(`Get text content of element ${locator}`, async () => {
      await expect(locator).toBeVisible();
      return locator.innerText();
    });
  }

  async isVisible(locator: Locator): Promise<boolean> {
    return locator.isVisible();
  }

  async waitForVisible(locator: Locator, timeout?: number): Promise<void> {
    await test.step(`Wait for element ${locator} to be visible${timeout ? ` (timeout ${timeout}ms)` : ''}`, async () => {
      await expect(locator).toBeVisible({ timeout });
    });
  }

  async waitForHidden(locator: Locator, timeout?: number): Promise<void> {
    await test.step(`Wait for element ${locator} to be hidden${timeout ? ` (timeout ${timeout}ms)` : ''}`, async () => {
      await expect(locator).toBeHidden({ timeout });
    });
  }

  async selectOption(locator: Locator, value: string): Promise<void> {
    await test.step(`Select option "${value}" on element ${locator}`, async () => {
      await expect(locator).toBeEnabled();
      await locator.selectOption(value);
    });
  }

  async getTitle(): Promise<string> {
    return this.page.title();
  }

  async getCurrentUrl(): Promise<string> {
    return this.page.url();
  }
}
