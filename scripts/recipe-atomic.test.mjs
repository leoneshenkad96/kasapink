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
test('recipe and ingredient unit rules use atomic HTTP transactions', async t => {
  const pg = new PGlite();
  await pg.waitReady;
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-recipe-test-secret-with-at-least-32-characters';
  let server;
  t.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await pg.close(); if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret; delete globalThis.__recipeTestPg; });
  const apply = async filename => {
    let sql = await readFile(filename, 'utf8');
    if (sql.includes('/*')) sql = sql.replace(/^.*?\/\*\r?\n/s, '').replace(/\r?\n\*\/\s*$/s, '\n');
    await pg.exec(sql.replaceAll('--> statement-breakpoint', ''));
  };
  await apply(path.join(root, 'lib/db/drizzle/0000_pink_deathstrike.sql'));
  for (const name of (await readdir(path.join(root, 'lib/db/migrations'))).filter(n => n.endsWith('.sql')).sort()) await apply(path.join(root, 'lib/db/migrations', name));
  globalThis.__recipeTestPg = pg;
  const compiled = await build({
    stdin: { contents: `export { default as router } from './artifacts/api-server/src/routes/erp.ts'; export { createToken } from './artifacts/api-server/src/lib/auth.ts'; export { toCsv, toPdf } from './artifacts/api-server/src/lib/report-export.ts';`, resolveDir:root, loader:'ts' },
    bundle:true, platform:'node', format:'cjs', write:false,
    plugins:[{name:'isolated-pg', setup(build) {
      build.onResolve({filter:/^@workspace\/db$/}, () => ({path:'isolated-db', namespace:'isolated'}));
      build.onLoad({filter:/.*/,namespace:'isolated'}, () => ({contents:`import { drizzle } from 'drizzle-orm/pglite'; export * from './lib/db/src/schema/index.ts'; export const db = drizzle(globalThis.__recipeTestPg);`,resolveDir:root,loader:'ts'}));
    }}],
  });
  const filename = path.join(root, 'recipe-test-memory.cjs');
  const loaded = new Module(filename); loaded.filename=filename; loaded.paths=Module._nodeModulePaths(root); loaded.require=createRequire(filename); loaded._compile(compiled.outputFiles[0].text, filename);
  const user = (await pg.query(`INSERT INTO erp_users (username,password_hash,role) VALUES ('recipe-admin','test-hash','admin') RETURNING id,username,password_hash,role,updated_at`)).rows[0];
  const token = loaded.exports.createToken({id:user.id, username:user.username,role:user.role,passwordHash:user.password_hash,updatedAt:new Date(user.updated_at)});
  await pg.exec(`INSERT INTO erp_ingredients (name,category,unit,stock,average_cost) VALUES
    ('Bengkoang','Sayuran','kg',10,20000),
    ('Kemasan','Kemasan','pack',10,500),
    ('Bahan Baru','Sayuran','kg',0,0),
    ('Bahan Resep','Sayuran','kg',0,0),
    ('Bahan Historis','Sayuran','kg',0,0),
    ('Batas Stok','Sayuran','kg',99999999999.999,1000);
    INSERT INTO erp_products (name,selling_price) VALUES ('Pangsit Ayam',15000);`);
  const app=express(); app.use(express.json()); app.use((req,_res,next) => {req.log={error(){},warn(){}};next();}); app.use('/api',loaded.exports.router);
  server=await new Promise(resolve => { const s=app.listen(0,'127.0.0.1',() => resolve(s)); });
  const call = async (route, method='GET', body) => { const response = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, {method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},...(body ? {body:JSON.stringify(body)} : {})}); return {status:response.status,body:await response.json()}; };
  const save = async items => { const response=await fetch(`http://127.0.0.1:${server.address().port}/api/erp/products/1/recipe`, {method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({items})}); return {status:response.status,body:await response.json()}; };

  const appSource = await readFile(path.join(root,'artifacts/erp-rumahan-emak/src/App.tsx'),'utf8');
  assert.match(appSource,/bahan ·/);
  assert.doesNotMatch(appSource,/Menyimpan\?|bahan makro \?/);

  const formulaCsv = loaded.exports.toCsv({
    title:'Uji CSV', columns:['Teks','Angka'], rows:[
      ['=SUM(A1:A2)',-42], ['+cmd',-1], ['-teks',0], ['@mention',1], ['\tpayload',2], ['\rpayload',3],
    ],
  });
  for (const value of ['=SUM(A1:A2)','+cmd','-teks','@mention','\tpayload','\rpayload']) assert.ok(formulaCsv.includes(`"'${value}"`));
  assert.ok(formulaCsv.includes('"-42"'));
  assert.equal(formulaCsv.includes('"\'-42"'),false);

  const longPdfText = 'Nama bahan sangat panjang untuk laporan lengkap tanpa kehilangan kata';
  const wrappedPdf = loaded.exports.toPdf({ title:'Uji PDF', columns:['Nama','Kolom 2','Kolom 3','Kolom 4','Kolom 5','Kolom 6','Kolom 7','Kolom 8'], rows:[[longPdfText,'','','','','','','']] }).toString('utf8');
  for (const word of longPdfText.split(' ')) assert.ok(wrappedPdf.includes(word));
  assert.equal(wrappedPdf.includes(longPdfText.slice(0,22)),false);

  const readyState = await call('/erp/state');
  assert.equal(readyState.status,200);
  assert.equal(readyState.body.dataStatus,'ready');
  assert.equal(Number.isNaN(Date.parse(readyState.body.generatedAt)),false);
  assert.equal(readyState.body.ingredients.length,6);

  await pg.exec('ALTER TABLE erp_products RENAME TO erp_products_unavailable');
  const degradedState = await call('/erp/state');
  assert.equal(degradedState.status,503);
  assert.equal(degradedState.body.status,'degraded');
  assert.deepEqual(degradedState.body.failedComponents,['products']);
  assert.equal('products' in degradedState.body,false);
  await pg.exec('ALTER TABLE erp_products_unavailable RENAME TO erp_products');
  assert.equal((await call('/erp/state')).status,200);

  const invalidCalendarDate = '2026-02-30';
  assert.equal((await call(`/erp/finance?startDate=${invalidCalendarDate}&endDate=${invalidCalendarDate}`)).status,400);
  assert.equal((await call(`/erp/fnb-report?startDate=${invalidCalendarDate}&endDate=${invalidCalendarDate}`)).status,400);
  assert.equal((await call('/erp/finance?startDate=2024-02-29&endDate=2024-02-29')).status,200);
  assert.equal((await call('/erp/purchases','POST',{date:invalidCalendarDate,supplierType:'QA',items:[{ingredientId:1,quantity:1,totalCost:1000}]})).status,400);
  assert.equal((await call('/erp/sales','POST',{date:'2099-01-01',items:[{productId:1,quantity:1}]})).status,400);
  assert.equal((await call('/erp/stock-counts','POST',{date:invalidCalendarDate,items:[{ingredientId:1,countedStock:9}]})).status,400);
  assert.equal((await call('/erp/waste','POST',{date:invalidCalendarDate,itemType:'ingredient',itemId:1,quantity:1,reason:'Uji tanggal'})).status,400);
  assert.equal((await call('/erp/expenses','POST',{date:invalidCalendarDate,category:'QA',description:'Uji tanggal',amount:1000,businessType:'Makanan'})).status,400);
  assert.equal((await call('/erp/preparations/1/batches','POST',{date:invalidCalendarDate,targetQty:1,actualQty:1})).status,400);
  assert.equal((await call('/erp/purchases','POST',{date:'2026-02-01T00:00:00Z',supplierType:'QA',items:[{ingredientId:1,quantity:1,totalCost:1000}]})).status,400);
  assert.equal((await pg.query('SELECT count(*)::int AS count FROM erp_purchases')).rows[0].count,0);
  assert.equal((await pg.query('SELECT count(*)::int AS count FROM erp_sales')).rows[0].count,0);
  assert.equal((await pg.query('SELECT count(*)::int AS count FROM erp_operating_expenses')).rows[0].count,0);
  assert.equal(Number((await pg.query('SELECT stock FROM erp_ingredients WHERE id=1')).rows[0].stock),10);

  const unusedUnitChange = await call('/erp/ingredients/3','PATCH',{unit:'gram'});
  assert.equal(unusedUnitChange.status,200);
  assert.equal(unusedUnitChange.body.unit,'gram');

  const stockedBefore = (await pg.query('SELECT name,unit,stock,average_cost FROM erp_ingredients WHERE id=1')).rows[0];
  const stockedUnitChange = await call('/erp/ingredients/1','PATCH',{unit:'gram',name:'Tidak Boleh Tersimpan'});
  assert.equal(stockedUnitChange.status,409);
  assert.match(stockedUnitChange.body.error,/memiliki stok/);
  assert.deepEqual((await pg.query('SELECT name,unit,stock,average_cost FROM erp_ingredients WHERE id=1')).rows[0],stockedBefore);

  const sameUnitUpdate = await call('/erp/ingredients/1','PATCH',{unit:'kg',minStock:2});
  assert.equal(sameUnitUpdate.status,200);
  assert.equal(sameUnitUpdate.body.unit,'kg');
  assert.equal(sameUnitUpdate.body.minStock,2);

  await pg.exec(`INSERT INTO erp_recipe_items (product_id,ingredient_id,qty_required,recipe_unit,conversion_factor)
    VALUES (1,4,1,'kg',1)`);
  const recipeUnitChange = await call('/erp/ingredients/4','PATCH',{unit:'gram'});
  assert.equal(recipeUnitChange.status,409);
  assert.match(recipeUnitChange.body.error,/digunakan dalam resep/);
  await pg.exec('DELETE FROM erp_recipe_items WHERE ingredient_id=4');

  await pg.exec(`INSERT INTO erp_stock_movements (date,ingredient_id,movement_type,quantity_delta,stock_before,stock_after,unit_cost)
    VALUES ('2026-10-11',5,'opname',0,0,0,0)`);
  const historyUnitChange = await call('/erp/ingredients/5','PATCH',{unit:'gram'});
  assert.equal(historyUnitChange.status,409);
  assert.match(historyUnitChange.body.error,/riwayat transaksi/);

  const listed = await call('/erp/ingredients?limit=20');
  assert.equal(listed.status,200);
  const listedById = new Map(listed.body.items.map(item => [item.id,item]));
  assert.equal(listedById.get(1).unitLocked,true);
  assert.equal(listedById.get(3).unitLocked,false);
  assert.equal(listedById.get(5).unitLocked,true);

  const invalidIngredientPrecision = await call('/erp/ingredients','POST',{name:'Presisi Tidak Valid',category:'Sayuran',stockType:'Makanan',unit:'kg',stock:0.0001,minStock:0,openingUnitCost:0});
  assert.equal(invalidIngredientPrecision.status,400);
  const invalidIngredientOverflow = await call('/erp/ingredients','POST',{name:'Overflow Tidak Valid',category:'Sayuran',stockType:'Makanan',unit:'kg',stock:100000000000,minStock:0,openingUnitCost:0});
  assert.equal(invalidIngredientOverflow.status,400);
  assert.equal((await pg.query(`SELECT count(*)::int AS count FROM erp_ingredients WHERE name IN ('Presisi Tidak Valid','Overflow Tidak Valid')`)).rows[0].count,0);

  const minStockBefore = (await pg.query('SELECT min_stock FROM erp_ingredients WHERE id=1')).rows[0].min_stock;
  assert.equal((await call('/erp/ingredients/1','PATCH',{minStock:1.2345})).status,400);
  assert.equal((await pg.query('SELECT min_stock FROM erp_ingredients WHERE id=1')).rows[0].min_stock,minStockBefore);

  assert.equal((await save([{ingredientId:1,qtyRequired:0.001,recipeUnit:'gram'}])).status,400);
  assert.equal((await pg.query('SELECT count(*)::int AS count FROM erp_recipe_items WHERE product_id=1')).rows[0].count,0);

  const purchaseCountBefore = (await pg.query('SELECT count(*)::int AS count FROM erp_purchases')).rows[0].count;
  const overflowPurchase = await call('/erp/purchases','POST',{date:'2026-10-11',supplierType:'QA',items:[{ingredientId:6,quantity:0.001,totalCost:1}]});
  assert.equal(overflowPurchase.status,400);
  assert.equal(Number((await pg.query('SELECT stock FROM erp_ingredients WHERE id=6')).rows[0].stock),99999999999.999);
  assert.equal((await pg.query('SELECT count(*)::int AS count FROM erp_purchases')).rows[0].count,purchaseCountBefore);
  assert.equal((await pg.query('SELECT count(*)::int AS count FROM erp_stock_movements WHERE ingredient_id=6')).rows[0].count,0);

  assert.equal((await call('/erp/waste','POST',{date:'2026-10-11',itemType:'ingredient',itemId:1,quantity:0.0001,reason:'Uji presisi'})).status,400);
  assert.equal((await call('/erp/preparations','POST',{name:'Prep Presisi Tidak Valid',unit:'kg',yieldQty:0.0001})).status,400);
  assert.equal((await call('/erp/stock-counts','POST',{date:'2026-10-11',items:[{ingredientId:1,countedStock:100000000000}]})).status,400);

  assert.equal((await save([{ingredientId:1,qtyRequired:250,recipeUnit:'gram'}])).status,200);
  assert.equal((await save([{ingredientId:1,qtyRequired:0.0001,recipeUnit:'kg'}])).status,400);
  const sale = await call('/erp/sales','POST',{date:'2026-10-11',items:[{productId:1,quantity:2}]});
  assert.equal(sale.status,201); assert.equal(sale.body.totalCostOfGoodsSold,10000);
  const before=(await pg.query('SELECT * FROM erp_recipe_items ORDER BY id')).rows;
  assert.equal(Number(before[0].conversion_factor),0.001);
  assert.equal((await save([{ingredientId:1,qtyRequired:1,recipeUnit:'kg'},{ingredientId:1,qtyRequired:2,recipeUnit:'kg'}])).status,400);
  assert.equal((await save([{ingredientId:2,qtyRequired:1,recipeUnit:'pcs'}])).status,400);
  assert.deepEqual((await pg.query('SELECT * FROM erp_recipe_items ORDER BY id')).rows,before);
  await pg.exec(`CREATE FUNCTION reject_recipe_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected version failure'; END; $$; CREATE TRIGGER fail_recipe_version BEFORE INSERT ON erp_recipe_versions FOR EACH ROW EXECUTE FUNCTION reject_recipe_version();`);
  assert.equal((await save([{ingredientId:1,qtyRequired:0.5,recipeUnit:'kg'}])).status,500);
  assert.deepEqual((await pg.query('SELECT * FROM erp_recipe_items ORDER BY id')).rows,before);
  assert.equal((await pg.query('SELECT count(*)::int AS count FROM erp_recipe_versions')).rows[0].count,1);
  await pg.exec('DROP TRIGGER fail_recipe_version ON erp_recipe_versions');
  assert.equal((await save([])).status,200);
  assert.equal((await pg.query('SELECT count(*)::int AS count FROM erp_recipe_items')).rows[0].count,0);
  const finance = await call('/erp/finance?startDate=2026-10-11&endDate=2026-10-11');
  assert.equal(finance.status,200); assert.equal(finance.body.costOfGoodsSold,10000);
  await pg.exec(`INSERT INTO erp_preparations (name,unit,yield_qty) VALUES ('Ayam Suwir','kg',5)`);
  const prepItems = {items:[{ingredientId:1,qtyRequired:1,recipeUnit:'kg'}]};
  assert.equal((await call('/erp/preparations/1/recipe','PUT',prepItems)).status,200);
  const prepBefore=(await pg.query('SELECT * FROM erp_preparation_recipe_items ORDER BY id')).rows;
  await pg.exec('CREATE TRIGGER fail_recipe_version BEFORE INSERT ON erp_recipe_versions FOR EACH ROW EXECUTE FUNCTION reject_recipe_version()');
  assert.equal((await call('/erp/preparations/1/recipe','PUT',{items:[]})).status,500);
  assert.deepEqual((await pg.query('SELECT * FROM erp_preparation_recipe_items ORDER BY id')).rows,prepBefore);
  await pg.exec('DROP TRIGGER fail_recipe_version ON erp_recipe_versions');

  const batch = await call('/erp/preparations/1/batches','POST',{date:'2026-10-11',targetQty:5,actualQty:5});
  assert.equal(batch.status,201);
  const prepProduct = await call('/erp/products','POST',{name:'Nasi Ayam Prep',sellingPrice:30000,businessType:'Makanan',needsRecipe:true});
  assert.equal(prepProduct.status,201);
  assert.equal((await call(`/erp/products/${prepProduct.body.id}/preparations`,'PUT',{items:[{preparationId:1,qtyRequired:1,recipeUnit:'kg'}]})).status,200);
  const prepSale = await call('/erp/sales','POST',{date:'2026-10-11',items:[{productId:prepProduct.body.id,quantity:2}]});
  assert.equal(prepSale.status,201);
  const prepSaleSnapshot = JSON.parse((await pg.query('SELECT costing_snapshot FROM erp_sales_details WHERE sales_id=$1',[prepSale.body.id])).rows[0].costing_snapshot);
  assert.equal(prepSaleSnapshot.version,2);
  assert.equal(prepSaleSnapshot.valuationBasis,'transaction_time');
  assert.equal(prepSaleSnapshot.preparations[0].yieldQty,5);
  assert.equal(prepSaleSnapshot.preparations[0].components[0].quantityRequired,1);
  assert.equal(prepSaleSnapshot.preparations[0].components[0].conversionFactor,1);

  const historicalReport = await call('/erp/fnb-report?startDate=2026-10-11&endDate=2026-10-11');
  assert.equal(historicalReport.status,200);
  assert.equal(historicalReport.body.varianceValuationBasis,'transaction_time');
  assert.equal(historicalReport.body.foodCostBasis,'sale_transaction_snapshot');
  assert.equal('foodCostVariance' in historicalReport.body,false);
  assert.equal(historicalReport.body.snapshotCoverage,100);
  assert.equal(historicalReport.body.incompleteSnapshotLines,0);
  const varianceBeforeEdits = historicalReport.body.recipeUsageVariance;
  const recordedCogsBeforeEdits = historicalReport.body.recordedCogs;
  await pg.exec(`UPDATE erp_ingredients SET average_cost=99999 WHERE id=1; UPDATE erp_preparations SET average_cost=88888,yield_qty=10 WHERE id=1`);
  assert.equal((await call('/erp/preparations/1/recipe','PUT',{items:[{ingredientId:1,qtyRequired:2000,recipeUnit:'gram'}]})).status,200);
  assert.equal((await call(`/erp/products/${prepProduct.body.id}/preparations`,'PUT',{items:[{preparationId:1,qtyRequired:3,recipeUnit:'kg'}]})).status,200);
  const reportAfterRecipeAndPriceEdits = await call('/erp/fnb-report?startDate=2026-10-11&endDate=2026-10-11');
  assert.equal(reportAfterRecipeAndPriceEdits.status,200);
  assert.deepEqual(reportAfterRecipeAndPriceEdits.body.recipeUsageVariance,varianceBeforeEdits);
  assert.equal(reportAfterRecipeAndPriceEdits.body.recordedCogs,recordedCogsBeforeEdits);

  const legacySnapshot = JSON.stringify({
    capturedAt:'2026-10-12T00:00:00.000Z',ingredients:[],
    preparations:[{preparationId:1,quantityRequired:1,recipeUnit:'kg',conversionFactor:1,averageCost:4000}],
  });
  const legacySale = (await pg.query(`INSERT INTO erp_sales (date,total_revenue,total_cost_of_goods_sold) VALUES ('2026-10-12',30000,4000) RETURNING id`)).rows[0];
  await pg.query(`INSERT INTO erp_sales_details (sales_id,product_id,product_name,quantity,unit_price,revenue,cost_of_goods_sold,costing_snapshot,business_type) VALUES ($1,$2,'Legacy prep sale',1,30000,30000,4000,$3,'Makanan')`,[legacySale.id,prepProduct.body.id,legacySnapshot]);
  const legacyReport = await call('/erp/fnb-report?startDate=2026-10-12&endDate=2026-10-12');
  assert.equal(legacyReport.body.snapshotCoverage,0);
  assert.equal(legacyReport.body.incompleteSnapshotLines,1);
  assert.equal((await call('/erp/preparations/1/recipe','PUT',{items:[{ingredientId:1,qtyRequired:3,recipeUnit:'kg'}]})).status,200);
  const legacyAfterCurrentRecipeEdit = await call('/erp/fnb-report?startDate=2026-10-12&endDate=2026-10-12');
  assert.deepEqual(legacyAfterCurrentRecipeEdit.body.recipeUsageVariance,legacyReport.body.recipeUsageVariance);

});
