ALTER TABLE erp_preparations
  ADD COLUMN IF NOT EXISTS yield_qty numeric(14,3) NOT NULL DEFAULT '1';
