CREATE TABLE IF NOT EXISTS erp_waste (
  id serial PRIMARY KEY,
  date date NOT NULL,
  ingredient_id integer REFERENCES erp_ingredients(id) ON DELETE RESTRICT,
  preparation_id integer REFERENCES erp_preparations(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL DEFAULT '0',
  unit text NOT NULL,
  unit_cost numeric(14,2) NOT NULL DEFAULT '0',
  total_cost numeric(14,2) NOT NULL DEFAULT '0',
  reason text NOT NULL,
  note text
);
CREATE INDEX IF NOT EXISTS erp_waste_date_idx ON erp_waste(date);

CREATE TABLE IF NOT EXISTS erp_operating_expenses (
  id serial PRIMARY KEY,
  date date NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT '0',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS erp_operating_expenses_date_idx ON erp_operating_expenses(date);
