import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('F&B report uses immutable business snapshots and revenue-based shared costs', async t => {
  const pg = new PGlite();
  await pg.waitReady;
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-fnb-test-secret-with-at-least-32-characters';
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await pg.close();
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    delete globalThis.__fnbTestPg;
  });

  const apply = async filename => {
    let sql = await readFile(filename, 'utf8');
    if (sql.includes('/*')) sql = sql.replace(/^.*?\/\*\r?\n/s, '').replace(/\r?\n\*\/\s*$/s, '\n');
    await pg.exec(sql.replaceAll('--> statement-breakpoint', ''));
  };
  await apply(path.join(root, 'lib/db/drizzle/0000_pink_deathstrike.sql'));
  const migrations = (await readdir(path.join(root, 'lib/db/migrations'))).filter(name => name.endsWith('.sql')).sort();
  for (const name of migrations.filter(name => name !== '0021_business_line_snapshots.sql')) {
    await apply(path.join(root, 'lib/db/migrations', name));
  }

  // Verify the migration's documented best-effort policy for historical data.
  await pg.exec(`
    INSERT INTO erp_products (name,selling_price,business_type,needs_recipe,stock,average_cost)
    VALUES ('Historical perfume',100,'Parfum',false,1,20);
    INSERT INTO erp_sales (date,total_revenue,total_cost_of_goods_sold) VALUES ('2026-10-01',100,20);
    INSERT INTO erp_sales_details (sales_id,product_id,product_name,quantity,unit_price,revenue,cost_of_goods_sold)
    VALUES (1,1,'Historical perfume',1,100,100,20);
    INSERT INTO erp_operating_expenses (date,category,description,amount)
    VALUES ('2026-10-01','Lainnya','Historical unknown owner',50);
  `);
  await apply(path.join(root, 'lib/db/migrations/0021_business_line_snapshots.sql'));
  assert.equal((await pg.query('SELECT business_type FROM erp_sales_details WHERE id=1')).rows[0].business_type, 'Parfum');
  assert.equal((await pg.query('SELECT business_type FROM erp_operating_expenses WHERE id=1')).rows[0].business_type, 'Bersama');
  await pg.exec('TRUNCATE erp_sales_details, erp_sales, erp_operating_expenses, erp_products RESTART IDENTITY CASCADE');

  globalThis.__fnbTestPg = pg;
  const compiled = await build({
    stdin: { contents: `export { default as router } from './artifacts/api-server/src/routes/erp.ts'; export { createToken } from './artifacts/api-server/src/lib/auth.ts';`, resolveDir: root, loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    plugins: [{ name: 'isolated-pg', setup(buildApi) {
      buildApi.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: 'isolated-db', namespace: 'isolated' }));
      buildApi.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({ contents: `import { drizzle } from 'drizzle-orm/pglite'; export * from './lib/db/src/schema/index.ts'; export const db = drizzle(globalThis.__fnbTestPg);`, resolveDir: root, loader: 'ts' }));
    } }],
  });
  const filename = path.join(root, 'fnb-test-memory.cjs');
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(root);
  loaded.require = createRequire(filename);
  loaded._compile(compiled.outputFiles[0].text, filename);

  const user = (await pg.query(`INSERT INTO erp_users (username,password_hash,role) VALUES ('fnb-admin','test-hash','admin') RETURNING id,username,password_hash,role,updated_at`)).rows[0];
  const token = loaded.exports.createToken({ id: user.id, username: user.username, role: user.role, passwordHash: user.password_hash, updatedAt: new Date(user.updated_at) });
  await pg.exec(`
    INSERT INTO erp_products (name,selling_price,business_type,needs_recipe,stock,average_cost) VALUES
      ('Nasi',100,'Makanan',false,100,40),
      ('Parfum Mawar',300,'Parfum',false,100,60);
  `);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { error() {}, warn() {} }; next(); });
  app.use('/api', loaded.exports.router);
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const call = async (route, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };

  const sale = await call('/erp/sales', 'POST', { date: '2026-10-12', items: [{ productId: 1, quantity: 10 }, { productId: 2, quantity: 10 }] });
  assert.equal(sale.status, 201);
  assert.deepEqual((await pg.query('SELECT product_id,business_type FROM erp_sales_details ORDER BY product_id')).rows, [
    { product_id: 1, business_type: 'Makanan' },
    { product_id: 2, business_type: 'Parfum' },
  ]);

  assert.equal((await call('/erp/expenses', 'POST', { date: '2026-10-12', category: 'Gas', description: 'Dapur', amount: 100, businessType: 'Makanan' })).status, 201);
  assert.equal((await call('/erp/expenses', 'POST', { date: '2026-10-12', category: 'Botol', description: 'Khusus parfum', amount: 200, businessType: 'Parfum' })).status, 201);
  assert.equal((await call('/erp/expenses', 'POST', { date: '2026-10-12', category: 'Sewa', description: 'Toko bersama', amount: 300, businessType: 'Bersama' })).status, 201);
  assert.equal((await call('/erp/expenses', 'POST', { date: '2026-10-12', category: 'Invalid', description: 'No owner', amount: 1 })).status, 400);

  const report = await call('/erp/fnb-report?startDate=2026-10-12&endDate=2026-10-12');
  assert.equal(report.status, 200);
  assert.equal(report.body.revenue, 1000);
  assert.equal(report.body.actualCogs, 400);
  assert.equal(report.body.menus.length, 1);
  assert.equal(report.body.menus[0].productName, 'Nasi');
  assert.equal(report.body.sharedExpenseAllocationRate, 25);
  assert.equal(report.body.directExpenses, 100);
  assert.equal(report.body.sharedExpenses, 300);
  assert.equal(report.body.allocatedSharedExpenses, 75);
  assert.equal(report.body.operatingExpenses, 175);
  assert.equal(report.body.netProfit, 425);
  assert.deepEqual(report.body.expenses.map(row => row.businessType).sort(), ['Bersama', 'Makanan']);

  // A later product edit must not rewrite historical report ownership.
  await pg.exec(`UPDATE erp_products SET business_type = CASE WHEN id=1 THEN 'Parfum' ELSE 'Makanan' END`);
  const afterProductEdit = await call('/erp/fnb-report?startDate=2026-10-12&endDate=2026-10-12');
  assert.equal(afterProductEdit.body.revenue, 1000);
  assert.equal(afterProductEdit.body.actualCogs, 400);

  await pg.exec(`INSERT INTO erp_operating_expenses (date,category,description,amount,business_type) VALUES ('2026-10-13','Sewa','No-sales day',80,'Bersama')`);
  const zeroRevenue = await call('/erp/fnb-report?startDate=2026-10-13&endDate=2026-10-13');
  assert.equal(zeroRevenue.body.operatingExpenses, 0);
  assert.equal(zeroRevenue.body.allocatedSharedExpenses, 0);
  assert.equal(zeroRevenue.body.unallocatedSharedExpenses, 80);
});
