-- Freeze the business line on each sale line so reports do not change when a
-- product is edited later. Existing rows use the best information available:
-- the product's current business line at migration time.
ALTER TABLE erp_sales_details
  ADD COLUMN IF NOT EXISTS business_type text;

UPDATE erp_sales_details sd
SET business_type = p.business_type
FROM erp_products p
WHERE sd.product_id = p.id
  AND sd.business_type IS NULL;

UPDATE erp_sales_details
SET business_type = 'Makanan'
WHERE business_type IS NULL;

ALTER TABLE erp_sales_details
  ALTER COLUMN business_type SET DEFAULT 'Makanan',
  ALTER COLUMN business_type SET NOT NULL;

ALTER TABLE erp_sales_details
  DROP CONSTRAINT IF EXISTS erp_sales_details_business_type_check;
ALTER TABLE erp_sales_details
  ADD CONSTRAINT erp_sales_details_business_type_check
  CHECK (business_type IN ('Makanan', 'Parfum'));

CREATE INDEX IF NOT EXISTS erp_sales_details_business_type_idx
  ON erp_sales_details(business_type);

-- Expenses must say whether they belong directly to one business or are shared.
-- Historical expenses become shared because their original owner is unknowable.
ALTER TABLE erp_operating_expenses
  ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'Bersama';

ALTER TABLE erp_operating_expenses
  DROP CONSTRAINT IF EXISTS erp_operating_expenses_business_type_check;
ALTER TABLE erp_operating_expenses
  ADD CONSTRAINT erp_operating_expenses_business_type_check
  CHECK (business_type IN ('Makanan', 'Parfum', 'Bersama'));

CREATE INDEX IF NOT EXISTS erp_operating_expenses_business_type_date_idx
  ON erp_operating_expenses(business_type, date);
