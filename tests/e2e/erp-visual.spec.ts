import { expect, test } from '@playwright/test';

const adminUsername = process.env.E2E_ADMIN_USERNAME ?? 'admin-local';
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'Kasapink-Local-2026!';

test.describe('Kasapink ERP visual palette smoke', () => {
  test('login, dashboard, and inventory keep the approved composition', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveScreenshot('login.png', { animations: 'disabled' });

    await page.getByLabel('USERNAME').fill(adminUsername);
    await page.locator('input[autocomplete="current-password"]').fill(adminPassword);
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page).toHaveScreenshot('dashboard.png', { animations: 'disabled' });

    await page.goto('/stok/makanan');
    await expect(page.getByRole('heading', { name: 'Stok Bahan' })).toBeVisible();
    await expect(page).toHaveScreenshot('inventory.png', { animations: 'disabled' });
  });
});
