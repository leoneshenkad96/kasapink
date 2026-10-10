import { createRequire } from "node:module";

const requireFromDb = createRequire(new URL("../lib/db/package.json", import.meta.url));
const pg = requireFromDb("pg");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const parsedUrl = new URL(databaseUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname)) {
  throw new Error("Refusing to seed a non-local database.");
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query("BEGIN");
  const ingredients = [
    ["Beras Demo Lokal", "Bahan Mentah", "Makanan", "kg", 25, 5, 15000],
    ["Ayam Suwir Demo Lokal", "Bahan Mentah", "Makanan", "kg", 8, 2, 52000],
    ["Botol Parfum Demo Lokal", "Kemasan", "Parfum", "pcs", 50, 10, 3500],
  ];
  const ingredientIds = new Map();
  for (const [name, category, stockType, unit, stock, minStock, cost] of ingredients) {
    const result = await client.query(
      `INSERT INTO public.erp_ingredients
        (name, category, stock_type, unit, stock, min_stock, last_price, average_cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT (name) DO UPDATE SET
         category = EXCLUDED.category, stock_type = EXCLUDED.stock_type,
         unit = EXCLUDED.unit, min_stock = EXCLUDED.min_stock
       RETURNING id`,
      [name, category, stockType, unit, stock, minStock, cost],
    );
    ingredientIds.set(name, result.rows[0].id);
  }

  const product = await client.query(
    `INSERT INTO public.erp_products
      (name, selling_price, business_type, needs_recipe, stock, average_cost)
     VALUES ('Nasi Bakar Demo Lokal', 18000, 'Makanan', true, 0, 0)
     ON CONFLICT (name) DO UPDATE SET selling_price = EXCLUDED.selling_price
     RETURNING id`,
  );
  const productId = product.rows[0].id;
  for (const [ingredientName, qty] of [["Beras Demo Lokal", 0.15], ["Ayam Suwir Demo Lokal", 0.08]]) {
    await client.query(
      `INSERT INTO public.erp_recipe_items
        (product_id, ingredient_id, qty_required, recipe_unit, conversion_factor)
       VALUES ($1, $2, $3, 'kg', 1)
       ON CONFLICT (product_id, ingredient_id) DO UPDATE SET
         qty_required = EXCLUDED.qty_required,
         recipe_unit = EXCLUDED.recipe_unit,
         conversion_factor = EXCLUDED.conversion_factor`,
      [productId, ingredientIds.get(ingredientName), qty],
    );
  }

  const perfume = await client.query(
    `INSERT INTO public.erp_products
      (name, selling_price, business_type, needs_recipe, stock, average_cost)
     VALUES ('Parfum Demo Lokal', 45000, 'Parfum', false, 12, 18000)
     ON CONFLICT (name) DO UPDATE SET selling_price = EXCLUDED.selling_price
     RETURNING id`,
  );

  const sale = await client.query(
    `INSERT INTO public.erp_sales (date, total_revenue, total_cost_of_goods_sold)
     SELECT current_date, 45000, 18000
     WHERE NOT EXISTS (
       SELECT 1 FROM public.erp_sales_details WHERE product_name = 'Parfum Demo Lokal'
     )
     RETURNING id`,
  );
  if (sale.rowCount === 1) {
    await client.query(
      `INSERT INTO public.erp_sales_details
        (sales_id, product_id, product_name, quantity, unit_price, revenue, cost_of_goods_sold)
       VALUES ($1, $2, 'Parfum Demo Lokal', 1, 45000, 45000, 18000)`,
      [sale.rows[0].id, perfume.rows[0].id],
    );
  }
  await client.query("COMMIT");
  console.log("Local demo data is ready.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
