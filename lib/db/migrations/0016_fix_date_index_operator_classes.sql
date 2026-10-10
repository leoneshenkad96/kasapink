-- Date columns must use date_ops in composite btree indexes.
DROP INDEX IF EXISTS erp_prep_stock_movements_preparation_date_idx;
CREATE INDEX erp_prep_stock_movements_preparation_date_idx
  ON erp_preparation_stock_movements USING btree (preparation_id int4_ops, date date_ops);

DROP INDEX IF EXISTS erp_preparation_batches_preparation_date_idx;
CREATE INDEX erp_preparation_batches_preparation_date_idx
  ON erp_preparation_batches USING btree (preparation_id int4_ops, date date_ops);

DROP INDEX IF EXISTS erp_stock_movements_ingredient_date_idx;
CREATE INDEX erp_stock_movements_ingredient_date_idx
  ON erp_stock_movements USING btree (ingredient_id int4_ops, date date_ops);
