-- Add a separate business line classification for stock list navigation.
-- Existing stock defaults to Makanan and can be reclassified from the UI.
ALTER TABLE erp_ingredients
  ADD COLUMN IF NOT EXISTS stock_type text NOT NULL DEFAULT 'Makanan';
