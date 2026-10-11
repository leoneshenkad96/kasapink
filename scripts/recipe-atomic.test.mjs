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
test('actual recipe HTTP handler saves atomically and rolls back a failed version write', async t => {
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
    stdin: { contents: `export { default as router } from './artifacts/api-server/src/routes/erp.ts'; export { createToken } from './artifacts/api-server/src/lib/auth.ts';`, resolveDir:root, loader:'ts' },
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
  await pg.exec(`INSERT INTO erp_ingredients (name,category,unit,stock,average_cost) VALUES ('Bengkoang','Sayuran','kg',10,20000),('Kemasan','Kemasan','pack',10,500); INSERT INTO erp_products (name,selling_price) VALUES ('Pangsit Ayam',15000);`);
  const app=express(); app.use(express.json()); app.use((req,_res,next) => {req.log={error(){},warn(){}};next();}); app.use('/api',loaded.exports.router);
  server=await new Promise(resolve => { const s=app.listen(0,'127.0.0.1',() => resolve(s)); });
  const save = async items => { const response=await fetch(`http://127.0.0.1:${server.address().port}/api/erp/products/1/recipe`, {method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({items})}); return {status:response.status,body:await response.json()}; };
  assert.equal((await save([{ingredientId:1,qtyRequired:250,recipeUnit:'gram'}])).status,200);
  assert.equal((await save([{ingredientId:1,qtyRequired:0.0001,recipeUnit:'kg'}])).status,400);
  const call = async (route, method='GET', body) => { const response = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, {method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},...(body ? {body:JSON.stringify(body)} : {})}); return {status:response.status,body:await response.json()}; };
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

});
