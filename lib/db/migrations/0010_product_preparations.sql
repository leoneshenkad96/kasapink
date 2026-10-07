CREATE TABLE IF NOT EXISTS erp_product_preparation_items (
  id serial PRIMARY KEY,
  product_id integer NOT NULL REFERENCES erp_products(id) ON DELETE CASCADE,
  preparation_id integer NOT NULL REFERENCES erp_preparations(id) ON DELETE RESTRICT,
  qty_required numeric(14,3) NOT NULL DEFAULT '0',
  recipe_unit text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS erp_product_preparation_unique
  ON erp_product_preparation_items(product_id, preparation_id);
