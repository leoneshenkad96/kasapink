-- Normalize ingredient display names and safely migrate Bawang Putih from
-- a count-based stock unit to kilograms. Historical transactions and recipe
-- snapshots are intentionally left unchanged so old HPP remains reproducible.

-- Fail before changing names when normalization would collide with another
-- active ingredient. The invalid cast deliberately aborts the transaction.
SELECT CASE
  WHEN count(*) = 0 THEN 1
  ELSE ('Title Case normalization would create duplicate active ingredients: ' ||
    string_agg(normalized_name, ', ' ORDER BY normalized_name))::integer
END
FROM (
  SELECT initcap(lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) AS normalized_name
  FROM erp_ingredients
  WHERE active = true
  GROUP BY initcap(lower(regexp_replace(btrim(name), '\s+', ' ', 'g')))
  HAVING count(*) > 1
) duplicates;

UPDATE erp_ingredients
SET name = initcap(lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))),
    updated_at = now()
WHERE active = true
  AND name IS DISTINCT FROM initcap(lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

-- A clean database without Bawang Putih is valid. If it exists, require the
-- exact audited relationship before applying the unit conversion.
SELECT CASE
  WHEN (SELECT count(*) FROM erp_ingredients WHERE active = true AND lower(btrim(name)) = 'bawang putih') = 0 THEN 1
  WHEN (SELECT count(*) FROM erp_ingredients WHERE active = true AND lower(btrim(name)) = 'bawang putih') = 1
    AND (
      SELECT count(*)
      FROM erp_recipe_items ri
      JOIN erp_products p ON p.id = ri.product_id
      JOIN erp_ingredients i ON i.id = ri.ingredient_id
      WHERE i.active = true AND lower(btrim(i.name)) = 'bawang putih'
        AND p.name = 'Spaghetti Aglio Olio'
    ) = 1
    AND (
      SELECT count(*)
      FROM erp_recipe_items ri
      JOIN erp_ingredients i ON i.id = ri.ingredient_id
      WHERE i.active = true AND lower(btrim(i.name)) = 'bawang putih'
    ) = 1
    AND (
      SELECT count(*)
      FROM erp_preparation_recipe_items pri
      JOIN erp_ingredients i ON i.id = pri.ingredient_id
      WHERE i.active = true AND lower(btrim(i.name)) = 'bawang putih'
    ) = 0
  THEN 1
  ELSE ('Bawang Putih relationship changed - migration aborted for review, active count ' ||
    (SELECT count(*) FROM erp_ingredients WHERE active = true AND lower(btrim(name)) = 'bawang putih'))::integer
END;

UPDATE erp_ingredients
SET unit = 'kg',
    stock = 2.000,
    min_stock = 1.000,
    last_price = 48000.00,
    average_cost = 48000.00,
    updated_at = now()
WHERE active = true AND lower(btrim(name)) = 'bawang putih';

-- Five old "butir" are standardized to 20 grams, which is within the
-- approved 6-20 gram recipe range. Stored stock consumption is 0.020 kg.
UPDATE erp_recipe_items ri
SET qty_required = 20.000,
    recipe_unit = 'gram',
    conversion_factor = 0.001000
FROM erp_ingredients i, erp_products p
WHERE ri.ingredient_id = i.id
  AND ri.product_id = p.id
  AND i.active = true
  AND lower(btrim(i.name)) = 'bawang putih'
  AND p.name = 'Spaghetti Aglio Olio';

INSERT INTO erp_recipe_versions (scope, parent_id, version, snapshot)
SELECT
  'product',
  p.id,
  coalesce((
    SELECT max(rv.version)
    FROM erp_recipe_versions rv
    WHERE rv.scope = 'product' AND rv.parent_id = p.id
  ), 0) + 1,
  coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'productId', ri.product_id,
        'ingredientId', ri.ingredient_id,
        'qtyRequired', ri.qty_required::text,
        'recipeUnit', ri.recipe_unit,
        'conversionFactor', ri.conversion_factor::text
      ) ORDER BY ri.id
    )
    FROM erp_recipe_items ri
    WHERE ri.product_id = p.id
  ), '[]'::jsonb)::text
FROM erp_products p
WHERE p.name = 'Spaghetti Aglio Olio'
  AND EXISTS (
    SELECT 1
    FROM erp_recipe_items ri
    JOIN erp_ingredients i ON i.id = ri.ingredient_id
    WHERE ri.product_id = p.id
      AND i.active = true
      AND lower(btrim(i.name)) = 'bawang putih'
  );

INSERT INTO erp_stock_movements (
  date,
  ingredient_id,
  movement_type,
  quantity_delta,
  stock_before,
  stock_after,
  unit_cost,
  variance_value,
  note
)
SELECT
  (now() AT TIME ZONE 'Asia/Jakarta')::date,
  id,
  'unit_conversion',
  0.000,
  2.000,
  2.000,
  48000.00,
  0.00,
  'Migrasi satuan: 12.500 butir menjadi stok fisik terverifikasi 2.000 kg - histori transaksi lama dipertahankan.'
FROM erp_ingredients
WHERE active = true AND lower(btrim(name)) = 'bawang putih';
