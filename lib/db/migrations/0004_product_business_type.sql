-- Separate food and perfume products for product navigation and lists.
-- Existing products default to Makanan and can be reclassified from the UI.
ALTER TABLE erp_products
  ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'Makanan';
