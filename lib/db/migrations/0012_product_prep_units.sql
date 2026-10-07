ALTER TABLE erp_product_preparation_items
  ADD COLUMN IF NOT EXISTS conversion_factor numeric(14,6) NOT NULL DEFAULT '1';
