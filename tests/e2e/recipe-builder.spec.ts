import { expect, test, type Page } from '@playwright/test';

const ingredients = Array.from({ length: 45 }, (_, i) => ({ id: i + 1, name: i ? `Bahan ${String(i).padStart(2, '0')} dengan nama panjang untuk pengujian responsif` : 'Bengkoang', category: 'Sayuran', stockType: 'Makanan', unit: i === 1 ? 'pack' : 'kg', stock: 12.5, minStock: 1, averageCost: 20000, lastPrice: 20000 }));
const products = [{ id: 1, name: 'Pangsit Ayam dengan nama produk yang panjang', businessType: 'Makanan', sellingPrice: 15000, needsRecipe: true, stock: 0, averageCost: 0 }];
const recipes = ingredients.slice(0, 30).map((item) => ({ productId: 1, ingredientId: item.id, ingredientName: item.name, ingredientUnit: item.unit, qtyRequired: 0.1, recipeUnit: item.unit }));
const prep = { id: 1, name: 'Ayam suwir dengan nama prep panjang', unit: 'kg', yieldQty: 5, stock: 8.7, averageCost: 3130.43, active: true, recipe: [], products: [], batches: [] };
const state = { ingredients, products, recipes, recentPurchases: [], recentSales: [], today: { date: '2026-10-11', revenue: 0, costOfGoodsSold: 0, purchases: 0, grossProfit: 0 }, lowStockCount: 0 };
async function session(page: Page) {
  await page.addInitScript(() => localStorage.setItem('kasapink_last_activity', String(Date.now())));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/me' ? { user: { id: 1, username: 'admin', role: 'admin' } }
      : path.endsWith('/state') ? state
      : path.endsWith('/products') ? { items: products, pagination: { total: 1, limit: 12, offset: 0 } }
      : path.endsWith('/ingredients') ? { items: ingredients, pagination: { total: 45, limit: 12, offset: 0 } }
      : path.endsWith('/sales') ? {items:[],pagination:{total:0,limit:12,offset:0}}
      : path.endsWith('/preparations') ? [prep]
      : path.includes('finance') ? { days: [], revenue: 0, costOfGoodsSold: 0, purchases: 0, grossProfit: 0 }
      : path.includes('health') ? { status: 'OK' } : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
  test(`populated workspace and recipe modal fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await session(page);
    for (const path of ['/', '/stok/makanan', '/stok/parfum', '/produk/makanan', '/produk/parfum', '/prep', '/belanja', '/penjualan', '/opname', '/laporan', '/kontrol-fnb', '/users']) {
      await page.goto(path); await expect(page.locator('.page-heading')).toBeVisible();
      await expect(page.locator('.loading-grid')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: `${path} at ${width}` }).toBeLessThanOrEqual(1);
    }
    await page.goto('/produk/makanan'); await page.getByRole('button', { name: 'Atur resep' }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
    await expect(dialog.locator('.recipe-draft-row')).toHaveCount(30);
    const box = await dialog.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(await dialog.locator('.modal-body').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await dialog.getByRole('button', { name: 'Simpan resep' }).scrollIntoViewIfNeeded();
    const save = await dialog.getByRole('button', { name: 'Simpan resep' }).boundingBox(); expect(save!.y + save!.height).toBeLessThanOrEqual(900);
    await dialog.getByRole('button', { name: 'Tutup', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}

test('builder searches, prevents duplicates, edits decimals, retains failed draft and sends one atomic payload', async ({ page }) => {
  await session(page); await page.goto('/produk/makanan'); await page.getByRole('button', { name: 'Atur resep' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Add Stok' }).fill('Bengko');
  await expect(dialog.getByRole('listbox').getByRole('option')).toHaveCount(1); await dialog.getByRole('listbox').getByRole('option').click();
  await dialog.getByLabel('Jumlah', { exact: true }).fill('0,25'); await dialog.getByRole('button', { name: 'Tambah ke resep' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Bahan sudah ada');
  await dialog.getByRole('button', { name: 'Batalkan isian bahan' }).click();
  await dialog.getByRole('button', { name: 'Edit Bengkoang', exact: true }).click();
  await dialog.getByLabel('Satuan pemakaian').selectOption('gram'); await dialog.getByLabel('Jumlah', { exact: true }).fill('250,5');
  await dialog.getByRole('button', { name: 'Terapkan perubahan' }).click(); await expect(dialog.locator('.recipe-draft-row').first()).toContainText('250,5 gram');
  await dialog.getByRole('button', { name: `Edit ${ingredients[1].name}`, exact: true }).click();
  await expect(dialog.getByLabel('Satuan pemakaian').locator('option')).toHaveText(['Pilih satuan', 'pack']);
  await dialog.getByRole('button', { name: 'Batalkan isian bahan' }).click();
  await dialog.getByRole('button', { name: `Hapus ${ingredients[2].name}`, exact: true }).click();
  page.once('dialog', d => d.dismiss()); await dialog.getByRole('button', { name: 'Tutup', exact: true }).click(); await expect(dialog).toBeVisible();
  let payload: any; let requests = 0;
  await page.route('**/api/erp/products/1/recipe', async route => { payload = route.request().postDataJSON(); requests++; await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Gagal uji simpan' }) }); });
  await dialog.getByRole('button', { name: 'Simpan resep' }).click(); await expect(dialog.locator('.form-error').last()).toBeVisible();
  expect(requests).toBe(1); expect(payload.items).toHaveLength(29); expect(payload.items[0]).toEqual({ ingredientId: 1, recipeUnit: 'gram', qtyRequired: 250.5 });
  await expect(dialog.locator('.recipe-draft-row')).toHaveCount(29);
  await page.route('**/api/erp/products/1/recipe', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  await dialog.getByRole('button', { name: 'Simpan resep' }).click(); await expect(dialog).toHaveCount(0);
});

test('unfinished inputs block save; pending save blocks repeated requests and dismissal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 460 }); await session(page);
  await page.goto('/produk/makanan'); await page.getByRole('button', { name: 'Atur resep' }).click();
  const dialog = page.getByRole('dialog');
  let count = 0; let release: () => void = () => {};
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/erp/products/1/recipe', async route => { count++; await hold; await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); });
  await dialog.getByRole('combobox', { name: 'Add Stok' }).fill('Bengko');
  await dialog.getByRole('button', { name: 'Simpan resep' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Tambahkan atau batalkan'); expect(count).toBe(0);
  await dialog.getByRole('button', { name: 'Batalkan isian bahan' }).click();
  await dialog.getByRole('button', { name: 'Simpan resep' }).click();
  await expect(dialog.getByRole('button', { name: 'Menyimpan…' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Tutup', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible(); expect(count).toBe(1);
  release(); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Atur resep' })).toBeFocused();
});

test('prep recipe uses the same searchable builder and compatible units', async ({ page }) => {
  await session(page); await page.goto('/prep');
  await page.getByRole('combobox', { name: 'Add Stok' }).fill('Bengko'); await page.getByRole('listbox').getByRole('option').click();
  await page.getByLabel('Satuan pemakaian').selectOption('gram'); await page.getByLabel('Jumlah', { exact: true }).fill('250');
  await page.getByRole('button', { name: 'Tambah ke resep' }).click();
  let payload: any;
  await page.route('**/api/erp/preparations/1/recipe', async route => { payload = route.request().postDataJSON(); await route.fulfill({status:200,contentType:'application/json',body:'[]'}); });
  await page.getByRole('button', { name: 'Simpan resep', exact: true }).click();
  await expect.poll(() => payload).toEqual({items:[{ingredientId:1,recipeUnit:'gram',qtyRequired:250}]});
});

test('background health update preserves edited recipe draft', async ({ page }, testInfo) => {
  await session(page);
  let release: () => void = () => {};
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/healthz', async route => { await hold; await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'OK'})}); });
  await page.goto('/produk/makanan'); await page.getByRole('button', { name: 'Atur resep' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Edit Bengkoang', exact: true }).click();
  await dialog.getByLabel('Jumlah', { exact: true }).fill('0,5'); await dialog.getByRole('button', { name: 'Terapkan perubahan' }).click();
  release();
  await expect(page.locator('.connection')).toHaveText('Tersambung');
  await expect(dialog).toBeVisible(); await expect(dialog.locator('.recipe-draft-row').first()).toContainText('0,5 kg');
  await page.screenshot({path: testInfo.outputPath('recipe-review.png')});
});
