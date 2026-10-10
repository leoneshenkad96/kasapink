import { pgTable, index, foreignKey, serial, date, integer, text, numeric, timestamp, uniqueIndex, boolean, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const erpUserRole = pgEnum("erp_user_role", ['admin', 'testing', 'user'])


export const erpPreparationStockMovements = pgTable("erp_preparation_stock_movements", {
	id: serial().primaryKey().notNull(),
	date: date().notNull(),
	preparationId: integer("preparation_id").notNull(),
	movementType: text("movement_type").notNull(),
	quantityDelta: numeric("quantity_delta", { precision: 14, scale:  3 }).notNull(),
	stockBefore: numeric("stock_before", { precision: 14, scale:  3 }).default('0').notNull(),
	stockAfter: numeric("stock_after", { precision: 14, scale:  3 }).default('0').notNull(),
	unitCost: numeric("unit_cost", { precision: 14, scale:  2 }).default('0').notNull(),
	referenceId: integer("reference_id"),
	note: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("erp_prep_stock_movements_preparation_date_idx").using("btree", table.preparationId.asc().nullsLast().op("int4_ops"), table.date.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.preparationId],
			foreignColumns: [erpPreparations.id],
			name: "erp_preparation_stock_movements_preparation_id_erp_preparations"
		}).onDelete("restrict"),
]);

export const erpOperatingExpenses = pgTable("erp_operating_expenses", {
	id: serial().primaryKey().notNull(),
	date: date().notNull(),
	category: text().notNull(),
	description: text().notNull(),
	amount: numeric({ precision: 14, scale:  2 }).default('0').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("erp_operating_expenses_date_idx").using("btree", table.date.asc().nullsLast().op("date_ops")),
]);

export const erpPreparationRecipeItems = pgTable("erp_preparation_recipe_items", {
	id: serial().primaryKey().notNull(),
	preparationId: integer("preparation_id").notNull(),
	ingredientId: integer("ingredient_id").notNull(),
	qtyRequired: numeric("qty_required", { precision: 14, scale:  3 }).default('0').notNull(),
	recipeUnit: text("recipe_unit").notNull(),
	conversionFactor: numeric("conversion_factor", { precision: 14, scale:  6 }).default('1').notNull(),
}, (table) => [
	uniqueIndex("erp_prep_recipe_preparation_ingredient_unique").using("btree", table.preparationId.asc().nullsLast().op("int4_ops"), table.ingredientId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.preparationId],
			foreignColumns: [erpPreparations.id],
			name: "erp_preparation_recipe_items_preparation_id_erp_preparations_id"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [erpIngredients.id],
			name: "erp_preparation_recipe_items_ingredient_id_erp_ingredients_id_f"
		}).onDelete("restrict"),
]);

export const erpIngredients = pgTable("erp_ingredients", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	category: text().notNull(),
	stockType: text("stock_type").default('Makanan').notNull(),
	unit: text().notNull(),
	stock: numeric({ precision: 14, scale:  3 }).default('0').notNull(),
	minStock: numeric("min_stock", { precision: 14, scale:  3 }).default('0').notNull(),
	lastPrice: numeric("last_price", { precision: 14, scale:  2 }).default('0').notNull(),
	averageCost: numeric("average_cost", { precision: 14, scale:  2 }).default('0').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("erp_ingredients_name_unique").using("btree", table.name.asc().nullsLast().op("text_ops")),
]);

export const erpProducts = pgTable("erp_products", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	sellingPrice: numeric("selling_price", { precision: 14, scale:  2 }).default('0').notNull(),
	businessType: text("business_type").default('Makanan').notNull(),
	needsRecipe: boolean("needs_recipe").default(true).notNull(),
	stock: numeric({ precision: 14, scale:  3 }).default('0').notNull(),
	averageCost: numeric("average_cost", { precision: 14, scale:  2 }).default('0').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("erp_products_name_unique").using("btree", table.name.asc().nullsLast().op("text_ops")),
]);

