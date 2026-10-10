import { expect, test, type Page } from '@playwright/test';

const state = {
  ingredients: [], products: [], recipes: [], preparations: [],
  recentPurchases: [], recentSales: [], purchases: [], sales: [],
  preparationStockMovements: [], stockMovements: [], waste: [], operatingExpenses: [],
  auditLogs: [], recipeVersions: [],
  today: { date: '2026-10-10', revenue: 0, costOfGoodsSold: 0, purchases: 0, grossProfit: 0 },
  lowStockCount: 0,
};

async function mockAdminSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('kasapink_auth', 'true');
    localStorage.setItem('kasapink_user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }));
    localStorage.setItem('kasapink_last_activity', String(Date.now()));
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/me'
      ? { user: { id: 1, username: 'admin', role: 'admin' } }
      : path === '/api/setup/status'
        ? { needsAdmin: false, setupEnabled: false }
        : path.includes('finance')
          ? { startDate: '2026-10-01', endDate: '2026-10-10', revenue: 0, costOfGoodsSold: 0, purchases: 0, grossProfit: 0, days: [] }
          : path.includes('/erp/state')
            ? state
            : path.includes('health')
              ? { status: 'OK' }
              : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

for (const viewport of [
  { name: 'desktop-1440', width: 1440, height: 1000 },
  { name: 'desktop-1024', width: 1024, height: 900 },
  { name: 'iphone-16-pro', width: 393, height: 852 },
]) {
  test(`report export controls remain visible at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockAdminSession(page);
    await page.goto('/laporan');

    for (const label of ['CSV', 'Excel', 'PDF', 'Backup JSON']) {
      const button = page.getByRole('button', { name: label });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    }

    await expect(page.getByLabel('Jenis laporan export')).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);
  });
}
