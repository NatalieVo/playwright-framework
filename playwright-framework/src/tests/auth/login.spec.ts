import { test, expect } from '../../fixtures/base.fixture';

test.describe('Authentication — Login', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test('logs in successfully with valid credentials', async ({ page, loginPage }) => {
    await loginPage.login('u1', '111111Aa');

    await test.step('Verify successful login redirects to the FileManager page', async () => {
      await expect(page).toHaveURL(/FileManager/);
      await expect(page).toHaveTitle('CompleteFTP Files');
    });
  });

  test('login fails with wrong password', async ({ loginPage }) => {
    await loginPage.login('u1', 'WrongPass@999');

    const msg = await loginPage.getErrorMessage();
    await test.step('Verify an error message is shown when the password is wrong', async () => {
      expect(msg, 'Should show an error message when the password is wrong').toBe('Wrong user-name or password');
    });
  });

  test('login fails with wrong username', async ({ loginPage }) => {
    await loginPage.login('nonexistent_user_auto', '111111Aa');

    const msg = await loginPage.getErrorMessage();
    await test.step('Verify an error message is shown when the username does not exist', async () => {
      expect(msg, 'Should show an error message when the username does not exist').toBe('Wrong user-name or password');
    });
  });

  test('login fails when both fields are left empty', async ({ page, loginPage }) => {
    await loginPage.login('', '');

    await test.step('Verify login fails and stays on the Login page when both fields are empty', async () => {
      await expect(page).toHaveURL(/Login/);
    });
  });
});
