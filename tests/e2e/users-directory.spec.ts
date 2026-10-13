import { expect, test, type Page } from '@playwright/test';

async function mockUsers(page: Page, count = 14) {
  let users = Array.from({ length: count }, (_, index) => ({ id: index + 1, username: `user${String(index + 1).padStart(2, '0')}`, role: index % 3 === 0 ? 'admin' : index % 3 === 1 ? 'user' : 'testing', createdAt: `2026-10-${String(index + 1).padStart(2, '0')}T00:00:00Z` }));
  await page.addInitScript(() => {
    localStorage.setItem('kasapink_auth', 'true');
    localStorage.setItem('kasapink_user', JSON.stringify({ id: 1, username: 'user01', role: 'admin' }));
    localStorage.setItem('kasapink_last_activity', String(Date.now()));
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'DELETE') users = users.filter((user) => user.id !== Number(path.split('/').pop()));
    const body = path === '/api/me' ? { user: { id: 1, username: 'user01', role: 'admin' } } : path === '/api/setup/status' ? { needsAdmin: false } : path === '/api/users' ? users : path === '/api/erp/state' ? { ingredients: [], products: [], recipes: [], recentPurchases: [], recentSales: [], today: { date: '2026-10-13', revenue: 0, grossProfit: 0, purchases: 0, costOfGoodsSold: 0 } } : {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/users');
  await expect(page.getByRole('heading', { name: 'Daftar user' })).toBeVisible();
}

test('directory filters, sorting and page size operate on the full list', async ({ page }) => {
  await mockUsers(page);
  const rows = page.locator('.users-desktop tbody tr');
  await expect(rows).toHaveCount(10);
  await expect(page.getByRole('button', { name: 'Hapus user user01', exact: true }).filter({ visible: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Halaman berikutnya' }).click();
  await expect(rows).toHaveCount(4);
  await expect(page.locator('.users-pagination')).toContainText('11–14 dari 14');
  await page.getByLabel('Cari username').fill(' USER14 ');
  await expect(rows).toHaveCount(1);
  await expect(page.locator('.users-pagination')).toContainText('Halaman 1 / 1');
  await page.getByRole('button', { name: 'Reset filter' }).click();
  await page.getByLabel('Filter role').selectOption('testing');
  await expect(rows).toHaveCount(4);
  await page.getByLabel('Cari username').fill('missing');
  await expect(page.getByText('User tidak ditemukan', { exact: true })).toBeVisible();
  await expect(page.locator('.users-pagination')).toContainText('0–0 dari 0');
  await page.locator('.users-toolbar').getByRole('button', { name: 'Reset filter' }).click();
  await page.getByLabel('Urutkan user').selectOption('newest');
  await expect(rows.first()).toContainText('user14');
  await page.getByLabel('User per halaman').selectOption('25');
  await expect(rows).toHaveCount(14);
});

test('deleting the last item on a page returns to a valid page', async ({ page }) => {
  await mockUsers(page, 11);
  await page.getByRole('button', { name: 'Halaman berikutnya' }).click();
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('.users-desktop').getByRole('button', { name: 'Hapus user user11' }).click();
  await expect(page.locator('.users-desktop tbody tr')).toHaveCount(10);
  await expect(page.locator('.users-pagination')).toContainText('Halaman 1 / 1');
});

for (const width of [320, 393, 768, 1440]) {
  test(`directory fits ${width}px with accessible actions`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockUsers(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    const list = page.locator(width < 768 ? '.users-mobile' : '.users-desktop');
    await expect(list).toBeVisible();
    await expect(list.getByRole('button', { name: 'Edit user user02' })).toBeVisible();
    if (width < 768) {
      await expect(page.locator('.user-card')).toHaveCount(10);
      const box = await list.getByRole('button', { name: 'Edit user user02' }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
}
