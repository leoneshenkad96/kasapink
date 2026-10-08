-- Bring production databases up to the schema required by current ERP routes.
-- Keep recipe units aligned with existing ingredient stock units when backfilling.
ALTER TABLE erp_recipe_items
  ADD COLUMN IF NOT EXISTS recipe_unit text,
  ADD COLUMN IF NOT EXISTS conversion_factor numeric(14, 6) NOT NULL DEFAULT '1';

UPDATE erp_recipe_items ri
SET recipe_unit = i.unit
FROM erp_ingredients i
WHERE ri.ingredient_id = i.id
  AND ri.recipe_unit IS NULL;

ALTER TABLE erp_recipe_items
  ALTER COLUMN recipe_unit SET NOT NULL;

ALTER TABLE erp_preparations
  ADD COLUMN IF NOT EXISTS yield_qty numeric(14, 3) NOT NULL DEFAULT '1';

ALTER TABLE erp_waste
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
