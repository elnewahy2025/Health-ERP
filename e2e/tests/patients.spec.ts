import { test, expect } from '@playwright/test';

test.describe('Patients Page', () => {
  test('unauthenticated user redirects to login', async ({ page }) => {
    await page.goto('/patients');
    // Should redirect to login when not authenticated
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });

  test('page has correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Vision Healthcare|Health Care/i);
  });

  test('navigation renders correctly', async ({ page }) => {
    await page.goto('/');
    // The app should render without crashing
    const root = page.locator('#root');
    await expect(root).toBeVisible();
    // Should have some content rendered
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Appointments Page', () => {
  test('unauthenticated user redirects to login', async ({ page }) => {
    await page.goto('/appointments');
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });
});
