-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."erp_user_role" AS ENUM('admin', 'testing', 'user');--> statement-breakpoint
CREATE TABLE "erp_preparation_stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"preparation_id" integer NOT NULL,
	"movement_type" text NOT NULL,
	"quantity_delta" numeric(14, 3) NOT NULL,
	"stock_before" numeric(14, 3) DEFAULT '0' NOT NULL,
	"stock_after" numeric(14, 3) DEFAULT '0' NOT NULL,
	"unit_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reference_id" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_operating_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_preparation_recipe_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"preparation_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"qty_required" numeric(14, 3) DEFAULT '0' NOT NULL,
	"recipe_unit" text NOT NULL,
	"conversion_factor" numeric(14, 6) DEFAULT '1' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_ingredients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"stock_type" text DEFAULT 'Makanan' NOT NULL,
	"unit" text NOT NULL,
	"stock" numeric(14, 3) DEFAULT '0' NOT NULL,
	"min_stock" numeric(14, 3) DEFAULT '0' NOT NULL,
	"last_price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"average_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"selling_price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"business_type" text DEFAULT 'Makanan' NOT NULL,
	"needs_recipe" boolean DEFAULT true NOT NULL,
	"stock" numeric(14, 3) DEFAULT '0' NOT NULL,
	"average_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_product_preparation_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"preparation_id" integer NOT NULL,
	"qty_required" numeric(14, 3) DEFAULT '0' NOT NULL,
	"recipe_unit" text NOT NULL,
	"conversion_factor" numeric(14, 6) DEFAULT '1' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_purchase_details" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"total_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"unit_cost" numeric(14, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_recipe_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"qty_required" numeric(14, 3) DEFAULT '0' NOT NULL,
	"recipe_unit" text NOT NULL,
	"conversion_factor" numeric(14, 6) DEFAULT '1' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_sales_details" (
	"id" serial PRIMARY KEY NOT NULL,
	"sales_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"revenue" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cost_of_goods_sold" numeric(14, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"total_revenue" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_cost_of_goods_sold" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "erp_user_role" DEFAULT 'testing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_preparations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"yield_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"stock" numeric(14, 3) DEFAULT '0' NOT NULL,
	"average_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_preparation_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"preparation_id" integer NOT NULL,
	"batch_number" text NOT NULL,
	"date" date NOT NULL,
	"target_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"actual_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"total_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"unit_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"yield_percentage" numeric(8, 3) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'PRODUCED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"supplier_type" text NOT NULL,
	"total_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"ingredient_id" integer NOT NULL,
	"movement_type" text NOT NULL,
	"quantity_delta" numeric(14, 3) NOT NULL,
	"stock_before" numeric(14, 3) DEFAULT '0' NOT NULL,
	"stock_after" numeric(14, 3) DEFAULT '0' NOT NULL,
	"unit_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reference_id" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_waste" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"ingredient_id" integer,
	"preparation_id" integer,
	"quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"unit" text NOT NULL,
	"unit_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp_preparation_stock_movements" ADD CONSTRAINT "erp_preparation_stock_movements_preparation_id_erp_preparations" FOREIGN KEY ("preparation_id") REFERENCES "public"."erp_preparations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_preparation_recipe_items" ADD CONSTRAINT "erp_preparation_recipe_items_preparation_id_erp_preparations_id" FOREIGN KEY ("preparation_id") REFERENCES "public"."erp_preparations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_preparation_recipe_items" ADD CONSTRAINT "erp_preparation_recipe_items_ingredient_id_erp_ingredients_id_f" FOREIGN KEY ("ingredient_id") REFERENCES "public"."erp_ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_product_preparation_items" ADD CONSTRAINT "erp_product_preparation_items_product_id_erp_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."erp_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_product_preparation_items" ADD CONSTRAINT "erp_product_preparation_items_preparation_id_erp_preparations_i" FOREIGN KEY ("preparation_id") REFERENCES "public"."erp_preparations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_purchase_details" ADD CONSTRAINT "erp_purchase_details_purchase_id_erp_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."erp_purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_purchase_details" ADD CONSTRAINT "erp_purchase_details_ingredient_id_erp_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."erp_ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_recipe_items" ADD CONSTRAINT "erp_recipe_items_product_id_erp_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."erp_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_recipe_items" ADD CONSTRAINT "erp_recipe_items_ingredient_id_erp_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."erp_ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_sales_details" ADD CONSTRAINT "erp_sales_details_sales_id_erp_sales_id_fk" FOREIGN KEY ("sales_id") REFERENCES "public"."erp_sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_sales_details" ADD CONSTRAINT "erp_sales_details_product_id_erp_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."erp_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_preparation_batches" ADD CONSTRAINT "erp_preparation_batches_preparation_id_erp_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."erp_preparations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_stock_movements" ADD CONSTRAINT "erp_stock_movements_ingredient_id_erp_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."erp_ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_waste" ADD CONSTRAINT "erp_waste_ingredient_id_erp_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."erp_ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_waste" ADD CONSTRAINT "erp_waste_preparation_id_erp_preparations_id_fk" FOREIGN KEY ("preparation_id") REFERENCES "public"."erp_preparations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "erp_prep_stock_movements_preparation_date_idx" ON "erp_preparation_stock_movements" USING btree ("preparation_id" int4_ops,"date" date_ops);--> statement-breakpoint
CREATE INDEX "erp_operating_expenses_date_idx" ON "erp_operating_expenses" USING btree ("date" date_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "erp_prep_recipe_preparation_ingredient_unique" ON "erp_preparation_recipe_items" USING btree ("preparation_id" int4_ops,"ingredient_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "erp_ingredients_name_unique" ON "erp_ingredients" USING btree ("name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "erp_products_name_unique" ON "erp_products" USING btree ("name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "erp_product_preparation_unique" ON "erp_product_preparation_items" USING btree ("product_id" int4_ops,"preparation_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "erp_recipe_product_ingredient_unique" ON "erp_recipe_items" USING btree ("product_id" int4_ops,"ingredient_id" int4_ops);--> statement-breakpoint
CREATE INDEX "erp_sales_date_idx" ON "erp_sales" USING btree ("date" date_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "erp_users_username_unique" ON "erp_users" USING btree ("username" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "erp_preparations_name_unique" ON "erp_preparations" USING btree ("name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "erp_preparation_batches_batch_number_unique" ON "erp_preparation_batches" USING btree ("batch_number" text_ops);--> statement-breakpoint
CREATE INDEX "erp_preparation_batches_preparation_date_idx" ON "erp_preparation_batches" USING btree ("preparation_id" int4_ops,"date" date_ops);--> statement-breakpoint
CREATE INDEX "erp_purchases_date_idx" ON "erp_purchases" USING btree ("date" date_ops);--> statement-breakpoint
CREATE INDEX "erp_stock_movements_ingredient_date_idx" ON "erp_stock_movements" USING btree ("ingredient_id" int4_ops,"date" date_ops);--> statement-breakpoint
CREATE INDEX "erp_waste_date_idx" ON "erp_waste" USING btree ("date" date_ops);
*/
