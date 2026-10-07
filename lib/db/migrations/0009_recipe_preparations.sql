ALTER TABLE erp_recipe_items
  ALTER COLUMN ingredient_id DROP NOT NULL;

ALTER TABLE erp_recipe_items
  ADD COLUMN IF NOT EXISTS preparation_id integer
    REFERENCES erp_preparations(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS erp_recipe_product_preparation_unique
  ON erp_recipe_items(product_id, preparation_id);
