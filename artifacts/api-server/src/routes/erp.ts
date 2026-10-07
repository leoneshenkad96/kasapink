import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import {
  CreateIngredientBody,
  CreateIngredientResponse,
  CreateProductBody,
  CreateProductResponse,
  GetErpStateResponse,
  GetFinanceReportQueryParams,
  GetFinanceReportResponse,
  RecordPurchaseBody,
  RecordPurchaseResponse,
  RecordSaleBody,
  RecordSaleResponse,
  RecordStockCountBody,
  RecordStockCountResponse,
  SaveProductRecipeBody,
  SaveProductRecipeParams,
  SaveProductRecipeResponse,
  UpdateIngredientBody,
  UpdateIngredientParams,
  UpdateIngredientResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
} from "@workspace/api-zod";
import {
  db,
  ingredientsTable,
  productsTable,
  purchaseDetailsTable,
  purchasesTable,
  preparationsTable,
  preparationRecipeItemsTable,
  preparationBatchesTable,
  preparationStockMovementsTable,
  productPreparationItemsTable,
  wasteTable,
  operatingExpensesTable,
  recipeItemsTable,
  salesDetailsTable,
  salesTable,
  stockMovementsTable,
} from "@workspace/db";
import { Router, type IRouter, type Request, type RequestHandler, type Response } from "express";
import { checkRole, requireOperationalRole, verifyToken } from "../lib/auth";

const router: IRouter = Router();
router.use(verifyToken, requireOperationalRole("admin", "user"));

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function safe(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    void handler(req, res).catch((error: unknown) => {
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      req.log.error({ err: error }, "ERP request failed");
      res.status(500).json({ error: "Terjadi kesalahan saat memproses data." });
    });
  };
}

function invalid(res: Response, message: string): void {
  res.status(400).json({ error: message });
}

function requireMaxItems(items: unknown[], max: number, res: Response): boolean {
  if (items.length > max) {
    invalid(res, `Maksimal ${max} item per transaksi.`);
    return false;
  }
  return true;
}

function requireFiniteNumbers(values: Array<number>, res: Response): boolean {
  if (values.some((value) => !Number.isFinite(value))) {
    invalid(res, "Nilai angka harus berupa angka terbatas yang valid.");
    return false;
  }
  return true;
}

function number(value: string | number | null | undefined): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function isOperationalIngredient(category: string): boolean {
  return /mikro|operasional/i.test(category);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dateKey(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function asIngredient(row: typeof ingredientsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    stockType: row.stockType,
    unit: row.unit,
    stock: number(row.stock),
    minStock: number(row.minStock),
    lastPrice: number(row.lastPrice),
    averageCost: number(row.averageCost),
  };
}

function asProduct(row: typeof productsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    sellingPrice: number(row.sellingPrice),
    businessType: row.businessType,
    needsRecipe: row.needsRecipe,
    stock: number(row.stock),
    averageCost: number(row.averageCost),
  };
}

const seedIngredients = [
  ["Beras Liwet", "Bahan Mentah", "kg", 10, 2, 15000],
  ["Ayam", "Bahan Mentah", "kg", 5, 1, 38000],
  ["Jamur", "Bahan Mentah", "kg", 3, 0.5, 25000],
  ["Cabai", "Bahan Mentah", "kg", 1, 0.2, 40000],
  ["Bumbu Dapur", "Bahan Mentah", "gram", 500, 100, 50],
  ["Kulit Pangsit", "Bahan Mentah", "pak", 5, 2, 8000],
  ["Bengkuang", "Bahan Mentah", "kg", 2, 0.5, 12000],
  ["Wortel", "Bahan Mentah", "kg", 2, 0.5, 10000],
  ["Tepung Sagu", "Bahan Mentah", "gram", 1000, 200, 20],
  ["Daun Pisang", "Kemasan", "pack", 10, 2, 5000],
  ["Thinwall", "Kemasan", "pcs", 50, 10, 1000],
  ["Sendok Plastik", "Kemasan", "pcs", 100, 20, 200],
  ["Plastik Tomat", "Kemasan", "kg", 2, 0.5, 25000],
  ["Kerupuk Matang (Pabrik)", "Barang Jadi", "pcs", 100, 20, 1500],
] as const;

const seedProducts = [
  ["Nasi Bakar", 12000],
  ["Sate Jamur", 10000],
  ["Pangsit Goreng", 6000],
  ["Kerupuk Bungkus", 2500],
] as const;

