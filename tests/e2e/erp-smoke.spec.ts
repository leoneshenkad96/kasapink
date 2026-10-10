import { expect, test } from '@playwright/test';

const adminUsername = process.env.E2E_ADMIN_USERNAME ?? 'admin-local';
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'Kasapink-Local-2026!';

async function login(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('USERNAME').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe('Kasapink ERP browser smoke and roles', () => {
  test('admin can login, browse inventory, search and filter stock', async ({ page }) => {
    await login(page, adminUsername, adminPassword);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await page.goto('/stok/makanan');
    await expect(page.getByRole('heading', { name: 'Stok Bahan' })).toBeVisible();
    const search = page.getByTestId('input-search-ingredients');
    await search.fill('tepung');
    await expect(page.getByText(/\d+ bahan/).first()).toBeVisible();
    await page.getByRole('button', { name: /Stok menipis/ }).click();
    await expect(page.getByRole('button', { name: /Stok menipis/ })).toHaveAttribute('aria-pressed', 'true');
    const token = await page.evaluate(() => localStorage.getItem('kasapink_token'));
    expect(token).toBeNull();
  });

  test('testing role can read ERP but cannot access admin or mutate data', async ({ page, context }) => {
    await login(page, adminUsername, adminPassword);
    const username = `e2e-testing-${Date.now()}`;
    const createUser = await context.request.post('/api/users', {
      data: { username, password: 'Testing-password-123', role: 'testing' },
    });
    expect(createUser.ok()).toBeTruthy();
    await context.request.post('/api/logout');
    await context.clearCookies();
    await page.goto('/login');
    await login(page, username, 'Testing-password-123');
    await page.goto('/users');
    await expect(page.getByText('Akun testing hanya dapat melihat data.')).toBeVisible();
    await page.goto('/stok/makanan');
    await expect(page.getByTestId('input-search-ingredients')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tambah bahan' })).toHaveCount(0);
    const forbidden = await context.request.post('/api/erp/ingredients', {
      data: { name: 'E2E blocked', category: 'Makro', stockType: 'Makanan', unit: 'kg', stock: 0, minStock: 0, openingUnitCost: 1 },
    });
    expect(forbidden.status()).toBe(403);
  });
});