export const erpProductPreparationItems = pgTable("erp_product_preparation_items", {
	id: serial().primaryKey().notNull(),
	productId: integer("product_id").notNull(),
	preparationId: integer("preparation_id").notNull(),
	qtyRequired: numeric("qty_required", { precision: 14, scale:  3 }).default('0').notNull(),
	recipeUnit: text("recipe_unit").notNull(),
	conversionFactor: numeric("conversion_factor", { precision: 14, scale:  6 }).default('1').notNull(),
}, (table) => [
	uniqueIndex("erp_product_preparation_unique").using("btree", table.productId.asc().nullsLast().op("int4_ops"), table.preparationId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [erpProducts.id],
			name: "erp_product_preparation_items_product_id_erp_products_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.preparationId],
			foreignColumns: [erpPreparations.id],
			name: "erp_product_preparation_items_preparation_id_erp_preparations_i"
		}).onDelete("restrict"),
]);

export const erpPurchaseDetails = pgTable("erp_purchase_details", {
	id: serial().primaryKey().notNull(),
	purchaseId: integer("purchase_id").notNull(),
	ingredientId: integer("ingredient_id").notNull(),
	quantity: numeric({ precision: 14, scale:  3 }).default('0').notNull(),
	totalCost: numeric("total_cost", { precision: 14, scale:  2 }).default('0').notNull(),
	unitCost: numeric("unit_cost", { precision: 14, scale:  2 }).default('0').notNull(),
}, (table) => [
	foreignKey({
			columns: [table.purchaseId],
			foreignColumns: [erpPurchases.id],
			name: "erp_purchase_details_purchase_id_erp_purchases_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [erpIngredients.id],
			name: "erp_purchase_details_ingredient_id_erp_ingredients_id_fk"
		}).onDelete("restrict"),
]);

export const erpRecipeItems = pgTable("erp_recipe_items", {
	id: serial().primaryKey().notNull(),
	productId: integer("product_id").notNull(),
	ingredientId: integer("ingredient_id").notNull(),
	qtyRequired: numeric("qty_required", { precision: 14, scale:  3 }).default('0').notNull(),
	recipeUnit: text("recipe_unit").notNull(),
	conversionFactor: numeric("conversion_factor", { precision: 14, scale:  6 }).default('1').notNull(),
}, (table) => [
	uniqueIndex("erp_recipe_product_ingredient_unique").using("btree", table.productId.asc().nullsLast().op("int4_ops"), table.ingredientId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [erpProducts.id],
			name: "erp_recipe_items_product_id_erp_products_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [erpIngredients.id],
			name: "erp_recipe_items_ingredient_id_erp_ingredients_id_fk"
		}).onDelete("restrict"),
]);

export const erpSalesDetails = pgTable("erp_sales_details", {
	id: serial().primaryKey().notNull(),
	salesId: integer("sales_id").notNull(),
	productId: integer("product_id").notNull(),
	productName: text("product_name").notNull(),
	quantity: integer().notNull(),
	unitPrice: numeric("unit_price", { precision: 14, scale:  2 }).default('0').notNull(),
	revenue: numeric({ precision: 14, scale:  2 }).default('0').notNull(),
	costOfGoodsSold: numeric("cost_of_goods_sold", { precision: 14, scale:  2 }).default('0').notNull(),
}, (table) => [
	foreignKey({
			columns: [table.salesId],
			foreignColumns: [erpSales.id],
			name: "erp_sales_details_sales_id_erp_sales_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [erpProducts.id],
			name: "erp_sales_details_product_id_erp_products_id_fk"
		}).onDelete("restrict"),
]);

export const erpSales = pgTable("erp_sales", {
	id: serial().primaryKey().notNull(),
	date: date().notNull(),
	totalRevenue: numeric("total_revenue", { precision: 14, scale:  2 }).default('0').notNull(),
	totalCostOfGoodsSold: numeric("total_cost_of_goods_sold", { precision: 14, scale:  2 }).default('0').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("erp_sales_date_idx").using("btree", table.date.asc().nullsLast().op("date_ops")),
]);

export const erpUsers = pgTable("erp_users", {
	id: serial().primaryKey().notNull(),
	username: text().notNull(),
	passwordHash: text("password_hash").notNull(),
	role: erpUserRole().default('testing').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("erp_users_username_unique").using("btree", table.username.asc().nullsLast().op("text_ops")),
]);

