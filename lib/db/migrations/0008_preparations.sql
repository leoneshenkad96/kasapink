CREATE TABLE IF NOT EXISTS erp_preparations (
  id serial PRIMARY KEY,
  name text NOT NULL,
  unit text NOT NULL,
  stock numeric(14,3) NOT NULL DEFAULT '0',
  average_cost numeric(14,2) NOT NULL DEFAULT '0',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS erp_preparations_name_unique ON erp_preparations(name);

CREATE TABLE IF NOT EXISTS erp_preparation_recipe_items (
  id serial PRIMARY KEY,
  preparation_id integer NOT NULL REFERENCES erp_preparations(id) ON DELETE CASCADE,
  ingredient_id integer NOT NULL REFERENCES erp_ingredients(id) ON DELETE RESTRICT,
  qty_required numeric(14,3) NOT NULL DEFAULT '0',
  recipe_unit text NOT NULL,
  conversion_factor numeric(14,6) NOT NULL DEFAULT '1'
);
CREATE UNIQUE INDEX IF NOT EXISTS erp_prep_recipe_preparation_ingredient_unique
  ON erp_preparation_recipe_items(preparation_id, ingredient_id);

CREATE TABLE IF NOT EXISTS erp_preparation_batches (
  id serial PRIMARY KEY,
  preparation_id integer NOT NULL REFERENCES erp_preparations(id) ON DELETE RESTRICT,
  batch_number text NOT NULL,
  date date NOT NULL,
  target_qty numeric(14,3) NOT NULL DEFAULT '0',
  actual_qty numeric(14,3) NOT NULL DEFAULT '0',
  total_cost numeric(14,2) NOT NULL DEFAULT '0',
  unit_cost numeric(14,2) NOT NULL DEFAULT '0',
  yield_percentage numeric(8,3) NOT NULL DEFAULT '0',
  status text NOT NULL DEFAULT 'PRODUCED',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS erp_preparation_batches_batch_number_unique
  ON erp_preparation_batches(batch_number);
CREATE INDEX IF NOT EXISTS erp_preparation_batches_preparation_date_idx
  ON erp_preparation_batches(preparation_id, date);

CREATE TABLE IF NOT EXISTS erp_preparation_stock_movements (
  id serial PRIMARY KEY,
  date date NOT NULL,
  preparation_id integer NOT NULL REFERENCES erp_preparations(id) ON DELETE RESTRICT,
  movement_type text NOT NULL,
  quantity_delta numeric(14,3) NOT NULL,
  stock_before numeric(14,3) NOT NULL DEFAULT '0',
  stock_after numeric(14,3) NOT NULL DEFAULT '0',
  unit_cost numeric(14,2) NOT NULL DEFAULT '0',
  reference_id integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS erp_prep_stock_movements_preparation_date_idx
  ON erp_preparation_stock_movements(preparation_id, date);
