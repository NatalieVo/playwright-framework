import { Page, test } from '@playwright/test';
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  private readonly usernameInput = this.page.locator('#username');
  private readonly passwordInput = this.page.locator('#password');
  private readonly loginButton = this.page.locator('button[type="submit"]');
  private readonly errorMessage = this.page.locator('.edtErrorMessage');

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.navigate('/Login/');
  }

  async login(username: string, password: string): Promise<void> {
    await test.step(`Log in with username "${username}" and masked password`, async () => {
      await this.fill(this.usernameInput, username);
      await this.fillSecret(this.passwordInput, password, 'password');
      await this.click(this.loginButton);
    });
  }

  async getErrorMessage(): Promise<string> {
    return test.step('Get login error message text', async () => this.getText(this.errorMessage));
  }

  async isErrorVisible(): Promise<boolean> {
    return test.step('Check if login error message is visible', async () => this.isVisible(this.errorMessage));
  }
}
