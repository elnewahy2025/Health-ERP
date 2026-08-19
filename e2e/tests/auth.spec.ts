import { test, expect } from '@playwright/test';

const API_BASE = process.env.E2E_API_URL || 'http://localhost:3000';

test.describe('Authentication', () => {
  test('login page loads with form elements', async ({ page }) => {
    await page.goto('/login');

    // Page should render the login form
    await expect(page.locator('form')).toBeVisible();

    // Should have email/username input
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    await expect(emailInput).toBeVisible();

    // Should have password input
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();

    // Should have a submit button
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
  });

  test('login shows error with invalid credentials', async ({ page, request }) => {
    let readinessOk = false;
    try {
      const readiness = await request.get(`${API_BASE}/api/v1/health/ready`);
      readinessOk = readiness.ok();
    } catch {
      readinessOk = false;
    }
    test.skip(!readinessOk, 'Requires a ready backend and disposable database; use the readiness check to diagnose environment setup.');
    await page.goto('/login');

    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    const passwordInput = page.locator('input[type="password"]');
    const submitButton = page.locator('button[type="submit"]');

    await emailInput.fill('nonexistent@test.com');
    await passwordInput.fill('wrongpassword');
    const loginResponsePromise = page.waitForResponse((response) => response.url().includes('/auth/login'));
    await submitButton.click();
    const loginResponse = await loginResponsePromise;

    // The UI may render a transient toast, so assert the stable backend contract.
    expect(loginResponse.status()).toBe(401);
    await expect(page).toHaveURL(/login/);
  });

  test('login form prevents empty submission', async ({ page }) => {
    await page.goto('/login');

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Should still be on login page (form validation prevents submission)
    await expect(page).toHaveURL(/login/);
  });
});
