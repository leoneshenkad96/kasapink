CREATE TABLE IF NOT EXISTS "erp_recipe_versions" (
  "id" serial PRIMARY KEY,
  "scope" text NOT NULL,
  "parent_id" integer NOT NULL,
  "version" integer NOT NULL,
  "effective_at" timestamp with time zone NOT NULL DEFAULT now(),
  "snapshot" text NOT NULL,
  "created_by" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "erp_recipe_versions_parent_idx" ON "erp_recipe_versions" ("scope", "parent_id", "version");