export const erpPreparations = pgTable("erp_preparations", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	unit: text().notNull(),
	yieldQty: numeric("yield_qty", { precision: 14, scale:  3 }).default('0').notNull(),
	stock: numeric({ precision: 14, scale:  3 }).default('0').notNull(),
	averageCost: numeric("average_cost", { precision: 14, scale:  2 }).default('0').notNull(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("erp_preparations_name_unique").using("btree", table.name.asc().nullsLast().op("text_ops")),
]);

export const erpPreparationBatches = pgTable("erp_preparation_batches", {
	id: serial().primaryKey().notNull(),
	preparationId: integer("preparation_id").notNull(),
	batchNumber: text("batch_number").notNull(),
	date: date().notNull(),
	targetQty: numeric("target_qty", { precision: 14, scale:  3 }).default('0').notNull(),
	actualQty: numeric("actual_qty", { precision: 14, scale:  3 }).default('0').notNull(),
	totalCost: numeric("total_cost", { precision: 14, scale:  2 }).default('0').notNull(),
	unitCost: numeric("unit_cost", { precision: 14, scale:  2 }).default('0').notNull(),
	yieldPercentage: numeric("yield_percentage", { precision: 8, scale:  3 }).default('0').notNull(),
	status: text().default('PRODUCED').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("erp_preparation_batches_batch_number_unique").using("btree", table.batchNumber.asc().nullsLast().op("text_ops")),
	index("erp_preparation_batches_preparation_date_idx").using("btree", table.preparationId.asc().nullsLast().op("int4_ops"), table.date.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.preparationId],
			foreignColumns: [erpPreparations.id],
			name: "erp_preparation_batches_preparation_id_erp_preparations_id_fk"
		}).onDelete("restrict"),
]);

export const erpPurchases = pgTable("erp_purchases", {
	id: serial().primaryKey().notNull(),
	date: date().notNull(),
	supplierType: text("supplier_type").notNull(),
	totalCost: numeric("total_cost", { precision: 14, scale:  2 }).default('0').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("erp_purchases_date_idx").using("btree", table.date.asc().nullsLast().op("date_ops")),
]);

export const erpStockMovements = pgTable("erp_stock_movements", {
	id: serial().primaryKey().notNull(),
	date: date().notNull(),
	ingredientId: integer("ingredient_id").notNull(),
	movementType: text("movement_type").notNull(),
	quantityDelta: numeric("quantity_delta", { precision: 14, scale:  3 }).notNull(),
	stockBefore: numeric("stock_before", { precision: 14, scale:  3 }).default('0').notNull(),
	stockAfter: numeric("stock_after", { precision: 14, scale:  3 }).default('0').notNull(),
	unitCost: numeric("unit_cost", { precision: 14, scale:  2 }).default('0').notNull(),
	referenceId: integer("reference_id"),
	note: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("erp_stock_movements_ingredient_date_idx").using("btree", table.ingredientId.asc().nullsLast().op("int4_ops"), table.date.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [erpIngredients.id],
			name: "erp_stock_movements_ingredient_id_erp_ingredients_id_fk"
		}).onDelete("restrict"),
]);

export const erpWaste = pgTable("erp_waste", {
	id: serial().primaryKey().notNull(),
	date: date().notNull(),
	ingredientId: integer("ingredient_id"),
	preparationId: integer("preparation_id"),
	quantity: numeric({ precision: 14, scale:  3 }).default('0').notNull(),
	unit: text().notNull(),
	unitCost: numeric("unit_cost", { precision: 14, scale:  2 }).default('0').notNull(),
	totalCost: numeric("total_cost", { precision: 14, scale:  2 }).default('0').notNull(),
	reason: text().notNull(),
	note: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("erp_waste_date_idx").using("btree", table.date.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [erpIngredients.id],
			name: "erp_waste_ingredient_id_erp_ingredients_id_fk"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.preparationId],
			foreignColumns: [erpPreparations.id],
			name: "erp_waste_preparation_id_erp_preparations_id_fk"
		}).onDelete("restrict"),
]);
