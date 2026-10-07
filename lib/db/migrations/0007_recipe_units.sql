-- Store the unit used by a recipe separately from the ingredient stock unit.
-- conversion_factor means: 1 recipe unit = N stock units.
ALTER TABLE erp_recipe_items
  ADD COLUMN IF NOT EXISTS recipe_unit text,
  ADD COLUMN IF NOT EXISTS conversion_factor numeric(14,6) NOT NULL DEFAULT '1';

UPDATE erp_recipe_items ri
SET recipe_unit = i.unit
FROM erp_ingredients i
WHERE ri.ingredient_id = i.id
  AND ri.recipe_unit IS NULL;

ALTER TABLE erp_recipe_items
  ALTER COLUMN recipe_unit SET NOT NULL;