async function ensureSeedData(): Promise<void> {
  await db
    .insert(ingredientsTable)
    .values(
      seedIngredients.map(([name, category, unit, stock, minStock, price]) => ({
        name,
        category,
        unit,
        stock: String(stock),
        minStock: String(minStock),
        lastPrice: String(price),
        averageCost: String(price),
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(productsTable)
    .values(seedProducts.map(([name, sellingPrice]) => ({ name, sellingPrice: String(sellingPrice) })))
    .onConflictDoNothing();

  const kerupuk = await db
    .select({ productId: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.name, "Kerupuk Bungkus"));
  const matang = await db
    .select({ ingredientId: ingredientsTable.id, unit: ingredientsTable.unit })
    .from(ingredientsTable)
    .where(eq(ingredientsTable.name, "Kerupuk Matang (Pabrik)"));

  if (kerupuk[0] && matang[0]) {
    await db
      .insert(recipeItemsTable)
      .values({
        productId: kerupuk[0].productId,
        ingredientId: matang[0].ingredientId,
        qtyRequired: "1",
      })
      .onConflictDoNothing();
  }
}

const UNIT_GROUPS: Record<string, { group: string; factor: number }> = {
  gram: { group: "weight", factor: 1 }, kg: { group: "weight", factor: 1000 },
  ml: { group: "volume", factor: 1 }, liter: { group: "volume", factor: 1000 },
  pcs: { group: "count", factor: 1 }, butir: { group: "count", factor: 1 },
  ekor: { group: "count", factor: 1 }, potong: { group: "count", factor: 1 },
  ikat: { group: "count", factor: 1 }, pack: { group: "count", factor: 1 },
  box: { group: "count", factor: 1 }, botol: { group: "count", factor: 1 },
};
function recipeConversionFactor(recipeUnit: string, stockUnit: string): number | null {
  if (recipeUnit === stockUnit) return 1;
  const recipe = UNIT_GROUPS[recipeUnit], stock = UNIT_GROUPS[stockUnit];
  if (!recipe || !stock || recipe.group !== stock.group) return null;
  return recipe.factor / stock.factor;
}

function jakartaToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function dateRange(startDate: string, endDate: string): string[] {
  if (startDate > endDate) {
    throw new HttpError("Tanggal awal harus sebelum atau sama dengan tanggal akhir.", 400);
  }
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000) {
    throw new HttpError("Rentang laporan maksimal satu tahun.", 400);
  }

  const dates: string[] = [];
  for (const cursor = start; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

async function financeReport(startDate: string, endDate: string) {
  const dates = dateRange(startDate, endDate);
  const [sales, purchases] = await Promise.all([
    db
      .select({
        date: salesTable.date,
        revenue: salesTable.totalRevenue,
        cogs: salesTable.totalCostOfGoodsSold,
      })
      .from(salesTable)
      .where(and(gte(salesTable.date, startDate), lte(salesTable.date, endDate))),
    db
      .select({ date: purchasesTable.date, total: purchasesTable.totalCost })
      .from(purchasesTable)
      .where(and(gte(purchasesTable.date, startDate), lte(purchasesTable.date, endDate))),
  ]);

  const byDate = new Map(
    dates.map((date) => [date, { date, revenue: 0, costOfGoodsSold: 0, purchases: 0, grossProfit: 0 }]),
  );
  for (const row of sales) {
    const day = byDate.get(row.date);
    if (day) {
      day.revenue += number(row.revenue);
      day.costOfGoodsSold += number(row.cogs);
    }
  }
  for (const row of purchases) {
    const day = byDate.get(row.date);
    if (day) day.purchases += number(row.total);
  }
  const days = [...byDate.values()].map((day) => ({
    ...day,
    revenue: roundMoney(day.revenue),
    costOfGoodsSold: roundMoney(day.costOfGoodsSold),
    purchases: roundMoney(day.purchases),
    grossProfit: roundMoney(day.revenue - day.costOfGoodsSold),
  }));

  return {
    startDate,
    endDate,
    revenue: roundMoney(days.reduce((sum, day) => sum + day.revenue, 0)),
    costOfGoodsSold: roundMoney(days.reduce((sum, day) => sum + day.costOfGoodsSold, 0)),
    purchases: roundMoney(days.reduce((sum, day) => sum + day.purchases, 0)),
    grossProfit: roundMoney(days.reduce((sum, day) => sum + day.grossProfit, 0)),
    days,
  };
}

router.get(
  "/erp/state",
  safe(async (_req, res) => {
    // await ensureSeedData();   // disabled – prevents auto‑reseed
    const [ingredientRows, productRows, recipeRows, purchaseHeaders, saleHeaders] = await Promise.all([
      db.select().from(ingredientsTable).orderBy(asc(ingredientsTable.name)),
      db.select().from(productsTable).orderBy(asc(productsTable.name)),
      db
        .select({
          productId: recipeItemsTable.productId,
          ingredientId: recipeItemsTable.ingredientId,
          ingredientName: ingredientsTable.name,
          unit: ingredientsTable.unit,
          qtyRequired: recipeItemsTable.qtyRequired,
          recipeUnit: recipeItemsTable.recipeUnit,
        })
        .from(recipeItemsTable)
        .innerJoin(ingredientsTable, eq(recipeItemsTable.ingredientId, ingredientsTable.id))
        .orderBy(asc(recipeItemsTable.productId), asc(ingredientsTable.name)),
      db
        .select()
        .from(purchasesTable)
        .orderBy(desc(purchasesTable.date), desc(purchasesTable.id))
        .limit(6),
      db
        .select()
        .from(salesTable)
        .orderBy(desc(salesTable.date), desc(salesTable.id))
        .limit(6),
    ]);

    const purchaseIds = purchaseHeaders.map((row) => row.id);
    const saleIds = saleHeaders.map((row) => row.id);
    const purchaseLines = purchaseIds.length
      ? await db
        .select({
          purchaseId: purchaseDetailsTable.purchaseId,
          ingredientId: purchaseDetailsTable.ingredientId,
          ingredientName: ingredientsTable.name,
          unit: ingredientsTable.unit,
          quantity: purchaseDetailsTable.quantity,
          totalCost: purchaseDetailsTable.totalCost,
          unitCost: purchaseDetailsTable.unitCost,
        })
        .from(purchaseDetailsTable)
        .innerJoin(ingredientsTable, eq(purchaseDetailsTable.ingredientId, ingredientsTable.id))
        .where(inArray(purchaseDetailsTable.purchaseId, purchaseIds))
      : [];
    const saleLines = saleIds.length
      ? await db
        .select()
        .from(salesDetailsTable)
        .where(inArray(salesDetailsTable.salesId, saleIds))
      : [];

    const recentPurchases = purchaseHeaders.map((purchase) => ({
      id: purchase.id,
      date: purchase.date,
      supplierType: purchase.supplierType,
      totalCost: number(purchase.totalCost),
      items: purchaseLines
        .filter((line) => line.purchaseId === purchase.id)
        .map((line) => ({
          ingredientId: line.ingredientId,
          ingredientName: line.ingredientName,
          unit: line.unit,
          quantity: number(line.quantity),
          totalCost: number(line.totalCost),
          unitCost: number(line.unitCost),
        })),
    }));
    const recentSales = saleHeaders.map((sale) => {
      const totalRevenue = number(sale.totalRevenue);
      const totalCostOfGoodsSold = number(sale.totalCostOfGoodsSold);
      return {
        id: sale.id,
        date: sale.date,
        totalRevenue,
        totalCostOfGoodsSold,
        grossProfit: roundMoney(totalRevenue - totalCostOfGoodsSold),
        items: saleLines
          .filter((line) => line.salesId === sale.id)
          .map((line) => ({
            productId: line.productId,
            productName: line.productName,
            quantity: line.quantity,
            unitPrice: number(line.unitPrice),
            revenue: number(line.revenue),
            costOfGoodsSold: number(line.costOfGoodsSold),
          })),
      };
    });

    const today = await financeReport(jakartaToday(), jakartaToday());
    const data = {
      ingredients: ingredientRows.map(asIngredient),
      products: productRows.map(asProduct),
      recipes: recipeRows.map((row) => ({
        productId: row.productId,
        ingredientId: row.ingredientId,
        ingredientName: row.ingredientName,
        unit: row.unit,
        qtyRequired: number(row.qtyRequired),
      })),
      recentPurchases,
      recentSales,
      today: today.days[0],
      lowStockCount: ingredientRows.filter((row) => number(row.stock) <= number(row.minStock)).length,
    };
    const validated = GetErpStateResponse.parse(data);
    res.json({
      ...validated,
      recentPurchases: validated.recentPurchases.map((purchase) => ({
        ...purchase,
        date: dateKey(purchase.date),
      })),
      recentSales: validated.recentSales.map((sale) => ({
        ...sale,
        date: dateKey(sale.date),
      })),
      today: { ...validated.today, date: dateKey(validated.today.date) },
    });
  }),
);

router.get(
  "/erp/finance",
  safe(async (req, res) => {
    const parsed = GetFinanceReportQueryParams.safeParse({
      startDate: new Date(String(req.query.startDate ?? "")),
      endDate: new Date(String(req.query.endDate ?? "")),
    });
    if (!parsed.success) {
      invalid(res, parsed.error.message);
      return;
    }
    const data = await financeReport(dateKey(parsed.data.startDate), dateKey(parsed.data.endDate));
    const validated = GetFinanceReportResponse.parse(data);
    res.json({
      ...validated,
      startDate: dateKey(validated.startDate),
      endDate: dateKey(validated.endDate),
      days: validated.days.map((day) => ({ ...day, date: dateKey(day.date) })),
    });
  }),
);

router.post(
  "/erp/ingredients",
  safe(async (req, res) => {
    const parsed = CreateIngredientBody.safeParse(req.body);
    if (!parsed.success) {
      invalid(res, parsed.error.message);
      return;
    }
    if (!requireFiniteNumbers([parsed.data.stock, parsed.data.minStock], res)) return;
    const [row] = await db
      .insert(ingredientsTable)
      .values({
        ...parsed.data,
        stock: String(parsed.data.stock),
        minStock: String(parsed.data.minStock),
        lastPrice: "0",
        averageCost: "0",
      })
      .returning();
    res.status(201).json(CreateIngredientResponse.parse(asIngredient(row)));
  }),
);

router.patch(
  "/erp/ingredients/:ingredientId",
  safe(async (req, res) => {
    const params = UpdateIngredientParams.safeParse(req.params);
    const body = UpdateIngredientBody.safeParse(req.body);
    if (!params.success) {
      invalid(res, params.error.message);
      return;
    }
    if (!body.success) {
      invalid(res, body.error.message);
      return;
    }
    if (Object.keys(body.data).length === 0) {
      invalid(res, "Isi setidaknya satu kolom yang ingin diubah.");
      return;
    }
    if (!requireFiniteNumbers([body.data.minStock ?? 0], res)) return;
    const update: {
      name?: string;
      category?: string;
      stockType?: "Makanan" | "Parfum";
      unit?: string;
      minStock?: string;
    } = {};
    if (body.data.name !== undefined) update.name = body.data.name;
    if (body.data.category !== undefined) update.category = body.data.category;
    if (body.data.stockType !== undefined) update.stockType = body.data.stockType;
    if (body.data.unit !== undefined) update.unit = body.data.unit;
    if (body.data.minStock !== undefined) update.minStock = String(body.data.minStock);
    const [row] = await db
      .update(ingredientsTable)
      .set(update)
      .where(eq(ingredientsTable.id, params.data.ingredientId))
      .returning();
    if (!row) throw new HttpError("Bahan tidak ditemukan.", 404);
    res.json(UpdateIngredientResponse.parse(asIngredient(row)));
  }),
);

router.post(
  "/erp/products",
  safe(async (req, res) => {
    const parsed = CreateProductBody.safeParse(req.body);
    if (!parsed.success) {
      invalid(res, parsed.error.message);
      return;
    }
    if (!parsed.data.needsRecipe && parsed.data.autoRecipeIngredientId !== undefined) {
      invalid(res, "Auto-resep hanya dapat dipakai pada Produk Olahan.");
      return;
    }
    if (!requireFiniteNumbers([parsed.data.sellingPrice, parsed.data.stock, parsed.data.averageCost], res)) return;
    const row = await db.transaction(async (tx) => {
      if (parsed.data.autoRecipeIngredientId !== undefined) {
        const [ingredient] = await tx
          .select({ id: ingredientsTable.id, category: ingredientsTable.category })
          .from(ingredientsTable)
          .where(eq(ingredientsTable.id, parsed.data.autoRecipeIngredientId));
        if (!ingredient) throw new HttpError("Bahan untuk auto-resep tidak ditemukan.", 400);
        if (isOperationalIngredient(ingredient.category)) {
          throw new HttpError("Pilih bahan makro; bahan berkategori Mikro/Operasional tidak masuk resep.", 400);
        }
      }
      const [product] = await tx
        .insert(productsTable)
        .values({
          name: parsed.data.name,
          sellingPrice: String(parsed.data.sellingPrice),
          businessType: parsed.data.businessType,
          needsRecipe: parsed.data.needsRecipe,
          stock: String(parsed.data.needsRecipe ? 0 : parsed.data.stock),
          averageCost: String(parsed.data.needsRecipe ? 0 : parsed.data.averageCost),
        })
        .returning();
      if (parsed.data.autoRecipeIngredientId !== undefined) {
        const [ingredient] = await tx
          .select({ unit: ingredientsTable.unit })
          .from(ingredientsTable)
          .where(eq(ingredientsTable.id, parsed.data.autoRecipeIngredientId));
        if (!ingredient) throw new HttpError("Bahan resep tidak ditemukan.", 400);
        await tx.insert(recipeItemsTable).values({
          productId: product.id,
          ingredientId: parsed.data.autoRecipeIngredientId,
          qtyRequired: "1",
          recipeUnit: ingredient.unit,
          conversionFactor: "1",
        });
      }
      return product;
    });
    res.status(201).json(CreateProductResponse.parse(asProduct(row)));
  }),
);

router.patch(
  "/erp/products/:productId",
  safe(async (req, res) => {
    const params = UpdateProductParams.safeParse(req.params);
    const body = UpdateProductBody.safeParse(req.body);
    if (!params.success) {
      invalid(res, params.error.message);
      return;
    }
    if (!body.success) {
      invalid(res, body.error.message);
      return;
    }
    if (Object.keys(body.data).length === 0) {
      invalid(res, "Isi setidaknya satu kolom yang ingin diubah.");
      return;
    }
    if (!requireFiniteNumbers([
      body.data.sellingPrice ?? 0,
      body.data.stock ?? 0,
      body.data.averageCost ?? 0,
    ], res)) return;
    const update: {
      name?: string;
      sellingPrice?: string;
      businessType?: "Makanan" | "Parfum";
      needsRecipe?: boolean;
      stock?: string;
      averageCost?: string;
    } = {};
    if (body.data.name !== undefined) update.name = body.data.name;
    if (body.data.sellingPrice !== undefined) update.sellingPrice = String(body.data.sellingPrice);
    if (body.data.businessType !== undefined) update.businessType = body.data.businessType;
    if (body.data.needsRecipe !== undefined) update.needsRecipe = body.data.needsRecipe;
    if (body.data.stock !== undefined) update.stock = String(body.data.stock);
    if (body.data.averageCost !== undefined) update.averageCost = String(body.data.averageCost);
    const [row] = await db
      .update(productsTable)
      .set(update)
      .where(eq(productsTable.id, params.data.productId))
      .returning();
    if (!row) throw new HttpError("Produk tidak ditemukan.", 404);
    res.json(UpdateProductResponse.parse(asProduct(row)));
  }),
);

router.put(
  "/erp/products/:productId/recipe",
  safe(async (req, res) => {
    const params = SaveProductRecipeParams.safeParse(req.params);
    const body = SaveProductRecipeBody.safeParse(req.body);
    if (!params.success) {
      invalid(res, params.error.message);
      return;
    }
    if (!body.success) {
      invalid(res, body.error.message);
      return;
    }
    if (!requireMaxItems(body.data.items, 100, res)) return;
    if (!requireFiniteNumbers(body.data.items.flatMap((item) => [item.ingredientId, item.qtyRequired]), res)) return;
    const ids = body.data.items.map((item) => item.ingredientId);
    if (new Set(ids).size !== ids.length) {
      invalid(res, "Bahan yang sama hanya boleh ditambahkan satu kali ke resep.");
      return;
    }

    const saved = await db.transaction(async (tx) => {
      const [product] = await tx
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(eq(productsTable.id, params.data.productId))
        .for("update");
      if (!product) throw new HttpError("Produk tidak ditemukan.", 404);
      if (ids.length) {
        const rows = await tx
          .select({ id: ingredientsTable.id, category: ingredientsTable.category })
          .from(ingredientsTable)
          .where(inArray(ingredientsTable.id, ids));
        if (rows.length !== ids.length) throw new HttpError("Ada bahan resep yang tidak ditemukan.", 400);
        if (rows.some((row) => isOperationalIngredient(row.category))) {
          throw new HttpError("Resep hanya menerima bahan makro; keluarkan bahan berkategori Mikro/Operasional.", 400);
        }
      }
      const rows = ids.length
        ? await tx.select({ id: ingredientsTable.id, category: ingredientsTable.category, unit: ingredientsTable.unit, name: ingredientsTable.name }).from(ingredientsTable).where(inArray(ingredientsTable.id, ids))
        : [];
      if (rows.length !== ids.length) throw new HttpError("Ada bahan resep yang tidak ditemukan.", 400);
      if (rows.some((row) => isOperationalIngredient(row.category))) {
        throw new HttpError("Resep hanya menerima bahan makro; keluarkan bahan berkategori Mikro/Operasional.", 400);
      }
      const ingredientMap = new Map(rows.map((row) => [row.id, row]));
      const recipeRows = body.data.items.map((item) => {
        const ingredient = ingredientMap.get(item.ingredientId)!;
        const conversionFactor = recipeConversionFactor(item.recipeUnit, ingredient.unit);
        if (conversionFactor === null) {
          throw new HttpError(`Satuan resep ${item.recipeUnit} tidak kompatibel dengan satuan stok ${ingredient.unit} untuk bahan ${ingredient.name}.`, 400);
        }
        return { productId: params.data.productId, ingredientId: item.ingredientId, qtyRequired: String(item.qtyRequired), recipeUnit: item.recipeUnit, conversionFactor: String(conversionFactor) };
      });
      await tx.delete(recipeItemsTable).where(eq(recipeItemsTable.productId, params.data.productId));
      if (recipeRows.length) await tx.insert(recipeItemsTable).values(recipeRows);
      return tx
        .select({
          productId: recipeItemsTable.productId,
          ingredientId: recipeItemsTable.ingredientId,
          ingredientName: ingredientsTable.name,
          unit: ingredientsTable.unit,
          qtyRequired: recipeItemsTable.qtyRequired,
          recipeUnit: recipeItemsTable.recipeUnit,
        })
        .from(recipeItemsTable)
        .innerJoin(ingredientsTable, eq(recipeItemsTable.ingredientId, ingredientsTable.id))
        .where(eq(recipeItemsTable.productId, params.data.productId));
    });

    const data = saved.map((row) => ({ ...row, qtyRequired: number(row.qtyRequired) }));
    res.json(SaveProductRecipeResponse.parse(data));
  }),
);


type ParseResult<T> = { success: true; data: T } | { success: false; error: { message: string } };
function recordBody(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function positiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function stringValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
const PrepBody = { safeParse(input: unknown): ParseResult<{ name:string; unit:string; yieldQty:number }> {
  const b=recordBody(input);
  if (!b || !stringValue(b.name) || b.name.length>120 || !stringValue(b.unit) || b.unit.length>30 || !positiveNumber(b.yieldQty)) return {success:false,error:{message:"Nama, satuan, dan hasil standar prep wajib diisi dengan benar."}};
  return {success:true,data:{name:b.name,unit:b.unit,yieldQty:b.yieldQty}};
}};
const PrepRecipeBody = { safeParse(input: unknown): ParseResult<{items:Array<{ingredientId:number;qtyRequired:number;recipeUnit:string}>}> {
  const b=recordBody(input), items=b?.items;
  if (!Array.isArray(items) || items.length>100 || items.some((x)=>{const v=recordBody(x);return !v||!Number.isSafeInteger(v.ingredientId)||v.ingredientId<=0||!positiveNumber(v.qtyRequired)||!stringValue(v.recipeUnit)||v.recipeUnit.length>30;})) return {success:false,error:{message:"Daftar resep prep tidak valid."}};
  return {success:true,data:{items:items as Array<{ingredientId:number;qtyRequired:number;recipeUnit:string}>}};
}};
const ProductPrepBody = { safeParse(input: unknown): ParseResult<{items:Array<{preparationId:number;qtyRequired:number;recipeUnit:string}>}> {
  const b=recordBody(input), items=b?.items;
  if (!Array.isArray(items) || items.length>100 || items.some((x)=>{const v=recordBody(x);return !v||!Number.isSafeInteger(v.preparationId)||v.preparationId<=0||!positiveNumber(v.qtyRequired)||!stringValue(v.recipeUnit)||v.recipeUnit.length>30;})) return {success:false,error:{message:"Daftar komponen prep produk tidak valid."}};
  return {success:true,data:{items:items as Array<{preparationId:number;qtyRequired:number;recipeUnit:string}>}};
}};
const BatchBody = { safeParse(input: unknown): ParseResult<{date:Date;targetQty:number;actualQty:number}> {
  const b=recordBody(input), d=b?.date;
  const date=new Date(String(d??""));
  if (!b || Number.isNaN(date.getTime()) || !positiveNumber(b.targetQty) || !positiveNumber(b.actualQty)) return {success:false,error:{message:"Tanggal, target, dan hasil aktual produksi wajib valid."}};
  return {success:true,data:{date,targetQty:b.targetQty,actualQty:b.actualQty}};
}};

router.get("/erp/preparations", safe(async (_req, res) => {
  const preps = await db.select().from(preparationsTable).where(eq(preparationsTable.active, true)).orderBy(asc(preparationsTable.name));
  const ids = preps.map((p) => p.id);
  const recipeRows = ids.length ? await db.select({
    preparationId: preparationRecipeItemsTable.preparationId,
    ingredientId: preparationRecipeItemsTable.ingredientId,
    ingredientName: ingredientsTable.name,
    ingredientUnit: ingredientsTable.unit,
    qtyRequired: preparationRecipeItemsTable.qtyRequired,
    recipeUnit: preparationRecipeItemsTable.recipeUnit,
    conversionFactor: preparationRecipeItemsTable.conversionFactor,
  }).from(preparationRecipeItemsTable)
    .innerJoin(ingredientsTable, eq(preparationRecipeItemsTable.ingredientId, ingredientsTable.id))
    .where(inArray(preparationRecipeItemsTable.preparationId, ids)) : [];
  const productRows = ids.length ? await db.select({
    preparationId: productPreparationItemsTable.preparationId,
    productId: productPreparationItemsTable.productId,
    productName: productsTable.name,
    qtyRequired: productPreparationItemsTable.qtyRequired,
    recipeUnit: productPreparationItemsTable.recipeUnit,
    conversionFactor: productPreparationItemsTable.conversionFactor,
  }).from(productPreparationItemsTable)
    .innerJoin(productsTable, eq(productPreparationItemsTable.productId, productsTable.id))
    .where(inArray(productPreparationItemsTable.preparationId, ids)) : [];
  const batchRows = ids.length ? await db.select().from(preparationBatchesTable)
    .where(inArray(preparationBatchesTable.preparationId, ids))
    .orderBy(desc(preparationBatchesTable.date), desc(preparationBatchesTable.id)).limit(50) : [];
  res.json(preps.map((p) => ({
    id: p.id, name: p.name, unit: p.unit, yieldQty: number(p.yieldQty), stock: number(p.stock), averageCost: number(p.averageCost), active: p.active,
    recipe: recipeRows.filter((r) => r.preparationId === p.id).map((r) => ({
      ingredientId: r.ingredientId, ingredientName: r.ingredientName, ingredientUnit: r.ingredientUnit,
      qtyRequired: number(r.qtyRequired), recipeUnit: r.recipeUnit, conversionFactor: number(r.conversionFactor),
    })),
    products: productRows.filter((r) => r.preparationId === p.id).map((r) => ({
      productId: r.productId, productName: r.productName, qtyRequired: number(r.qtyRequired), recipeUnit: r.recipeUnit,
    })),
    batches: batchRows.filter((b) => b.preparationId === p.id).map((b) => ({
      id: b.id, batchNumber: b.batchNumber, date: b.date, targetQty: number(b.targetQty), actualQty: number(b.actualQty),
      totalCost: number(b.totalCost), unitCost: number(b.unitCost), yieldPercentage: number(b.yieldPercentage), status: b.status,
    })),
  })));
}));

router.post("/erp/preparations", safe(async (req, res) => {
  const parsed = PrepBody.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.message);
  const [row] = await db.insert(preparationsTable).values({
    name: parsed.data.name.trim(), unit: parsed.data.unit.trim(), yieldQty: String(parsed.data.yieldQty), stock: "0", averageCost: "0",
  }).returning();
  res.status(201).json({ id: row.id, name: row.name, unit: row.unit, yieldQty: number(row.yieldQty), stock: 0, averageCost: 0, active: row.active });
}));

router.put("/erp/preparations/:preparationId/recipe", safe(async (req, res) => {
  const preparationId = Number(req.params.preparationId);
  if (!Number.isSafeInteger(preparationId) || preparationId <= 0) return invalid(res, "ID prep tidak valid.");
  const parsed = PrepRecipeBody.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.message);
  const ids = parsed.data.items.map((x) => x.ingredientId);
  if (new Set(ids).size !== ids.length) return invalid(res, "Bahan yang sama hanya boleh ditambahkan satu kali.");
  const saved = await db.transaction(async (tx) => {
    const [prep] = await tx.select().from(preparationsTable).where(eq(preparationsTable.id, preparationId)).for("update");
    if (!prep) throw new HttpError("Prep tidak ditemukan.", 404);
    const rows = ids.length ? await tx.select({
      id: ingredientsTable.id, name: ingredientsTable.name, unit: ingredientsTable.unit, category: ingredientsTable.category,
    }).from(ingredientsTable).where(inArray(ingredientsTable.id, ids)) : [];
    if (rows.length !== ids.length) throw new HttpError("Ada bahan prep yang tidak ditemukan.", 400);
    const map = new Map(rows.map((r) => [r.id, r]));
    const recipeRows = parsed.data.items.map((item) => {
      const ingredient = map.get(item.ingredientId)!;
      if (isOperationalIngredient(ingredient.category)) throw new HttpError("Bahan Mikro/Operasional tidak dapat dipakai sebagai bahan prep.", 400);
      const factor = recipeConversionFactor(item.recipeUnit, ingredient.unit);
      if (factor === null) throw new HttpError(`Satuan ${item.recipeUnit} tidak kompatibel dengan stok ${ingredient.unit} untuk ${ingredient.name}.`, 400);
      return { preparationId, ingredientId: item.ingredientId, qtyRequired: String(item.qtyRequired), recipeUnit: item.recipeUnit, conversionFactor: String(factor) };
    });
    await tx.delete(preparationRecipeItemsTable).where(eq(preparationRecipeItemsTable.preparationId, preparationId));
    if (recipeRows.length) await tx.insert(preparationRecipeItemsTable).values(recipeRows);
    return recipeRows;
  });
  res.json(saved.map((r) => ({ ...r, qtyRequired: number(r.qtyRequired), conversionFactor: number(r.conversionFactor) })));
}));

router.put("/erp/products/:productId/preparations", safe(async (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isSafeInteger(productId) || productId <= 0) return invalid(res, "ID produk tidak valid.");
  const parsed = ProductPrepBody.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.message);
  const ids = parsed.data.items.map((x) => x.preparationId);
  if (new Set(ids).size !== ids.length) return invalid(res, "Prep yang sama hanya boleh ditambahkan satu kali.");
  const saved = await db.transaction(async (tx) => {
    const [product] = await tx.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, productId)).for("update");
    if (!product) throw new HttpError("Produk tidak ditemukan.", 404);
    const rows = ids.length ? await tx.select().from(preparationsTable).where(inArray(preparationsTable.id, ids)) : [];
    if (rows.length !== ids.length) throw new HttpError("Ada prep yang tidak ditemukan.", 400);
    const map = new Map(rows.map((r) => [r.id, r]));
    for (const item of parsed.data.items) {
      const prep = map.get(item.preparationId)!;
      const factor = recipeConversionFactor(item.recipeUnit, prep.unit);
      if (factor === null) throw new HttpError(`Satuan ${item.recipeUnit} tidak kompatibel dengan stok prep ${prep.unit} untuk ${prep.name}.`, 400);

    }
    await tx.delete(productPreparationItemsTable).where(eq(productPreparationItemsTable.productId, productId));
    if (parsed.data.items.length) await tx.insert(productPreparationItemsTable).values(parsed.data.items.map((x) => ({
      productId, preparationId: x.preparationId, qtyRequired: String(x.qtyRequired), recipeUnit: x.recipeUnit, conversionFactor: String(recipeConversionFactor(x.recipeUnit, map.get(x.preparationId)!.unit)),
    })));
    return parsed.data.items;
  });
  res.json(saved);
}));

