import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const money = (name: string) =>
  numeric(name, { precision: 14, scale: 2 }).notNull().default("0");
const quantity = (name: string) =>
  numeric(name, { precision: 14, scale: 3 }).notNull().default("0");

export const ingredientsTable = pgTable(
  "erp_ingredients",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    stockType: text("stock_type").notNull().default("Makanan"),
    unit: text("unit").notNull(),
    yieldQty: quantity("yield_qty"),
    stock: quantity("stock"),
    minStock: quantity("min_stock"),
    lastPrice: money("last_price"),
    averageCost: money("average_cost"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("erp_ingredients_name_unique").on(table.name)],
);

export const productsTable = pgTable(
  "erp_products",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    sellingPrice: money("selling_price"),
    businessType: text("business_type").notNull().default("Makanan"),
    needsRecipe: boolean("needs_recipe").notNull().default(true),
    stock: quantity("stock"),
    averageCost: money("average_cost"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("erp_products_name_unique").on(table.name)],
);

export const recipeItemsTable = pgTable(
  "erp_recipe_items",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    ingredientId: integer("ingredient_id")
      .references(() => ingredientsTable.id, { onDelete: "restrict" }),
    preparationId: integer("preparation_id")
      .references(() => preparationsTable.id, { onDelete: "restrict" }),
    qtyRequired: quantity("qty_required"),
    recipeUnit: text("recipe_unit").notNull(),
    conversionFactor: numeric("conversion_factor", { precision: 14, scale: 6 }).notNull().default("1"),
  },
  (table) => [
    uniqueIndex("erp_recipe_product_ingredient_unique").on(
      table.productId,
      table.ingredientId,
    ),
    uniqueIndex("erp_recipe_product_preparation_unique").on(
      table.productId,
      table.preparationId,
    ),
  ],
);


export const preparationsTable = pgTable(
  "erp_preparations",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    stock: quantity("stock"),
    averageCost: money("average_cost"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("erp_preparations_name_unique").on(table.name)],
);

export const preparationRecipeItemsTable = pgTable(
  "erp_preparation_recipe_items",
  {
    id: serial("id").primaryKey(),
    preparationId: integer("preparation_id").notNull().references(() => preparationsTable.id, { onDelete: "cascade" }),
    ingredientId: integer("ingredient_id").notNull().references(() => ingredientsTable.id, { onDelete: "restrict" }),
    qtyRequired: quantity("qty_required"),
    recipeUnit: text("recipe_unit").notNull(),
    conversionFactor: numeric("conversion_factor", { precision: 14, scale: 6 }).notNull().default("1"),
  },
  (table) => [uniqueIndex("erp_prep_recipe_preparation_ingredient_unique").on(table.preparationId, table.ingredientId)],
);

