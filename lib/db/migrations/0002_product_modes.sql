-- Add product type and inventory/cost fields. Existing products default to recipe-based.
ALTER TABLE erp_products
  ADD COLUMN IF NOT EXISTS needs_recipe boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stock numeric(14, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_cost numeric(14, 2) NOT NULL DEFAULT 0;