router.post("/erp/preparations/:preparationId/batches", safe(async (req, res) => {
  const preparationId = Number(req.params.preparationId);
  if (!Number.isSafeInteger(preparationId) || preparationId <= 0) return invalid(res, "ID prep tidak valid.");
  const parsed = BatchBody.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.message);
  const result = await db.transaction(async (tx) => {
    const [prep] = await tx.select().from(preparationsTable).where(eq(preparationsTable.id, preparationId)).for("update");
    if (!prep) throw new HttpError("Prep tidak ditemukan.", 404);
    const recipe = await tx.select().from(preparationRecipeItemsTable).where(eq(preparationRecipeItemsTable.preparationId, preparationId));
    if (!recipe.length) throw new HttpError("Atur resep prep terlebih dahulu.", 400);
    const ingredientIds = [...new Set(recipe.map((r) => r.ingredientId))].sort((a,b)=>a-b);
    const locked = await tx.select().from(ingredientsTable).where(inArray(ingredientsTable.id, ingredientIds)).orderBy(asc(ingredientsTable.id)).for("update");
    if (locked.length !== ingredientIds.length) throw new HttpError("Bahan prep tidak lengkap.", 409);
    const byId = new Map(locked.map((r) => [r.id, r]));
    let totalCost = 0;
    const scale = parsed.data.targetQty / number(prep.yieldQty);
    if (!Number.isFinite(scale) || scale <= 0) throw new HttpError("Hasil standar prep tidak valid.", 400);
    for (const line of recipe) {
      const ing = byId.get(line.ingredientId)!;
      const used = number(line.qtyRequired) * number(line.conversionFactor) * scale;
      totalCost += used * number(ing.averageCost);
      const newStock = number(ing.stock) - used;
      await tx.update(ingredientsTable).set({ stock: String(newStock) }).where(eq(ingredientsTable.id, ing.id));
      await tx.insert(stockMovementsTable).values({
        date: dateKey(parsed.data.date), ingredientId: ing.id, movementType: "prep_production",
        quantityDelta: String(-used), stockBefore: String(number(ing.stock)), stockAfter: String(newStock),
        unitCost: String(number(ing.averageCost)), referenceId: preparationId, note: prep.name,
      });
    }
    totalCost = roundMoney(totalCost);
    const unitCost = roundMoney(totalCost / parsed.data.actualQty);
    const yieldPercentage = roundMoney((parsed.data.actualQty / parsed.data.targetQty) * 1000) / 10;
    const newStock = number(prep.stock) + parsed.data.actualQty;
    const newAverageCost = newStock > 0
      ? roundMoney((number(prep.stock) * number(prep.averageCost) + totalCost) / newStock)
      : unitCost;
    const batchNumber = `P-${dateKey(parsed.data.date).replaceAll("-","")}-${preparationId}-${Date.now()}`;
    const [batch] = await tx.insert(preparationBatchesTable).values({
      preparationId, batchNumber, date: dateKey(parsed.data.date), targetQty: String(parsed.data.targetQty),
      actualQty: String(parsed.data.actualQty), totalCost: String(totalCost), unitCost: String(unitCost),
      yieldPercentage: String(yieldPercentage), status: "PRODUCED",
    }).returning();
    await tx.update(preparationsTable).set({ stock: String(newStock), averageCost: String(newAverageCost) }).where(eq(preparationsTable.id, preparationId));
    await tx.insert(preparationStockMovementsTable).values({
      date: dateKey(parsed.data.date), preparationId, movementType: "production",
      quantityDelta: String(parsed.data.actualQty), stockBefore: String(number(prep.stock)), stockAfter: String(newStock),
      unitCost: String(unitCost), referenceId: batch.id, note: batchNumber,
    });
    return { id: batch.id, batchNumber, date: batch.date, targetQty: parsed.data.targetQty, actualQty: parsed.data.actualQty,
      totalCost, unitCost, yieldPercentage, status: "PRODUCED", prepStock: newStock, prepAverageCost: newAverageCost };
  });
  res.status(201).json(result);
}));


