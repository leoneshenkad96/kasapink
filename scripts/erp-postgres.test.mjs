import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire, Module } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);
const pgBin = process.env.PG_BIN || (process.platform === "win32" ? "C:/Program Files/PostgreSQL/17/bin" : "");
const binary = (name) => path.join(pgBin, name + (process.platform === "win32" ? ".exe" : ""));
const command = (name, args) => run(binary(name), args, { windowsHide: true, timeout: 45000 });
const freePort = () => new Promise((resolve, reject) => {
  const listener = net.createServer();
  listener.on("error", reject);
  listener.listen(0, "127.0.0.1", () => {
    const port = listener.address().port;
    listener.close((error) => error ? reject(error) : resolve(port));
  });
});

const applySqlFile = async (pool, filePath) => {
  let sql = await readFile(filePath, "utf8");
  if (sql.includes("/*")) sql = sql.replace(/^.*?\/\*\r?\n/s, "").replace(/\r?\n\*\/\s*$/s, "\n");
  for (const statement of sql.split(/--> statement-breakpoint/g)) {
    if (statement.trim()) await pool.query(statement);
  }
};

test("ERP HTTP flow persists negative-stock recovery and finance totals", { timeout: 180000 }, async (t) => {
  const originalEnv = Object.fromEntries(["DATABASE_URL", "JWT_SECRET", "ADMIN_BOOTSTRAP_TOKEN", "NODE_ENV"].map((key) => [key, process.env[key]]));
  const testDir = await mkdtemp(path.join(os.tmpdir(), "kasapink-erp-pg-"));
  const dataDir = path.join(testDir, "data");
  let startAttempted = false;
  let pool;
  let server;
  t.after(async () => {
    try {
      if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      if (pool) await pool.end();
    } finally {
      if (startAttempted) {
        try { await command("pg_ctl", ["-D", dataDir, "-m", "fast", "-w", "stop"]); } catch { /* already stopped */ }
      }
      await rm(testDir, { recursive: true, force: true });
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  await command("initdb", ["-D", dataDir, "-U", "kasapink_test", "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  const port = await freePort();
  startAttempted = true;
  await command("pg_ctl", ["-D", dataDir, "-l", path.join(testDir, "postgres.log"), "-w", "-o", `-h 127.0.0.1 -p ${port} -F`, "start"]);
  process.env.DATABASE_URL = `postgresql://kasapink_test@127.0.0.1:${port}/postgres`;
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  process.env.ADMIN_BOOTSTRAP_TOKEN = randomBytes(32).toString("hex");
  process.env.NODE_ENV = "test";

  const compiled = await build({
    stdin: {
      contents: `export { default as app } from './artifacts/api-server/src/app.ts';\nexport { getPool } from './lib/db/src/index.ts';`,
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    external: ["pg-native"],
  });
  const filename = path.join(root, "erp-postgres-memory.cjs");
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(root);
  loaded.require = createRequire(filename);
  loaded._compile(compiled.outputFiles[0].text, filename);
  pool = loaded.exports.getPool();

  await applySqlFile(pool, path.join(root, "lib/db/drizzle/0000_pink_deathstrike.sql"));
  for (const name of ["0002_product_modes.sql", "0003_ingredient_stock_type.sql", "0004_product_business_type.sql", "0005_user_roles.sql", "0006_add_user_role.sql", "0007_recipe_units.sql", "0008_preparations.sql", "0010_product_preparations.sql", "0011_fnb_controls.sql", "0012_product_prep_units.sql", "0013_preparation_yield.sql", "0014_stock_count_variance.sql", "0015_production_schema_compat.sql", "0016_fix_date_index_operator_classes.sql", "0017_audit_log.sql", "0018_sales_costing_snapshot.sql", "0019_recipe_versions.sql", "0020_audit_before_after.sql"]) {
    await applySqlFile(pool, path.join(root, "lib/db/migrations", name));
  }

  const expressApp = loaded.exports.app;
  server = await new Promise((resolve, reject) => {
    const instance = expressApp.listen(0, "127.0.0.1", () => resolve(instance));
    instance.on("error", reject);
  });
  const request = async (route, token, method = "GET", body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  const requestRaw = async (route, token) => fetch(`http://127.0.0.1:${server.address().port}/api${route}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(15000),
  });

  const ready = await request("/readyz", null);
  assert.equal(ready.status, 200);
  assert.equal(ready.body.database, "ready");

  const setup = await request("/setup/admin", null, "POST", {
    bootstrapToken: process.env.ADMIN_BOOTSTRAP_TOKEN,
    username: "integration-admin",
    password: "integration-password-123",
  });
  assert.equal(setup.status, 201);
  const token = setup.body.token;
  const testingUser = await request("/users", token, "POST", {
    username: "integration-testing", password: "testing-password-123", role: "testing",
  });
  assert.equal(testingUser.status, 201);
  const normalUser = await request("/users", token, "POST", {
    username: "integration-user", password: "user-password-123", role: "user",
  });
  assert.equal(normalUser.status, 201);
  const testingLogin = await request("/login", null, "POST", {
    username: "integration-testing", password: "testing-password-123",
  });
  assert.equal(testingLogin.status, 200);
  const userLogin = await request("/login", null, "POST", {
    username: "integration-user", password: "user-password-123",
  });
  assert.equal(userLogin.status, 200);
  assert.equal((await request("/erp/state", testingLogin.body.token)).status, 200);
  const clearAllUnavailable = await request("/erp/clear-all", token, "DELETE");
  assert.equal(clearAllUnavailable.status, 404);
  assert.equal((await request("/erp/ingredients", testingLogin.body.token, "POST", {
    name: "Rejected ingredient", category: "Makro", stockType: "Makanan", unit: "kg", stock: 0, minStock: 0, openingUnitCost: 100,
  })).status, 403);

  const ingredient = await request("/erp/ingredients", token, "POST", {
    name: "Tepung Integration",
    category: "Makro",
    stockType: "Makanan",
    unit: "kg",
    stock: 0,
    minStock: 1,
    openingUnitCost: 100,
  });
  assert.equal(ingredient.status, 201);
  const ingredientId = ingredient.body.id;
  const ingredientPage = await request("/erp/ingredients?stockType=Makanan&search=Tepung&limit=1&offset=0", token);
  assert.equal(ingredientPage.status, 200);
  assert.equal(ingredientPage.body.items[0].id, ingredientId);
  assert.equal(ingredientPage.body.pagination.limit, 1);
  assert.ok(ingredientPage.body.pagination.total >= 1);

  const product = await request("/erp/products", token, "POST", {
    name: "Roti Integration",
    sellingPrice: 200,
    businessType: "Makanan",
    needsRecipe: true,
    autoRecipeIngredientId: ingredientId,
  });
  assert.equal(product.status, 201);
  const productId = product.body.id;
  const productPage = await request("/erp/products?businessType=Makanan&search=Roti&limit=1&offset=0", token);
  assert.equal(productPage.status, 200);
  assert.equal(productPage.body.items[0].id, productId);
  assert.equal(productPage.body.pagination.limit, 1);
  assert.ok(productPage.body.pagination.total >= 1);
  const negativeForTesting = await request("/erp/sales", userLogin.body.token, "POST", {
    date: "2026-10-10", items: [{ productId, quantity: 99999 }],
  });
  assert.equal(negativeForTesting.status, 409);

  const sale = await request("/erp/sales", token, "POST", {
    date: "2026-10-10",
    items: [{ productId, quantity: 5 }],
  });
  assert.equal(sale.status, 201);
  assert.equal(sale.body.totalCostOfGoodsSold, 500);
  assert.equal(sale.body.grossProfit, 500);
  const snapshot = await pool.query("SELECT costing_snapshot FROM erp_sales_details WHERE sales_id = $1", [sale.body.id]);
  assert.equal(snapshot.rows.length, 1);
  assert.equal(JSON.parse(snapshot.rows[0].costing_snapshot).ingredients[0].conversionFactor, 1);

  const purchase = await request("/erp/purchases", token, "POST", {
    date: "2026-10-10",
    supplierType: "Supplier integration",
    items: [{ ingredientId, quantity: 10, totalCost: 1200 }],
  });
  assert.equal(purchase.status, 201);

  const state = await request("/erp/state", token);
  assert.equal(state.status, 200);
  const savedIngredient = state.body.ingredients.find((row) => row.id === ingredientId);
  assert.equal(savedIngredient.stock, 5);
  assert.equal(savedIngredient.averageCost, 120);

  const concurrentSales = await Promise.all([
    request("/erp/sales", token, "POST", { date: "2026-10-10", items: [{ productId, quantity: 1 }] }),
    request("/erp/sales", token, "POST", { date: "2026-10-10", items: [{ productId, quantity: 1 }] }),
  ]);
  assert.deepEqual(concurrentSales.map((result) => result.status).sort(), [201, 201]);
  const afterConcurrent = await request("/erp/state", token);
  assert.equal(afterConcurrent.body.ingredients.find((row) => row.id === ingredientId).stock, 3);

  const finance = await request("/erp/finance?startDate=2026-10-10&endDate=2026-10-10", token);
  assert.equal(finance.status, 200);
  assert.equal(finance.body.revenue, 1400);
  assert.equal(finance.body.costOfGoodsSold, 740);
  assert.equal(finance.body.grossProfit, 660);

  const preparation = await request("/erp/preparations", token, "POST", {
    name: "Saus Integration", unit: "kg", yieldQty: 1,
  });
  assert.equal(preparation.status, 201);
  const preparationId = preparation.body.id;
  const prepRecipe = await request(`/erp/preparations/${preparationId}/recipe`, token, "PUT", {
    items: [{ ingredientId, qtyRequired: 1, recipeUnit: "kg" }],
  });
  assert.equal(prepRecipe.status, 200);
  const batch = await request(`/erp/preparations/${preparationId}/batches`, token, "POST", {
    date: "2026-10-10", targetQty: 1, actualQty: 1,
  });
  assert.equal(batch.status, 201);
  const prepProduct = await request("/erp/products", token, "POST", {
    name: "Menu Prep Integration", sellingPrice: 300, businessType: "Makanan", needsRecipe: true,
  });
  assert.equal(prepProduct.status, 201);
  const prepProductLink = await request(`/erp/products/${prepProduct.body.id}/preparations`, token, "PUT", {
    items: [{ preparationId, qtyRequired: 1, recipeUnit: "kg" }],
  });
  assert.equal(prepProductLink.status, 200);
  const prepSale = await request("/erp/sales", token, "POST", {
    date: "2026-10-10", items: [{ productId: prepProduct.body.id, quantity: 1 }],
  });
  assert.equal(prepSale.status, 201);
  assert.equal(prepSale.body.totalCostOfGoodsSold, 120);
  const fnb = await request("/erp/fnb-report?startDate=2026-10-10&endDate=2026-10-10", token);
  assert.equal(fnb.status, 200);
  assert.equal(fnb.body.revenue, 1700);
  assert.equal(fnb.body.actualCogs, 860);
  const recipeEdit = await request(`/erp/products/${productId}/recipe`, token, "PUT", {
    items: [{ ingredientId, qtyRequired: 99, recipeUnit: "kg" }],
  });
  assert.equal(recipeEdit.status, 200);
  const fnbAfterRecipeEdit = await request("/erp/fnb-report?startDate=2026-10-10&endDate=2026-10-10", token);
  assert.equal(fnbAfterRecipeEdit.status, 200);
  assert.equal(fnbAfterRecipeEdit.body.theoreticalCogs, fnb.body.theoreticalCogs);
  const directProduct = await request("/erp/products", token, "POST", {
    name: "Delete sale test product", sellingPrice: 100, businessType: "Makanan", needsRecipe: false, stock: 5, averageCost: 40,
  });
  assert.equal(directProduct.status, 201);
  const deleteSale = await request("/erp/sales", token, "POST", { date: "2026-10-10", items: [{ productId: directProduct.body.id, quantity: 2 }] });
  assert.equal(deleteSale.status, 201);
  const deleteResponse = await request(`/erp/sales/${deleteSale.body.id}`, token, "DELETE");
  assert.equal(deleteResponse.status, 200);
  const afterDelete = await request("/erp/state", token);
  assert.equal(afterDelete.status, 200);
  assert.equal(afterDelete.body.products.find((item) => item.id === directProduct.body.id).stock, 5);
  const exportResponse = await request("/erp/export", token);
  assert.equal(exportResponse.status, 200);
  assert.equal(exportResponse.body.schemaVersion, 1);
  assert.ok(exportResponse.body.data.ingredients.length >= 1);
  assert.ok(exportResponse.body.data.auditLogs.length >= 1);
  assert.ok(exportResponse.body.data.recipeVersions.length >= 1);
  const auditLog = await request("/erp/audit-log", token);
  assert.equal(auditLog.status, 200);
  assert.ok(auditLog.body.items.length >= 1);
  const auditPage = await request("/erp/audit-log?limit=1&offset=0", token);
  assert.equal(auditPage.status, 200);
  assert.equal(auditPage.body.pagination.limit, 1);
  assert.ok(auditPage.body.pagination.total >= 1);
  for (const format of ["csv", "xls", "pdf"]) {
    const reportExport = await requestRaw(`/erp/report-export?type=finance&format=${format}&startDate=2026-10-10&endDate=2026-10-10`, token);
    assert.equal(reportExport.status, 200);
    assert.match(String(reportExport.headers.get("content-disposition")), new RegExp(`\\.${format}`));
    const body = await reportExport.arrayBuffer();
    assert.ok(body.byteLength > 30);
    if (format === "pdf") assert.equal(Buffer.from(body).subarray(0, 8).toString(), "%PDF-1.4");
    if (format === "csv") assert.match(Buffer.from(body).toString("utf8"), /Tanggal/);
    if (format === "xls") assert.match(Buffer.from(body).toString("utf8"), /Kasapink/);
  }
  for (const type of ["stock", "transactions"]) {
    const reportExport = await requestRaw(`/erp/report-export?type=${type}&format=csv&startDate=2026-10-10&endDate=2026-10-10`, token);
    assert.equal(reportExport.status, 200);
    assert.match(Buffer.from(await reportExport.arrayBuffer()).toString("utf8"), /Tanggal|Nama/);
  }
});
