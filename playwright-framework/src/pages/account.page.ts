import { Page, test } from '@playwright/test';
import { BasePage } from './base.page';

export class AccountPage extends BasePage {
  private readonly changePasswordLink = this.page.getByText('change password', { exact: false });
  private readonly currentPasswordInput = this.page.locator('#password');
  private readonly newPasswordInput = this.page.locator('#newPassword1');
  private readonly confirmPasswordInput = this.page.locator('#newPassword2');
  private readonly changePasswordButton = this.page.getByRole('button', { name: 'CHANGE PASSWORD' });
  private readonly backToMenuButton = this.page.getByRole('button', { name: 'BACK TO MENU' });
  private readonly errorMessage = this.page.locator('.edtErrorMessage');

  constructor(page: Page) {
    super(page);
  }

  async goToChangePasswordForm(): Promise<void> {
    await test.step('Open the Change Password form', async () => {
      await this.click(this.changePasswordLink);
      await this.waitForVisible(this.currentPasswordInput);
    });
  }

  async fillChangePasswordForm(currentPassword: string, newPassword: string): Promise<void> {
    await test.step('Fill Change Password form with masked current and new password values', async () => {
      await this.fillSecret(this.currentPasswordInput, currentPassword, 'current password');
      await this.fillSecret(this.newPasswordInput, newPassword, 'new password');
      await this.fillSecret(this.confirmPasswordInput, newPassword, 'confirm new password');
    });
  }

  async submitChangePassword(): Promise<void> {
    await test.step('Submit the Change Password form', async () => {
      await this.click(this.changePasswordButton);
    });
  }

  async cancelChangePassword(): Promise<void> {
    await test.step('Cancel the Change Password form and return to the account menu', async () => {
      await this.click(this.backToMenuButton);
    });
  }

  async getErrorMessage(): Promise<string> {
    return test.step('Get account error message text', async () => this.getText(this.errorMessage));
  }
}