const WasteBody = z.object({
  date: z.coerce.date(),
  itemType: z.enum(["ingredient", "preparation"]),
  itemId: z.number().int().positive(),
  quantity: z.number().positive(),
  reason: z.string().min(1).max(120),
  note: z.string().max(500).optional(),
});
const ExpenseBody = z.object({
  date: z.coerce.date(),
  category: z.string().min(1).max(80),
  description: z.string().min(1).max(200),
  amount: z.number().positive(),
});

router.post("/erp/waste", safe(async (req, res) => {
  const parsed = WasteBody.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.message);
  const result = await db.transaction(async (tx) => {
    let unit = "", unitCost = 0;
    if (parsed.data.itemType === "ingredient") {
      const [item] = await tx.select().from(ingredientsTable).where(eq(ingredientsTable.id, parsed.data.itemId)).for("update");
      if (!item) throw new HttpError("Bahan tidak ditemukan.", 404);
      unit = item.unit; unitCost = number(item.averageCost);
      const newStock = number(item.stock) - parsed.data.quantity;
      await tx.update(ingredientsTable).set({ stock: String(newStock) }).where(eq(ingredientsTable.id, item.id));
      await tx.insert(stockMovementsTable).values({
        date: dateKey(parsed.data.date), ingredientId: item.id, movementType: "waste",
        quantityDelta: String(-parsed.data.quantity), stockBefore: String(number(item.stock)), stockAfter: String(newStock),
        unitCost: String(unitCost), note: parsed.data.reason,
      });
    } else {
      const [item] = await tx.select().from(preparationsTable).where(eq(preparationsTable.id, parsed.data.itemId)).for("update");
      if (!item) throw new HttpError("Prep tidak ditemukan.", 404);
      unit = item.unit; unitCost = number(item.averageCost);
      const newStock = number(item.stock) - parsed.data.quantity;
      await tx.update(preparationsTable).set({ stock: String(newStock) }).where(eq(preparationsTable.id, item.id));
      await tx.insert(preparationStockMovementsTable).values({
        date: dateKey(parsed.data.date), preparationId: item.id, movementType: "waste",
        quantityDelta: String(-parsed.data.quantity), stockBefore: String(number(item.stock)), stockAfter: String(newStock),
        unitCost: String(unitCost), note: parsed.data.reason,
      });
    }
    const totalCost = roundMoney(parsed.data.quantity * unitCost);
    const [row] = await tx.insert(wasteTable).values({
      date: dateKey(parsed.data.date),
      ingredientId: parsed.data.itemType === "ingredient" ? parsed.data.itemId : null,
      preparationId: parsed.data.itemType === "preparation" ? parsed.data.itemId : null,
      quantity: String(parsed.data.quantity), unit, unitCost: String(unitCost), totalCost: String(totalCost),
      reason: parsed.data.reason, note: parsed.data.note ?? null,
    }).returning();
    return { id: row.id, date: row.date, itemType: parsed.data.itemType, itemId: parsed.data.itemId, quantity: parsed.data.quantity, unit, unitCost, totalCost, reason: row.reason, note: row.note };
  });
  res.status(201).json(result);
}));

