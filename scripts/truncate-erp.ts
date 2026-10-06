// scripts/truncate-erp.ts
// import "dotenv/config";  // removed – not needed for script
import { db } from "@workspace/db";
import {
  ingredientsTable,
  productsTable,
  recipeItemsTable,
  purchasesTable,
  purchaseDetailsTable,
  salesTable,
  salesDetailsTable,
  stockMovementsTable,
} from "@workspace/db";

async function truncateAll() {
  // Delete in order to satisfy foreign‑key constraints
  await db.delete(stockMovementsTable).execute();
  await db.delete(purchaseDetailsTable).execute();
  await db.delete(salesDetailsTable).execute();
  await db.delete(recipeItemsTable).execute();
  await db.delete(purchasesTable).execute();
  await db.delete(salesTable).execute();
  await db.delete(productsTable).execute();
  await db.delete(ingredientsTable).execute();

  console.log("✅ All ERP tables have been emptied.");
  process.exit(0);
}

truncateAll().catch((e) => {
  console.error("❌ Truncate failed:", e);
  process.exit(1);
});
