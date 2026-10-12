ALTER TABLE "erp_ingredients"
  ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true;

DROP INDEX IF EXISTS "erp_ingredients_name_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "erp_ingredients_name_unique"
  ON "erp_ingredients" ("name")
  WHERE "active" = true;