router.post("/erp/expenses", safe(async (req, res) => {
  const parsed = ExpenseBody.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.message);
  const [row] = await db.insert(operatingExpensesTable).values({
    date: dateKey(parsed.data.date), category: parsed.data.category.trim(), description: parsed.data.description.trim(), amount: String(roundMoney(parsed.data.amount)),
  }).returning();
  res.status(201).json({ id: row.id, date: row.date, category: row.category, description: row.description, amount: number(row.amount) });
}));

router.get("/erp/fnb-report", safe(async (req, res) => {
  const startDate = String(req.query.startDate ?? "");
  const endDate = String(req.query.endDate ?? "");
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(startDate) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(endDate) || startDate > endDate) return invalid(res, "Rentang tanggal tidak valid.");
  const sales = await db.select().from(salesTable).where(and(gte(salesTable.date, startDate), lte(salesTable.date, endDate)));
  const saleIds = sales.map((x) => x.id);
  const [details, ingredients, recipes, productPreps, preps, waste, expenses, ingredientMovements, prepMovements] = await Promise.all([
    saleIds.length ? db.select().from(salesDetailsTable).where(inArray(salesDetailsTable.salesId, saleIds)) : Promise.resolve([]),
    db.select().from(ingredientsTable),
    db.select().from(recipeItemsTable),
    db.select().from(productPreparationItemsTable),
    db.select().from(preparationsTable),
    db.select().from(wasteTable).where(and(gte(wasteTable.date, startDate), lte(wasteTable.date, endDate))),
    db.select().from(operatingExpensesTable).where(and(gte(operatingExpensesTable.date, startDate), lte(operatingExpensesTable.date, endDate))),
    db.select().from(stockMovementsTable).where(and(gte(stockMovementsTable.date, startDate), lte(stockMovementsTable.date, endDate))),
    db.select().from(preparationStockMovementsTable).where(and(gte(preparationStockMovementsTable.date, startDate), lte(preparationStockMovementsTable.date, endDate))),
  ]);
  const ingredientById = new Map(ingredients.map((x) => [x.id, x]));
  const prepById = new Map(preps.map((x) => [x.id, x]));
  const saleQty = new Map<number, number>();
  for (const line of details) saleQty.set(line.productId, (saleQty.get(line.productId) ?? 0) + line.quantity);
  const menuMap = new Map<number, { productId:number; productName:string; quantity:number; revenue:number; actualCogs:number; theoreticalCogs:number }>();
  for (const line of details) {
    const row = menuMap.get(line.productId) ?? { productId: line.productId, productName: line.productName, quantity: 0, revenue: 0, actualCogs: 0, theoreticalCogs: 0 };
    row.quantity += line.quantity; row.revenue += number(line.revenue); row.actualCogs += number(line.costOfGoodsSold);
    const ingCost = recipes.filter((r) => r.productId === line.productId && r.ingredientId).reduce((sum,r) => {
      const ing = ingredientById.get(r.ingredientId!); return sum + (ing ? number(r.qtyRequired) * number(r.conversionFactor) * number(ing.averageCost) : 0);
    },0);
    const prepCost = productPreps.filter((r)=>r.productId===line.productId).reduce((sum,r)=>{
      const p=prepById.get(r.preparationId); return sum + (p ? number(r.qtyRequired)*number(p.averageCost) : 0);
    },0);
    row.theoreticalCogs += (ingCost + prepCost) * line.quantity;
    menuMap.set(line.productId,row);
  }
  const theoreticalIngredient = new Map<number, number>();
  for (const line of details) {
    for (const recipe of recipes.filter((r) => r.productId === line.productId && r.ingredientId)) {
      theoreticalIngredient.set(recipe.ingredientId!, (theoreticalIngredient.get(recipe.ingredientId!) ?? 0) + number(recipe.qtyRequired) * number(recipe.conversionFactor) * line.quantity);
    }
  }
  const prepRecipeRows = await db.select().from(preparationRecipeItemsTable);
  for (const line of details) {
    for (const link of productPreps.filter((r) => r.productId === line.productId)) {
      const prep = prepById.get(link.preparationId);
      if (!prep || number(prep.yieldQty) <= 0) continue;
      for (const recipe of prepRecipeRows.filter((r) => r.preparationId === link.preparationId)) {
        const theoretical = number(recipe.qtyRequired) * number(recipe.conversionFactor) / number(prep.yieldQty) * number(link.qtyRequired) * number(link.conversionFactor) * line.quantity;
        theoreticalIngredient.set(recipe.ingredientId, (theoreticalIngredient.get(recipe.ingredientId) ?? 0) + theoretical);
      }
    }
  }
  const actualIngredient = new Map<number, number>();
  for (const m of ingredientMovements) {
    if (["sale","prep_production","waste"].includes(m.movementType) && number(m.quantityDelta) < 0) {
      actualIngredient.set(m.ingredientId, (actualIngredient.get(m.ingredientId) ?? 0) + Math.abs(number(m.quantityDelta)));
    }
  }
  const ingredientVariance = ingredients
    .filter((x) => actualIngredient.has(x.id) || theoreticalIngredient.has(x.id))
    .map((x) => {
      const actual = actualIngredient.get(x.id) ?? 0;
      const theoretical = theoreticalIngredient.get(x.id) ?? 0;
      const variance = actual - theoretical;
      return { itemType:"ingredient", itemId:x.id, itemName:x.name, unit:x.unit, actualQty:roundMoney(actual), theoreticalQty:roundMoney(theoretical), varianceQty:roundMoney(variance), varianceCost:roundMoney(variance * number(x.averageCost)) };
    })
    .sort((a,b)=>Math.abs(b.varianceCost)-Math.abs(a.varianceCost))
    .slice(0,50);
  const actualPrep = new Map<number, number>();
  const theoreticalPrep = new Map<number, number>();
  for (const m of prepMovements) {
    if (["sale","waste"].includes(m.movementType) && number(m.quantityDelta) < 0) actualPrep.set(m.preparationId,(actualPrep.get(m.preparationId)??0)+Math.abs(number(m.quantityDelta)));
  }
  for (const line of details) for (const link of productPreps.filter((r)=>r.productId===line.productId)) {
    const q=number(link.qtyRequired)*number(link.conversionFactor)*line.quantity;
    theoreticalPrep.set(link.preparationId,(theoreticalPrep.get(link.preparationId)??0)+q);
  }
  const prepVariance = preps.filter((x)=>actualPrep.has(x.id)||theoreticalPrep.has(x.id)).map((x)=>{
    const actual=actualPrep.get(x.id)??0, theoretical=theoreticalPrep.get(x.id)??0, variance=actual-theoretical;
    return {itemType:"preparation",itemId:x.id,itemName:x.name,unit:x.unit,actualQty:roundMoney(actual),theoreticalQty:roundMoney(theoretical),varianceQty:roundMoney(variance),varianceCost:roundMoney(variance*number(x.averageCost))};
  }).sort((a,b)=>Math.abs(b.varianceCost)-Math.abs(a.varianceCost)).slice(0,50);

  const revenue = roundMoney(sales.reduce((sum,x)=>sum+number(x.totalRevenue),0));
  const actualCogs = roundMoney(sales.reduce((sum,x)=>sum+number(x.totalCostOfGoodsSold),0));
  const theoreticalCogs = roundMoney([...menuMap.values()].reduce((sum,x)=>sum+x.theoreticalCogs,0));
  const wasteCost = roundMoney(waste.reduce((sum,x)=>sum+number(x.totalCost),0));
  const expenseTotal = roundMoney(expenses.reduce((sum,x)=>sum+number(x.amount),0));
  const grossProfit = roundMoney(revenue - actualCogs);
  res.json({
    startDate,endDate,revenue,actualCogs,theoreticalCogs,
    actualFoodCostPercentage: revenue > 0 ? roundMoney(actualCogs / revenue * 100) : 0,
    theoreticalFoodCostPercentage: revenue > 0 ? roundMoney(theoreticalCogs / revenue * 100) : 0,
    foodCostVariance: roundMoney(actualCogs - theoreticalCogs),
    wasteCost, grossProfit, operatingExpenses: expenseTotal, netProfit: roundMoney(grossProfit - expenseTotal - wasteCost),
    wasteCount: waste.length,
    inventoryVariance: [...ingredientVariance, ...prepVariance],
    menus: [...menuMap.values()].map((x)=>({ ...x, revenue:roundMoney(x.revenue), actualCogs:roundMoney(x.actualCogs), theoreticalCogs:roundMoney(x.theoreticalCogs), grossProfit:roundMoney(x.revenue-x.actualCogs), foodCostPercentage:x.revenue>0?roundMoney(x.actualCogs/x.revenue*100):0 })),
    waste: waste.map((x)=>({id:x.id,date:x.date,itemType:x.ingredientId?"ingredient":"preparation",itemId:x.ingredientId??x.preparationId,quantity:number(x.quantity),unit:x.unit,totalCost:number(x.totalCost),reason:x.reason,note:x.note})),
    expenses: expenses.map((x)=>({id:x.id,date:x.date,category:x.category,description:x.description,amount:number(x.amount)})),
  });
}));

