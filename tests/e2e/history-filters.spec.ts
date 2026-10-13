import { expect, test, type Page } from '@playwright/test';

const today = '2026-10-13';
const products = [
  { id: 1, name: 'Nasi Bakar', businessType: 'Makanan', sellingPrice: 18000, stock: 0, minStock: 0, needsRecipe: true },
  { id: 2, name: 'Sate Jamur', businessType: 'Makanan', sellingPrice: 12000, stock: 0, minStock: 0, needsRecipe: true },
];
const batches = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, batchNumber: `P-202610${String(index + 1).padStart(2, '0')}`, date: `2026-10-${String(index + 1).padStart(2, '0')}`, targetQty: 5, actualQty: 4.8, totalCost: 24000, unitCost: 5000, yieldPercentage: 96, status: 'completed' }));
const preps = Array.from({ length: 14 }, (_, index) => ({ id: index + 1, name: `Prep ${String(index + 1).padStart(2, '0')}`, unit: 'kg', yieldQty: 5, stock: index % 3 === 0 ? 0 : index % 3 === 1 ? 1 : 6, averageCost: 5000, active: true, recipe: [], products: [], batches: index === 0 ? batches : [] }));
const sales = Array.from({ length: 7 }, (_, index) => ({ id: index + 1, date: `2026-10-${String(index + 5).padStart(2, '0')}`, totalRevenue: 18000, totalCostOfGoodsSold: 9000, grossProfit: 9000, items: [{ productId: index % 2 + 1, productName: index % 2 ? 'Sate Jamur' : 'Nasi Bakar', quantity: 1, unitPrice: 18000, revenue: 18000, costOfGoodsSold: 9000 }] }));

async function mockAdmin(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('kasapink_auth', 'true');
    localStorage.setItem('kasapink_user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }));
    localStorage.setItem('kasapink_last_activity', String(Date.now()));
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown = {};
    if (path === '/api/me') body = { user: { id: 1, username: 'admin', role: 'admin' } };
    else if (path === '/api/setup/status') body = { needsAdmin: false };
    else if (path === '/api/erp/preparations') body = preps;
    else if (path === '/api/erp/state') body = { ingredients: [], products, recipes: [], preparations: preps, recentPurchases: [], recentSales: sales, today: { date: today, revenue: 0, costOfGoodsSold: 0, purchases: 0, grossProfit: 0 }, lowStockCount: 0 };
    else if (path === '/api/erp/sales') {
      const productId = Number(url.searchParams.get('productId')) || null;
      const startDate = url.searchParams.get('startDate') || '2000-01-01';
      const endDate = url.searchParams.get('endDate') || today;
      const filtered = sales.filter((sale) => sale.date >= startDate && sale.date <= endDate && (!productId || sale.items.some((item) => item.productId === productId)));
      const offset = Number(url.searchParams.get('offset') || 0);
      const limit = Number(url.searchParams.get('limit') || 5);
      body = { items: filtered.slice(offset, offset + limit), pagination: { total: filtered.length, limit, offset } };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test('prep list search, status filter and pagination work together', async ({ page }) => {
  await mockAdmin(page);
  await page.goto('/prep');
  await expect(page.locator('.prep-stock-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Halaman berikutnya' }).click();
  await expect(page.locator('.prep-stock-card')).toHaveCount(6);
  await page.getByLabel('Cari prep').fill('prep 14');
  await expect(page.locator('.prep-stock-card')).toHaveCount(1);
  await expect(page.locator('.prep-stock-card')).toContainText('Prep 14');
  await page.getByRole('button', { name: 'Reset filter' }).click();
  await page.getByLabel('Filter status stok prep').selectOption('out');
  await expect(page.locator('.prep-stock-card')).toHaveCount(5);
});

test('prep batch history uses date filters and five rows per page', async ({ page }) => {
  await mockAdmin(page);
  await page.goto('/prep');
  await page.getByRole('button', { name: 'Kelola Prep 01' }).click();
  await page.getByRole('tab', { name: 'Riwayat' }).click();
  await expect(page.locator('.prep-history-row')).toHaveCount(5);
  await page.getByLabel('Filter batch dari tanggal').fill('2026-10-09');
  await expect(page.locator('.prep-history-row')).toHaveCount(4);
  await expect(page.getByText('Menampilkan 1–4 dari 4 batch')).toBeVisible();
  await page.screenshot({ path: '/workspace/scratch/289ba8a70d16/previews/prep-history-desktop.png', fullPage: true });
});

test('sales history sends date and product filters to the API', async ({ page }) => {
  await mockAdmin(page);
  await page.goto('/penjualan');
  await expect(page.locator('.sales-history tbody tr')).toHaveCount(5);
  const filteredRequest = page.waitForRequest((request) => request.url().includes('/api/erp/sales') && request.url().includes('productId=2'));
  await page.getByLabel('Filter riwayat berdasarkan produk').selectOption('2');
  expect(new URL((await filteredRequest).url()).searchParams.get('productId')).toBe('2');
  await expect(page.locator('.sales-history tbody tr')).toHaveCount(3);
  await page.getByLabel('Filter penjualan dari tanggal').fill('2026-10-09');
  await expect(page.locator('.sales-history tbody tr')).toHaveCount(1);
});

for (const viewport of [{ name: 'mobile', width: 393, height: 852 }, { name: 'tablet', width: 820, height: 1180 }, { name: 'desktop', width: 1440, height: 1000 }]) {
  test(`new filters remain responsive at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockAdmin(page);
    for (const path of ['/prep', '/penjualan']) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${path} overflows`).toBe(true);
      await page.screenshot({ path: `/workspace/scratch/289ba8a70d16/previews/${path.slice(1)}-${viewport.name}.png`, fullPage: true });
    }
    if (viewport.name === 'mobile') {
      await page.goto('/prep');
      await page.getByRole('button', { name: 'Kelola Prep 01' }).click();
      await page.getByRole('tab', { name: 'Riwayat' }).click();
      await page.screenshot({ path: '/workspace/scratch/289ba8a70d16/previews/prep-history-mobile.png', fullPage: true });
    }
  });
}
