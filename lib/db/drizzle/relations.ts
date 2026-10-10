import { relations } from "drizzle-orm/relations";
import { erpPreparations, erpPreparationStockMovements, erpPreparationRecipeItems, erpIngredients, erpProducts, erpProductPreparationItems, erpPurchases, erpPurchaseDetails, erpRecipeItems, erpSales, erpSalesDetails, erpPreparationBatches, erpStockMovements, erpWaste } from "./schema";

export const erpPreparationStockMovementsRelations = relations(erpPreparationStockMovements, ({one}) => ({
	erpPreparation: one(erpPreparations, {
		fields: [erpPreparationStockMovements.preparationId],
		references: [erpPreparations.id]
	}),
}));

export const erpPreparationsRelations = relations(erpPreparations, ({many}) => ({
	erpPreparationStockMovements: many(erpPreparationStockMovements),
	erpPreparationRecipeItems: many(erpPreparationRecipeItems),
	erpProductPreparationItems: many(erpProductPreparationItems),
	erpPreparationBatches: many(erpPreparationBatches),
	erpWastes: many(erpWaste),
}));

export const erpPreparationRecipeItemsRelations = relations(erpPreparationRecipeItems, ({one}) => ({
	erpPreparation: one(erpPreparations, {
		fields: [erpPreparationRecipeItems.preparationId],
		references: [erpPreparations.id]
	}),
	erpIngredient: one(erpIngredients, {
		fields: [erpPreparationRecipeItems.ingredientId],
		references: [erpIngredients.id]
	}),
}));

export const erpIngredientsRelations = relations(erpIngredients, ({many}) => ({
	erpPreparationRecipeItems: many(erpPreparationRecipeItems),
	erpPurchaseDetails: many(erpPurchaseDetails),
	erpRecipeItems: many(erpRecipeItems),
	erpStockMovements: many(erpStockMovements),
	erpWastes: many(erpWaste),
}));

export const erpProductPreparationItemsRelations = relations(erpProductPreparationItems, ({one}) => ({
	erpProduct: one(erpProducts, {
		fields: [erpProductPreparationItems.productId],
		references: [erpProducts.id]
	}),
	erpPreparation: one(erpPreparations, {
		fields: [erpProductPreparationItems.preparationId],
		references: [erpPreparations.id]
	}),
}));

export const erpProductsRelations = relations(erpProducts, ({many}) => ({
	erpProductPreparationItems: many(erpProductPreparationItems),
	erpRecipeItems: many(erpRecipeItems),
	erpSalesDetails: many(erpSalesDetails),
}));

export const erpPurchaseDetailsRelations = relations(erpPurchaseDetails, ({one}) => ({
	erpPurchase: one(erpPurchases, {
		fields: [erpPurchaseDetails.purchaseId],
		references: [erpPurchases.id]
	}),
	erpIngredient: one(erpIngredients, {
		fields: [erpPurchaseDetails.ingredientId],
		references: [erpIngredients.id]
	}),
}));

export const erpPurchasesRelations = relations(erpPurchases, ({many}) => ({
	erpPurchaseDetails: many(erpPurchaseDetails),
}));

export const erpRecipeItemsRelations = relations(erpRecipeItems, ({one}) => ({
	erpProduct: one(erpProducts, {
		fields: [erpRecipeItems.productId],
		references: [erpProducts.id]
	}),
	erpIngredient: one(erpIngredients, {
		fields: [erpRecipeItems.ingredientId],
		references: [erpIngredients.id]
	}),
}));

export const erpSalesDetailsRelations = relations(erpSalesDetails, ({one}) => ({
	erpSale: one(erpSales, {
		fields: [erpSalesDetails.salesId],
		references: [erpSales.id]
	}),
	erpProduct: one(erpProducts, {
		fields: [erpSalesDetails.productId],
		references: [erpProducts.id]
	}),
}));

export const erpSalesRelations = relations(erpSales, ({many}) => ({
	erpSalesDetails: many(erpSalesDetails),
}));

export const erpPreparationBatchesRelations = relations(erpPreparationBatches, ({one}) => ({
	erpPreparation: one(erpPreparations, {
		fields: [erpPreparationBatches.preparationId],
		references: [erpPreparations.id]
	}),
}));

export const erpStockMovementsRelations = relations(erpStockMovements, ({one}) => ({
	erpIngredient: one(erpIngredients, {
		fields: [erpStockMovements.ingredientId],
		references: [erpIngredients.id]
	}),
}));

export const erpWasteRelations = relations(erpWaste, ({one}) => ({
	erpIngredient: one(erpIngredients, {
		fields: [erpWaste.ingredientId],
		references: [erpIngredients.id]
	}),
	erpPreparation: one(erpPreparations, {
		fields: [erpWaste.preparationId],
		references: [erpPreparations.id]
	}),
}));