router.get(
  "/erp/price-trends",
  safe(async (_req, res) => {
    const rows = await db
      .select({
        ingredientId: purchaseDetailsTable.ingredientId,
        ingredientName: ingredientsTable.name,
        unit: ingredientsTable.unit,
        date: purchasesTable.date,
        supplierType: purchasesTable.supplierType,
        quantity: purchaseDetailsTable.quantity,
        totalCost: purchaseDetailsTable.totalCost,
        unitCost: purchaseDetailsTable.unitCost,
      })
      .from(purchaseDetailsTable)
      .innerJoin(purchasesTable, eq(purchaseDetailsTable.purchaseId, purchasesTable.id))
      .innerJoin(ingredientsTable, eq(purchaseDetailsTable.ingredientId, ingredientsTable.id))
      .orderBy(desc(purchasesTable.date), desc(purchaseDetailsTable.id));
    const history = new Map<number, Array<{ date: string; supplierType: string; quantity: number; totalCost: number; unitCost: number }>>();
    for (const row of rows) {
      const items = history.get(row.ingredientId) ?? [];
      if (items.length < 12) {
        items.push({ date: dateKey(row.date), supplierType: row.supplierType, quantity: number(row.quantity), totalCost: number(row.totalCost), unitCost: number(row.unitCost) });
        history.set(row.ingredientId, items);
      }
    }
    res.json([...history.entries()].map(([ingredientId, items]) => ({
      ingredientId,
      ingredientName: rows.find((row) => row.ingredientId === ingredientId)?.ingredientName ?? "",
      unit: rows.find((row) => row.ingredientId === ingredientId)?.unit ?? "",
      history: items,
      latestPrice: items[0]?.unitCost ?? null,
      previousPrice: items[1]?.unitCost ?? null,
      changeAmount: items.length > 1 ? roundMoney(items[0].unitCost - items[1].unitCost) : null,
      changePercent: items.length > 1 && items[1].unitCost > 0 ? roundMoney(((items[0].unitCost - items[1].unitCost) / items[1].unitCost) * 100) : null,
    })));
  }),
);

router.post(
  "/erp/purchases",
  safe(async (req, res) => {
    const parsed = RecordPurchaseBody.safeParse(req.body);
    if (!parsed.success) {
      invalid(res, parsed.error.message);
      return;
    }
    if (!requireMaxItems(parsed.data.items, 100, res)) return;
    if (!requireFiniteNumbers(parsed.data.items.flatMap((item) => [item.ingredientId, item.quantity, item.totalCost]), res)) return;
    const lines = parsed.data.items;
    const aggregated = new Map<number, { quantity: number; totalCost: number }>();
    for (const line of lines) {
      const current = aggregated.get(line.ingredientId) ?? { quantity: 0, totalCost: 0 };
      current.quantity += line.quantity;
      current.totalCost += line.totalCost;
      aggregated.set(line.ingredientId, current);
    }
    const purchaseLines = [...aggregated.entries()]
      .sort(([a], [b]) => a - b)
      .map(([ingredientId, values]) => ({ ingredientId, ...values }));
    const ingredientIds = purchaseLines.map((line) => line.ingredientId);
    const result = await db.transaction(async (tx) => {
      const locked = await tx
        .select()
        .from(ingredientsTable)
        .where(inArray(ingredientsTable.id, ingredientIds))
        .orderBy(asc(ingredientsTable.id))
        .for("update");
      if (locked.length !== ingredientIds.length) {
        throw new HttpError("Ada bahan belanja yang tidak ditemukan.", 400);
      }
      const byId = new Map(locked.map((row) => [row.id, row]));
      const totalCost = roundMoney(purchaseLines.reduce((sum, line) => sum + line.totalCost, 0));
      const [purchase] = await tx
        .insert(purchasesTable)
        .values({
          date: dateKey(parsed.data.date),
          supplierType: parsed.data.supplierType.trim(),
          totalCost: String(totalCost),
        })
        .returning();

      const details: Array<typeof purchaseDetailsTable.$inferInsert> = [];
      const prepMovements: Array<typeof preparationStockMovementsTable.$inferInsert> = [];
      for (const preparationId of requestedPreparationIds) {
        const prep = preparationById.get(preparationId)!;
        const oldStock = number(prep.stock);
        const used = requiredByPreparation.get(preparationId)!;
        const newStock = oldStock - used;
        await tx.update(preparationsTable).set({ stock: String(newStock) }).where(eq(preparationsTable.id, preparationId));
        prepMovements.push({
          date: dateKey(parsed.data.date), preparationId, movementType: "sale",
          quantityDelta: String(-used), stockBefore: String(oldStock), stockAfter: String(newStock),
          unitCost: String(number(prep.averageCost)), referenceId: sale.id, note: "Penjualan",
        });
      }
      if (prepMovements.length) await tx.insert(preparationStockMovementsTable).values(prepMovements);

      const movements: Array<typeof stockMovementsTable.$inferInsert> = [];
      for (const line of purchaseLines) {
        const ingredient = byId.get(line.ingredientId);
        if (!ingredient) throw new HttpError("Bahan belanja tidak ditemukan.", 400);
        const oldStock = number(ingredient.stock);
        const oldAverageCost = number(ingredient.averageCost);
        const unitCost = line.totalCost / line.quantity;
        const newStock = oldStock + line.quantity;
        const newAverageCost =
          newStock > 0
            ? roundMoney((oldStock * oldAverageCost + line.totalCost) / newStock)
            : roundMoney(unitCost);
        details.push({
          purchaseId: purchase.id,
          ingredientId: line.ingredientId,
          quantity: String(line.quantity),
          totalCost: String(roundMoney(line.totalCost)),
          unitCost: String(roundMoney(unitCost)),
        });
        movements.push({
          date: dateKey(parsed.data.date),
          ingredientId: line.ingredientId,
          movementType: "purchase",
          quantityDelta: String(line.quantity),
          stockBefore: String(oldStock),
          stockAfter: String(newStock),
          unitCost: String(roundMoney(unitCost)),
          referenceId: purchase.id,
          note: parsed.data.supplierType.trim(),
        });
        await tx
          .update(ingredientsTable)
          .set({
            stock: String(newStock),
            lastPrice: String(roundMoney(unitCost)),
            averageCost: String(newAverageCost),
          })
          .where(eq(ingredientsTable.id, line.ingredientId));
        byId.set(line.ingredientId, {
          ...ingredient,
          stock: String(newStock),
          lastPrice: String(roundMoney(unitCost)),
          averageCost: String(newAverageCost),
        });
      }
      await tx.insert(purchaseDetailsTable).values(details);
      if (movements.length) await tx.insert(stockMovementsTable).values(movements);
      return {
        id: purchase.id,
        date: purchase.date,
        supplierType: purchase.supplierType,
        totalCost,
        items: purchaseLines.map((line) => {
          const ingredient = byId.get(line.ingredientId)!;
          return {
            ingredientId: line.ingredientId,
            ingredientName: ingredient.name,
            unit: ingredient.unit,
            quantity: line.quantity,
            totalCost: roundMoney(line.totalCost),
            unitCost: roundMoney(line.totalCost / line.quantity),
          };
        }),
      };
    });

    const validated = RecordPurchaseResponse.parse(result);
    res.status(201).json({ ...validated, date: dateKey(validated.date) });
  }),
);

