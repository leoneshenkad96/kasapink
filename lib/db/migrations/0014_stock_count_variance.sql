ALTER TABLE erp_stock_movements
  ADD COLUMN IF NOT EXISTS variance_value numeric(14, 2);

ALTER TABLE erp_preparation_stock_movements
  ADD COLUMN IF NOT EXISTS variance_value numeric(14, 2);
