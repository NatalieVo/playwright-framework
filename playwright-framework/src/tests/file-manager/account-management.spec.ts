import { test, expect } from '../../fixtures/auth.fixture';
import { FileManagerPage } from '../../pages/dashboard.page';
import { AccountPage } from '../../pages/account.page';
import { LoginPage } from '../../pages/login.page';
import { TestData } from '../../utils/test-data';
import { env } from '../../utils/env.config';

test.describe('FileManager — Account Management', () => {
  test('CFTP_ACCOUNT_TC_001 — change password successfully, then revert to the original', async ({
    authenticatedPage,
    browser,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);
    const account = new AccountPage(authenticatedPage);
    const tempPassword = `Temp_${TestData.currentTimestamp()}_Aa`;

    await fm.goToManageAccount();
    await account.goToChangePasswordForm();
    await account.fillChangePasswordForm(env.PASSWORD, tempPassword);
    await account.submitChangePassword();
    await test.step('Verify a successful password change redirects back to FileManager', async () => {
      await expect(
        authenticatedPage,
        'A successful password change must redirect back to FileManager',
      ).toHaveURL(/FileManager/);
    });

    // u1/111111Aa is the shared credential for every other spec in this suite — revert immediately
    await fm.goToManageAccount();
    await account.goToChangePasswordForm();
    await account.fillChangePasswordForm(tempPassword, env.PASSWORD);
    await account.submitChangePassword();
    await test.step('Verify reverting to the original password also redirects back to FileManager', async () => {
      await expect(
        authenticatedPage,
        'Reverting to the original password must also redirect back to FileManager',
      ).toHaveURL(/FileManager/);
    });

    // Safety check: confirm a brand-new session can still log in with the original credentials
    const verifyContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const verifyPage = await verifyContext.newPage();
    const verifyLogin = new LoginPage(verifyPage);
    await verifyPage.goto('/FileManager/4/', { waitUntil: 'domcontentloaded' });
    await verifyLogin.login(env.USERNAME, env.PASSWORD);
    await test.step('Verify the original credentials still work for other tests after reverting', async () => {
      await expect(
        verifyPage.getByTestId('app-header'),
        'The original credentials must still work for other tests after reverting',
      ).toBeVisible({ timeout: 15_000 });
    });
    await verifyContext.close();
  });

  test('CFTP_ACCOUNT_TC_002 — cancel changing password does not change it', async ({ authenticatedPage }) => {
    const fm = new FileManagerPage(authenticatedPage);
    const account = new AccountPage(authenticatedPage);

    await fm.goToManageAccount();
    await account.goToChangePasswordForm();
    await account.fillChangePasswordForm(env.PASSWORD, 'AttemptedNew@123');
    await account.cancelChangePassword();

    await test.step('Verify back to menu returns to the Account Management page without submitting the change', async () => {
      await expect(
        authenticatedPage,
        'Back to menu must return to the Account Management page without submitting the change',
      ).toHaveURL(/Account/);
    });
  });

  test('CFTP_ACCOUNT_TC_003 — shows an error when the new password violates the password policy', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);
    const account = new AccountPage(authenticatedPage);

    await fm.goToManageAccount();
    await account.goToChangePasswordForm();
    await account.fillChangePasswordForm(env.PASSWORD, '123');
    await account.submitChangePassword();

    await test.step('Verify an error is shown when the new password violates the password policy', async () => {
      expect(
        await account.getErrorMessage(),
        'An error must be shown when the new password violates the password policy',
      ).toContain('must be at least 8 characters');
    });
  });

  test('CFTP_ACCOUNT_TC_004 — back to menu returns to the main Account Management page', async ({
    authenticatedPage,
  }) => {
    const fm = new FileManagerPage(authenticatedPage);
    const account = new AccountPage(authenticatedPage);

    await fm.goToManageAccount();
    await account.goToChangePasswordForm();
    await account.cancelChangePassword();

    await test.step('Verify back to menu lands on the Account Management main page', async () => {
      await expect(
        authenticatedPage.getByText('Account Management', { exact: false }),
        'Back to menu must land on the Account Management main page',
      ).toBeVisible();
    });
  });
});