// -------------------- DELETE ENDPOINTS --------------------
// Delete an ingredient (stock bahan)
// Delete a sales record (catat penjualan)
router.delete(
  "/erp/sales/:saleId",
  checkRole("admin"),
  safe(async (req, res) => {
    const { saleId } = req.params as { saleId: string };
    const idNum = Number(saleId);
    if (!/^\d+$/.test(saleId) || !Number.isSafeInteger(idNum) || idNum <= 0) {
      invalid(res, "ID penjualan tidak valid.");
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [sale] = await tx
        .select()
        .from(salesTable)
        .where(eq(salesTable.id, idNum))
        .for("update");
      if (!sale) throw new HttpError("Penjualan tidak ditemukan.", 404);

      const details = await tx
        .select()
        .from(salesDetailsTable)
        .where(eq(salesDetailsTable.salesId, idNum));

      for (const line of details) {
        const [product] = await tx
          .select()
          .from(productsTable)
          .where(eq(productsTable.id, line.productId))
          .for("update");

        if (product && !product.needsRecipe) {
          await tx.update(productsTable)
            .set({ stock: String(number(product.stock) + line.quantity) })
            .where(eq(productsTable.id, product.id));
        }
      }

      const prepMovements = await tx
        .select()
        .from(preparationStockMovementsTable)
        .where(and(
          eq(preparationStockMovementsTable.referenceId, idNum),
          eq(preparationStockMovementsTable.movementType, "sale"),
        ));
      for (const movement of prepMovements) {
        const [prep] = await tx
          .select()
          .from(preparationsTable)
          .where(eq(preparationsTable.id, movement.preparationId))
          .for("update");
        if (!prep) continue;
        const restored = -number(movement.quantityDelta);
        await tx.update(preparationsTable)
          .set({ stock: String(number(prep.stock) + restored) })
          .where(eq(preparationsTable.id, prep.id));
      }
      await tx.delete(preparationStockMovementsTable).where(and(
        eq(preparationStockMovementsTable.referenceId, idNum),
        eq(preparationStockMovementsTable.movementType, "sale"),
      ));

      const movements = await tx
        .select()
        .from(stockMovementsTable)
        .where(and(
          eq(stockMovementsTable.referenceId, idNum),
          eq(stockMovementsTable.movementType, "sale"),
        ));

      for (const movement of movements) {
        const [ingredient] = await tx
          .select()
          .from(ingredientsTable)
          .where(eq(ingredientsTable.id, movement.ingredientId))
          .for("update");
        if (!ingredient) continue;

        const restored = -number(movement.quantityDelta);
        await tx.update(ingredientsTable)
          .set({ stock: String(number(ingredient.stock) + restored) })
          .where(eq(ingredientsTable.id, ingredient.id));
      }

      await tx.delete(stockMovementsTable)
        .where(and(
          eq(stockMovementsTable.referenceId, idNum),
          eq(stockMovementsTable.movementType, "sale"),
        ));
      await tx.delete(salesDetailsTable).where(eq(salesDetailsTable.salesId, idNum));
      await tx.delete(salesTable).where(eq(salesTable.id, idNum));

      return { id: idNum };
    });

    res.json({ message: "Sale record deleted", id: result.id });
  }),
);

// Delete ALL ERP tables (dangerous – use with caution)
router.delete(
  "/erp/clear-all",
  checkRole("admin"),
  safe(async (_req, res) => {
    if (process.env.ALLOW_DANGEROUS_CLEAR_ALL !== "true") {
      res.status(404).json({ error: "Endpoint tidak tersedia." });
      return;
    }
    // Perform deletions in order respecting foreign key constraints
    await db.transaction(async (tx) => {
      // Delete dependent tables first
      await tx.delete(salesDetailsTable).execute();
      await tx.delete(wasteTable).execute();
      await tx.delete(operatingExpensesTable).execute();
      await tx.delete(purchaseDetailsTable).execute();
      await tx.delete(preparationStockMovementsTable).execute();
      await tx.delete(productPreparationItemsTable).execute();
      await tx.delete(preparationBatchesTable).execute();
      await tx.delete(preparationRecipeItemsTable).execute();
      await tx.delete(stockMovementsTable).execute();
      await tx.delete(recipeItemsTable).execute();
      await tx.delete(purchasesTable).execute();
      await tx.delete(salesTable).execute();
      await tx.delete(productsTable).execute();
      await tx.delete(preparationsTable).execute();
      await tx.delete(ingredientsTable).execute();
    });
    res.json({ message: "All ERP tables have been cleared" });
  })
);

router.post(

  "/erp/sales",
  safe(async (req, res) => {
    const parsed = RecordSaleBody.safeParse(req.body);
    if (!parsed.success) {
      invalid(res, parsed.error.message);
      return;
    }
    if (!requireMaxItems(parsed.data.items, 100, res)) return;
    if (!requireFiniteNumbers(parsed.data.items.flatMap((item) => [item.productId, item.quantity]), res)) return;
    const quantities = new Map<number, number>();
    for (const line of parsed.data.items) {
      quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
    }
    const productIds = [...quantities.keys()].sort((a, b) => a - b);
    const result = await db.transaction(async (tx) => {
      const productRows = await tx
        .select()
        .from(productsTable)
        .where(inArray(productsTable.id, productIds))
        .orderBy(asc(productsTable.id))
        .for("update");
      if (productRows.length !== productIds.length) {
        throw new HttpError("Ada produk yang tidak ditemukan.", 400);
      }
      const recipeRows = await tx
        .select()
        .from(recipeItemsTable)
        .where(inArray(recipeItemsTable.productId, productIds));
      const productPrepRows = await tx
        .select()
        .from(productPreparationItemsTable)
        .where(inArray(productPreparationItemsTable.productId, productIds));
      const recipesByProduct = new Map<number, typeof recipeRows>();
      for (const row of recipeRows) {
        const items = recipesByProduct.get(row.productId) ?? [];
        items.push(row);
        recipesByProduct.set(row.productId, items);
      }

      const warnings: string[] = [];
      const missingRecipes = productRows
        .filter((product) => product.needsRecipe && !recipesByProduct.get(product.id)?.length && !productPrepRows.some((row) => row.productId === product.id))
        .map((product) => product.name);
      for (const name of missingRecipes) {
        warnings.push(`Resep belum diatur untuk ${name}; transaksi tetap dicatat tanpa pemotongan bahan.`);
      }

      const requiredByIngredient = new Map<number, number>();
      const requiredByPreparation = new Map<number, number>();
      for (const [productId, soldQuantity] of quantities) {
        const product = productRows.find((row) => row.id === productId)!;
        if (!product.needsRecipe) continue;
        for (const item of recipesByProduct.get(productId) ?? []) {
          if (!item.ingredientId) continue;
          requiredByIngredient.set(
            item.ingredientId,
            (requiredByIngredient.get(item.ingredientId) ?? 0) +
            number(item.qtyRequired) * number(item.conversionFactor) * soldQuantity,
          );
        }
      }
      for (const [productId, soldQuantity] of quantities) {
        const product = productRows.find((row) => row.id === productId)!;
        if (!product.needsRecipe) continue;
        for (const item of productPrepRows.filter((row) => row.productId === productId)) {
          requiredByPreparation.set(
            item.preparationId,
            (requiredByPreparation.get(item.preparationId) ?? 0) + number(item.qtyRequired) * number(item.conversionFactor) * soldQuantity,
          );
        }
      }

      const requestedPreparationIds = [...requiredByPreparation.keys()].sort((a, b) => a - b);
      const lockedPreparations = requestedPreparationIds.length
        ? await tx.select().from(preparationsTable).where(inArray(preparationsTable.id, requestedPreparationIds)).orderBy(asc(preparationsTable.id)).for("update")
        : [];
      if (lockedPreparations.length !== requestedPreparationIds.length) throw new HttpError("Salah satu prep pada resep tidak ditemukan.", 409);
      const preparationById = new Map(lockedPreparations.map((row) => [row.id, row]));
      for (const preparationId of requestedPreparationIds) {
        const prep = preparationById.get(preparationId)!;
        const required = requiredByPreparation.get(preparationId) ?? 0;
        if (number(prep.stock) + 1e-9 < required) {
          warnings.push(`Stok prep ${prep.name} kurang: tersedia ${number(prep.stock)} ${prep.unit}, perlu ${required} ${prep.unit}.`);
        }
      }

      const requestedIngredientIds = [...requiredByIngredient.keys()].sort((a, b) => a - b);
      const lockedIngredients = requestedIngredientIds.length
        ? await tx
            .select()
            .from(ingredientsTable)
            .where(inArray(ingredientsTable.id, requestedIngredientIds))
            .orderBy(asc(ingredientsTable.id))
            .for("update")
        : [];
      if (lockedIngredients.length !== requestedIngredientIds.length) {
        throw new HttpError("Salah satu bahan pada resep tidak ditemukan.", 409);
      }

      const ingredientById = new Map(lockedIngredients.map((row) => [row.id, row]));
      const ingredientIds = requestedIngredientIds.filter((ingredientId) => {
        const ingredient = ingredientById.get(ingredientId)!;
        if (!isOperationalIngredient(ingredient.category)) return true;
        warnings.push(`Bahan ${ingredient.name} berkategori Mikro/Operasional; stoknya tidak dipotong dalam resep.`);
        requiredByIngredient.delete(ingredientId);
        return false;
      });
      for (const ingredientId of ingredientIds) {
        const ingredient = ingredientById.get(ingredientId)!;
        const required = requiredByIngredient.get(ingredientId) ?? 0;
        const available = number(ingredient.stock);
        if (available + 1e-9 < required) {
          warnings.push(
            `Stok bahan ${ingredient.name} kurang: tersedia ${available} ${ingredient.unit}, perlu ${required} ${ingredient.unit}.`,
          );
        }
      }

      const productById = new Map(productRows.map((row) => [row.id, row]));
      for (const [productId, soldQuantity] of quantities) {
        const product = productById.get(productId)!;
        if (!product.needsRecipe && number(product.stock) + 1e-9 < soldQuantity) {
          warnings.push(
            `Stok produk ${product.name} kurang: tersedia ${number(product.stock)}, terjual ${soldQuantity}.`,
          );
        }
      }

      const saleLines = productIds.map((productId) => {
        const product = productById.get(productId)!;
        const quantity = quantities.get(productId)!;
        const unitPrice = number(product.sellingPrice);
        const recipe = recipesByProduct.get(productId) ?? [];
        const costOfGoodsSold = product.needsRecipe
          ? recipe.reduce((sum, item) => {
              if (!item.ingredientId) return sum;
              const ingredient = ingredientById.get(item.ingredientId)!;
              if (isOperationalIngredient(ingredient.category)) return sum;
              return sum + number(item.qtyRequired) * number(item.conversionFactor) * quantity * number(ingredient.averageCost);
            }, productPrepRows.filter((row) => row.productId === productId).reduce((sum, item) => {
              const prep = preparationById.get(item.preparationId);
              return sum + (prep ? number(item.qtyRequired) * number(item.conversionFactor) * quantity * number(prep.averageCost) : 0);
            }, 0))
          : number(product.averageCost) * quantity;
        return {
          productId,
          productName: product.name,
          quantity,
          unitPrice,
          revenue: roundMoney(unitPrice * quantity),
          costOfGoodsSold: roundMoney(costOfGoodsSold),
        };
      });
      const totalRevenue = roundMoney(saleLines.reduce((sum, line) => sum + line.revenue, 0));
      const totalCostOfGoodsSold = roundMoney(
        saleLines.reduce((sum, line) => sum + line.costOfGoodsSold, 0),
      );
      const [sale] = await tx
        .insert(salesTable)
        .values({
          date: dateKey(parsed.data.date),
          totalRevenue: String(totalRevenue),
          totalCostOfGoodsSold: String(totalCostOfGoodsSold),
        })
        .returning();
      await tx.insert(salesDetailsTable).values(
        saleLines.map((line) => ({
          salesId: sale.id,
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: String(line.unitPrice),
          revenue: String(line.revenue),
          costOfGoodsSold: String(line.costOfGoodsSold),
        })),
      );
      for (const [productId, soldQuantity] of quantities) {
        const product = productById.get(productId)!;
        if (!product.needsRecipe) {
          await tx
            .update(productsTable)
            .set({ stock: String(number(product.stock) - soldQuantity) })
            .where(eq(productsTable.id, productId));
        }
      }

      const movements: Array<typeof stockMovementsTable.$inferInsert> = [];
      for (const ingredientId of ingredientIds) {
        const ingredient = ingredientById.get(ingredientId)!;
        const oldStock = number(ingredient.stock);
        const used = requiredByIngredient.get(ingredientId)!;
        const newStock = oldStock - used;
        await tx
          .update(ingredientsTable)
          .set({ stock: String(newStock) })
          .where(eq(ingredientsTable.id, ingredientId));
        movements.push({
          date: dateKey(parsed.data.date),
          ingredientId,
          movementType: "sale",
          quantityDelta: String(-used),
          stockBefore: String(oldStock),
          stockAfter: String(newStock),
          unitCost: String(number(ingredient.averageCost)),
          referenceId: sale.id,
          note: `Penjualan #${sale.id}`,
        });
      }
      if (movements.length) await tx.insert(stockMovementsTable).values(movements);
      return {
        id: sale.id,
        date: sale.date,
        totalRevenue,
        totalCostOfGoodsSold,
        grossProfit: roundMoney(totalRevenue - totalCostOfGoodsSold),
        warnings,
        items: saleLines,
      };
    });
    const validated = RecordSaleResponse.parse(result);
    res.status(201).json({ ...validated, date: dateKey(validated.date) });
  }),
);

