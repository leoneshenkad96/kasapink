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
      .notNull()
      .references(() => ingredientsTable.id, { onDelete: "restrict" }),
    qtyRequired: quantity("qty_required"),
    recipeUnit: text("recipe_unit").notNull(),
    conversionFactor: numeric("conversion_factor", { precision: 14, scale: 6 }).notNull().default("1"),
  },
  (table) => [
    uniqueIndex("erp_recipe_product_ingredient_unique").on(
      table.productId,
      table.ingredientId,
    ),
  ],
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