export const preparationBatchesTable = pgTable(
  "erp_preparation_batches",
  {
    id: serial("id").primaryKey(),
    preparationId: integer("preparation_id").notNull().references(() => preparationsTable.id, { onDelete: "restrict" }),
    batchNumber: text("batch_number").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    targetQty: quantity("target_qty"),
    actualQty: quantity("actual_qty"),
    totalCost: money("total_cost"),
    unitCost: money("unit_cost"),
    yieldPercentage: numeric("yield_percentage", { precision: 8, scale: 3 }).notNull().default("0"),
    status: text("status").notNull().default("PRODUCED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("erp_preparation_batches_batch_number_unique").on(table.batchNumber),
    index("erp_preparation_batches_preparation_date_idx").on(table.preparationId, table.date),
  ],
);

export const preparationStockMovementsTable = pgTable(
  "erp_preparation_stock_movements",
  {
    id: serial("id").primaryKey(),
    date: date("date", { mode: "string" }).notNull(),
    preparationId: integer("preparation_id").notNull().references(() => preparationsTable.id, { onDelete: "restrict" }),
    movementType: text("movement_type").notNull(),
    quantityDelta: numeric("quantity_delta", { precision: 14, scale: 3 }).notNull(),
    stockBefore: quantity("stock_before"),
    stockAfter: quantity("stock_after"),
    unitCost: money("unit_cost"),
    referenceId: integer("reference_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("erp_prep_stock_movements_preparation_date_idx").on(table.preparationId, table.date)],
);


export const productPreparationItemsTable = pgTable(
  "erp_product_preparation_items",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
    preparationId: integer("preparation_id").notNull().references(() => preparationsTable.id, { onDelete: "restrict" }),
    qtyRequired: quantity("qty_required"),
    recipeUnit: text("recipe_unit").notNull(),
    conversionFactor: numeric("conversion_factor", { precision: 14, scale: 6 }).notNull().default("1"),
  },
  (table) => [uniqueIndex("erp_product_preparation_unique").on(table.productId, table.preparationId)],
);


export const wasteTable = pgTable(
  "erp_waste",
  {
    id: serial("id").primaryKey(),
    date: date("date", { mode: "string" }).notNull(),
    ingredientId: integer("ingredient_id").references(() => ingredientsTable.id, { onDelete: "restrict" }),
    preparationId: integer("preparation_id").references(() => preparationsTable.id, { onDelete: "restrict" }),
    quantity: quantity("quantity"),
    unit: text("unit").notNull(),
    unitCost: money("unit_cost"),
    totalCost: money("total_cost"),
    reason: text("reason").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("erp_waste_date_idx").on(table.date)],
);

export const operatingExpensesTable = pgTable(
  "erp_operating_expenses",
  {
    id: serial("id").primaryKey(),
    date: date("date", { mode: "string" }).notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    amount: money("amount"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("erp_operating_expenses_date_idx").on(table.date)],
);

export const purchasesTable = pgTable(
  "erp_purchases",
  {
    id: serial("id").primaryKey(),
    date: date("date", { mode: "string" }).notNull(),
    supplierType: text("supplier_type").notNull(),
    totalCost: money("total_cost"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("erp_purchases_date_idx").on(table.date)],
);

export const purchaseDetailsTable = pgTable("erp_purchase_details", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id")
    .notNull()
    .references(() => purchasesTable.id, { onDelete: "cascade" }),
  ingredientId: integer("ingredient_id")
    .notNull()
    .references(() => ingredientsTable.id, { onDelete: "restrict" }),
  quantity: quantity("quantity"),
  totalCost: money("total_cost"),
  unitCost: money("unit_cost"),
});

export const salesTable = pgTable(
  "erp_sales",
  {
    id: serial("id").primaryKey(),
    date: date("date", { mode: "string" }).notNull(),
    totalRevenue: money("total_revenue"),
    totalCostOfGoodsSold: money("total_cost_of_goods_sold"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("erp_sales_date_idx").on(table.date)],
);

export const salesDetailsTable = pgTable("erp_sales_details", {
  id: serial("id").primaryKey(),
  salesId: integer("sales_id")
    .notNull()
    .references(() => salesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "restrict" }),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: money("unit_price"),
  revenue: money("revenue"),
  costOfGoodsSold: money("cost_of_goods_sold"),
});

export const stockMovementsTable = pgTable(
  "erp_stock_movements",
  {
    id: serial("id").primaryKey(),
    date: date("date", { mode: "string" }).notNull(),
    ingredientId: integer("ingredient_id")
      .notNull()
      .references(() => ingredientsTable.id, { onDelete: "restrict" }),
    movementType: text("movement_type").notNull(),
    quantityDelta: numeric("quantity_delta", {
      precision: 14,
      scale: 3,
    }).notNull(),
    stockBefore: quantity("stock_before"),
    stockAfter: quantity("stock_after"),
    unitCost: money("unit_cost"),
    referenceId: integer("reference_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("erp_stock_movements_ingredient_date_idx").on(table.ingredientId, table.date)],
);