router.post(
  "/erp/stock-counts",
  safe(async (req, res) => {
    const parsed = RecordStockCountBody.safeParse(req.body);
    if (!parsed.success) {
      invalid(res, parsed.error.message);
      return;
    }
    if (!requireMaxItems(parsed.data.items, 100, res)) return;
    if (!requireFiniteNumbers(parsed.data.items.map((item) => item.countedStock), res)) return;
    const ids = parsed.data.items.map((item) => item.ingredientId);
    if (new Set(ids).size !== ids.length) {
      invalid(res, "Setiap bahan hanya boleh dicatat satu kali.");
      return;
    }

    const updated = await db.transaction(async (tx) => {
      const locked = await tx
        .select()
        .from(ingredientsTable)
        .where(inArray(ingredientsTable.id, ids))
        .orderBy(asc(ingredientsTable.id))
        .for("update");
      if (locked.length !== ids.length) {
        throw new HttpError("Ada bahan yang tidak ditemukan.", 400);
      }
      const byId = new Map(locked.map((row) => [row.id, row]));
      const movements: Array<typeof stockMovementsTable.$inferInsert> = [];
      const rows = [];
      for (const item of parsed.data.items) {
        const ingredient = byId.get(item.ingredientId)!;
        const oldStock = number(ingredient.stock);
        const difference = item.countedStock - oldStock;
        const [row] = await tx
          .update(ingredientsTable)
          .set({ stock: String(item.countedStock) })
          .where(eq(ingredientsTable.id, item.ingredientId))
          .returning();
        rows.push(asIngredient(row));
        if (Math.abs(difference) > 1e-9) {
          movements.push({
            date: dateKey(parsed.data.date),
            ingredientId: item.ingredientId,
            movementType: "adjustment",
            quantityDelta: String(difference),
            stockBefore: String(oldStock),
            stockAfter: String(item.countedStock),
            unitCost: String(number(ingredient.averageCost)),
            note: "Penyesuaian stok opname",
          });
        }
      }
      if (movements.length) await tx.insert(stockMovementsTable).values(movements);
      return rows;
    });
    res.json(RecordStockCountResponse.parse(updated));
  }),
);

// ==========================================
// ENDPOINT: HAPUS BAHAN (INGREDIENT)
// ==========================================
router.delete(
  "/erp/ingredients/:ingredientId",
  safe(async (req, res) => {
    const rawId = req.params.ingredientId;
    const id = Number(rawId);
    if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(id) || id <= 0) {
      invalid(res, "ID bahan tidak valid.");
      return;
    }

    await db.transaction(async (tx) => {
      // 1. Cek apakah bahan ada
      const [ingredient] = await tx
        .select()
        .from(ingredientsTable)
        .where(eq(ingredientsTable.id, id))
        .for("update");
      if (!ingredient) {
        throw new HttpError("Bahan tidak ditemukan.", 404);
      }
      const remainingStock = number(ingredient.stock);
      if (Math.abs(remainingStock) > 1e-9) {
        throw new HttpError(
          `Bahan masih memiliki stok ${remainingStock} ${ingredient.unit}. Habiskan atau sesuaikan stok melalui stok opname sebelum menghapus.`,
          409,
        );
      }

      // 2. Cek apakah masih dipakai di dalam resep produk (recipeItemsTable)
      const [usedInRecipe] = await tx
        .select({ productId: recipeItemsTable.productId })
        .from(recipeItemsTable)
        .where(eq(recipeItemsTable.ingredientId, id))
        .limit(1);
      if (usedInRecipe) {
        throw new HttpError("Bahan tidak dapat dihapus karena masih digunakan dalam resep produk.", 409);
      }

      // 3. Cek apakah masih ada riwayat pembelian (purchaseDetailsTable)
      const [usedInPurchase] = await tx
        .select({ purchaseId: purchaseDetailsTable.purchaseId })
        .from(purchaseDetailsTable)
        .where(eq(purchaseDetailsTable.ingredientId, id))
        .limit(1);
      if (usedInPurchase) {
        throw new HttpError("Bahan tidak dapat dihapus karena memiliki riwayat catatan belanja.", 409);
      }

      const [usedInMovement] = await tx
        .select({ id: stockMovementsTable.id })
        .from(stockMovementsTable)
        .where(eq(stockMovementsTable.ingredientId, id))
        .limit(1);
      if (usedInMovement) {
        throw new HttpError("Bahan tidak dapat dihapus karena memiliki riwayat pergerakan stok.", 409);
      }

      // 4. Hapus jika aman
      await tx.delete(ingredientsTable).where(eq(ingredientsTable.id, id));
    });

    res.json({ success: true });
  }),
);

// ==========================================
// ENDPOINT: HAPUS PRODUK (PRODUCT)
// ==========================================
router.delete(
  "/erp/products/:productId",
  safe(async (req, res) => {
    const rawId = req.params.productId;
    const id = Number(rawId);
    if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(id) || id <= 0) {
      invalid(res, "ID produk tidak valid.");
      return;
    }

    await db.transaction(async (tx) => {
      // 1. Cek apakah produk ada
      const [product] = await tx
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, id))
        .for("update");
      if (!product) {
        throw new HttpError("Produk tidak ditemukan.", 404);
      }

      if (Math.abs(number(product.stock)) > 1e-9) {
        throw new HttpError("Produk masih memiliki stok. Habiskan atau sesuaikan stok sebelum menghapus.", 409);
      }

      // 2. Cek apakah masih ada riwayat penjualan (salesDetailsTable)
      const [usedInSales] = await tx
        .select({ salesId: salesDetailsTable.salesId })
        .from(salesDetailsTable)
        .where(eq(salesDetailsTable.productId, id))
        .limit(1);
      if (usedInSales) {
        throw new HttpError("Produk tidak dapat dihapus karena memiliki riwayat catatan penjualan.", 409);
      }

      // 3. Hapus relasi resep terlebih dahulu (jika ada) agar tidak melanggar foreign key
      await tx.delete(recipeItemsTable).where(eq(recipeItemsTable.productId, id));

      // 4. Hapus produk
      await tx.delete(productsTable).where(eq(productsTable.id, id));
    });

    res.json({ success: true });
  }),
);

export default router;
