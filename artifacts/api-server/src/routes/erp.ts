import { recipeConversionFactor, validRecipeQuantity } from '../lib/recipe-units';
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or } from "drizzle-orm";
import {
  CreateIngredientBody,
  CreateIngredientResponse,
  CreateProductBody,
  CreateProductResponse,
  GetErpStateResponse,
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
  auditLogTable,
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
  recipeVersionsTable,
  salesDetailsTable,
  salesTable,
  stockMovementsTable,
} from "@workspace/db";
import { Router, type IRouter, type Request, type RequestHandler, type Response } from "express";
import { checkRole, requireOperationalRole, verifyToken, type AuthRequest } from "../lib/auth";
import { isAllowedBusinessDate, wibDateKey } from "../lib/business-date";
import { preparationComponentCost } from "../lib/costing";
import { movingAverageAfterReceipt } from "../lib/moving-average";
import { normalizeComputedQuantity, validStoredQuantity } from "../lib/quantity";
import { toCsv, toExcelHtml, toPdf, type ReportTable } from "../lib/report-export";

const router: IRouter = Router();
router.use(verifyToken, requireOperationalRole("admin", "user"));

router.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  res.on("finish", () => {
    const actor = (req as AuthRequest).authUser;
    if (!actor || res.statusCode >= 500) return;
    const details = req.body && typeof req.body === "object" ? JSON.stringify(req.body) : undefined;
    void db.insert(auditLogTable).values({
      actorId: actor.id,
      actorUsername: actor.username,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      details,
      beforeData: res.locals.auditBefore ? JSON.stringify(res.locals.auditBefore) : undefined,
      afterData: res.locals.auditAfter ? JSON.stringify(res.locals.auditAfter) : undefined,
      reason: typeof req.headers["x-audit-reason"] === "string" ? req.headers["x-audit-reason"] : undefined,
    }).catch((error: unknown) => req.log?.warn({ err: error }, "ERP audit log write failed"));
  });
  next();
});

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

async function stateDbQuery<T>(req: Request, component: string, operation: PromiseLike<T>): Promise<T | null> {
  try {
    return await operation;
  } catch (error: unknown) {
    req.log.error({ err: error, component }, "ERP state component query failed");
    return null;
  }
}

function unavailableState(res: Response, failedComponents: string[]): void {
  res.status(503).json({
    status: "degraded",
    error: "Sebagian data ERP gagal dimuat.",
    failedComponents,
  });
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

function checkedInputQuantity(value: number, label: string, options: { allowNegative?: boolean; allowZero?: boolean } = {}): number {
  if (!validStoredQuantity(value, options)) {
    throw new HttpError(`${label} harus sesuai numeric(14,3): maksimal tiga desimal dan tidak melebihi 99.999.999.999,999.`, 400);
  }
  return value;
}

function checkedComputedQuantity(value: number, label: string): number {
  const normalized = normalizeComputedQuantity(value);
  if (normalized === null) {
    throw new HttpError(`${label} tidak dapat disimpan pada numeric(14,3) atau menjadi nol setelah pembulatan.`, 400);
  }
  return normalized;
}

function dateKey(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function checkedBusinessDate(value: unknown, label: string): string {
  if (!isAllowedBusinessDate(value)) {
    throw new HttpError(`${label} wajib berformat YYYY-MM-DD, valid secara kalender, dan tidak boleh melewati hari ini di WIB.`, 400);
  }
  return value;
}

function normalizeIngredientName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("id-ID")
    .replace(/(^|[\s/(-])(\p{L})/gu, (_match, prefix: string, letter: string) =>
      `${prefix}${letter.toLocaleUpperCase("id-ID")}`,
    );
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
    active: row.active,
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
        recipeUnit: matang[0].unit,
      })
      .onConflictDoNothing();
  }
}


function jakartaToday(): string {
  return wibDateKey();
}

function dateRange(startDate: string, endDate: string): string[] {
  checkedBusinessDate(startDate, "Tanggal awal");
  checkedBusinessDate(endDate, "Tanggal akhir");
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
  safe(async (req, res) => {
    // await ensureSeedData();   // disabled – prevents auto‑reseed
    const todayDate = jakartaToday();
    const [ingredientRows, productRows, recipeRows, purchaseHeaders, saleHeaders, today] = await Promise.all([
      stateDbQuery(req, "ingredients", db.select().from(ingredientsTable).orderBy(asc(ingredientsTable.name))),
      stateDbQuery(req, "products", db.select().from(productsTable).orderBy(asc(productsTable.name))),
      stateDbQuery(req, "recipes", db
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
        .orderBy(asc(recipeItemsTable.productId), asc(ingredientsTable.name))),
      stateDbQuery(req, "purchase_headers", db
        .select()
        .from(purchasesTable)
        .orderBy(desc(purchasesTable.date), desc(purchasesTable.id))
        .limit(6)),
      stateDbQuery(req, "sale_headers", db
        .select()
        .from(salesTable)
        .orderBy(desc(salesTable.date), desc(salesTable.id))
        .limit(6)),
      stateDbQuery(req, "today_finance", financeReport(todayDate, todayDate)),
    ]);

    const primaryComponents = [
      ["ingredients", ingredientRows],
      ["products", productRows],
      ["recipes", recipeRows],
      ["purchase_headers", purchaseHeaders],
      ["sale_headers", saleHeaders],
      ["today_finance", today],
    ] as const;
    const failedPrimary = primaryComponents.filter(([, value]) => value === null).map(([component]) => component);
    if (failedPrimary.length) {
      unavailableState(res, failedPrimary);
      return;
    }

    const purchaseIds = purchaseHeaders!.map((row) => row.id);
    const saleIds = saleHeaders!.map((row) => row.id);
    const [purchaseLines, saleLines] = await Promise.all([
      purchaseIds.length
        ? stateDbQuery(req, "purchase_details", db
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
        .where(inArray(purchaseDetailsTable.purchaseId, purchaseIds)))
        : Promise.resolve([]),
      saleIds.length
      ? stateDbQuery(req, "sale_details", db
        .select()
        .from(salesDetailsTable)
        .where(inArray(salesDetailsTable.salesId, saleIds)))
      : Promise.resolve([]),
    ]);
    const failedDetails = [
      ...(purchaseLines === null ? ["purchase_details"] : []),
      ...(saleLines === null ? ["sale_details"] : []),
    ];
    if (failedDetails.length) {
      unavailableState(res, failedDetails);
      return;
    }

    const recentPurchases = purchaseHeaders!.map((purchase) => ({
      id: purchase.id,
      date: purchase.date,
      supplierType: purchase.supplierType,
      totalCost: number(purchase.totalCost),
      items: purchaseLines!
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
    const recentSales = saleHeaders!.map((sale) => {
      const totalRevenue = number(sale.totalRevenue);
      const totalCostOfGoodsSold = number(sale.totalCostOfGoodsSold);
      return {
        id: sale.id,
        date: sale.date,
        totalRevenue,
        totalCostOfGoodsSold,
        grossProfit: roundMoney(totalRevenue - totalCostOfGoodsSold),
        items: saleLines!
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

    const data = {
      dataStatus: "ready" as const,
      generatedAt: new Date().toISOString(),
      ingredients: ingredientRows!.map(asIngredient),
      products: productRows!.map(asProduct),
      recipes: recipeRows!.map((row) => ({
        productId: row.productId,
        ingredientId: row.ingredientId,
        ingredientName: row.ingredientName,
        unit: row.unit,
        recipeUnit: row.recipeUnit,
        qtyRequired: number(row.qtyRequired),
      })),
      recentPurchases,
      recentSales,
      today: today!.days[0],
      lowStockCount: ingredientRows!.filter((row) => number(row.stock) <= number(row.minStock)).length,
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
    const startDate = checkedBusinessDate(req.query.startDate, "Tanggal awal");
    const endDate = checkedBusinessDate(req.query.endDate, "Tanggal akhir");
    const data = await financeReport(startDate, endDate);
    const validated = GetFinanceReportResponse.parse(data);
    res.json({
      ...validated,
      startDate: dateKey(validated.startDate),
      endDate: dateKey(validated.endDate),
      days: validated.days.map((day) => ({ ...day, date: dateKey(day.date) })),
    });
  }),
);

router.get(
  "/erp/export",
  checkRole("admin"),
  safe(async (_req, res) => {
    const [ingredients, products, preparations, recipeItems, preparationRecipeItems, productPreparationItems,
      preparationBatches, purchases, purchaseDetails, sales, salesDetails, stockMovements,
      preparationStockMovements, waste, operatingExpenses, auditLogs, recipeVersions] = await Promise.all([
      db.select().from(ingredientsTable),
      db.select().from(productsTable),
      db.select().from(preparationsTable),
      db.select().from(recipeItemsTable),
      db.select().from(preparationRecipeItemsTable),
      db.select().from(productPreparationItemsTable),
      db.select().from(preparationBatchesTable),
      db.select().from(purchasesTable),
      db.select().from(purchaseDetailsTable),
      db.select().from(salesTable),
      db.select().from(salesDetailsTable),
      db.select().from(stockMovementsTable),
      db.select().from(preparationStockMovementsTable),
      db.select().from(wasteTable),
      db.select().from(operatingExpensesTable),
      db.select().from(auditLogTable),
      db.select().from(recipeVersionsTable),
    ]);
    res.setHeader("Content-Disposition", `attachment; filename="kasapink-erp-export-${jakartaToday()}.json"`);
    res.json({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      data: { ingredients, products, preparations, recipeItems, preparationRecipeItems, productPreparationItems,
        preparationBatches, purchases, purchaseDetails, sales, salesDetails, stockMovements,
        preparationStockMovements, waste, operatingExpenses, auditLogs, recipeVersions },
    });
  }),
);

router.get(
  "/erp/audit-log",
  checkRole("admin"),
  safe(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 1), 500);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const [rows, totalRows] = await Promise.all([
      db.select().from(auditLogTable).orderBy(desc(auditLogTable.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(auditLogTable),
    ]);
    res.json({ items: rows, pagination: { limit, offset, total: Number(totalRows[0]?.total ?? 0) } });
  }),
);

router.get(
  "/erp/report-export",
  checkRole("admin"),
  safe(async (req, res) => {
    const type = String(req.query.type ?? "finance");
    const format = String(req.query.format ?? "csv");
    if (!["finance", "stock", "transactions"].includes(type)) throw new HttpError("Jenis laporan tidak dikenali.", 400);
    if (!["pdf", "xls", "csv"].includes(format)) throw new HttpError("Format laporan tidak dikenali.", 400);
    const startDate = String(req.query.startDate ?? "2000-01-01");
    const endDate = String(req.query.endDate ?? jakartaToday());
    if (type !== "stock") {
      checkedBusinessDate(startDate, "Tanggal awal ekspor");
      checkedBusinessDate(endDate, "Tanggal akhir ekspor");
      if (startDate > endDate) throw new HttpError("Tanggal awal ekspor harus sebelum atau sama dengan tanggal akhir.", 400);
    }
    let table: ReportTable;
    const formatRupiah = (value: number) => `Rp ${value.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (type === "stock") {
      const [ingredients, preparations] = await Promise.all([
        db.select().from(ingredientsTable).orderBy(asc(ingredientsTable.name)),
        db.select().from(preparationsTable).orderBy(asc(preparationsTable.name)),
      ]);
      const stockRows = [
        ...ingredients.map((row) => ["Bahan", row.name, row.category, row.stockType, row.unit, number(row.stock), number(row.minStock), number(row.averageCost), roundMoney(number(row.stock) * number(row.averageCost))] as Array<string | number>),
        ...preparations.map((row) => ["Preparation", row.name, "Preparation", "Makanan", row.unit, number(row.stock), "—", number(row.averageCost), roundMoney(number(row.stock) * number(row.averageCost))] as Array<string | number>),
      ];
      table = { title: "Laporan Posisi Persediaan", subtitle: `Posisi stok saat laporan dibuat (WIB): ${jakartaToday()} • Bahan dan Preparation`, orientation: "landscape",
        columns: ["Jenis", "Nama", "Kategori", "Lini", "Unit", "Stok", "Minimum", "HPP/unit", "Nilai stok"],
        decimalColumns: ["HPP/unit", "Nilai stok"], currencyColumns: ["HPP/unit", "Nilai stok"], columnWeights: [0.9, 1.8, 1.2, 0.95, 0.6, 0.7, 0.7, 1.15, 1.25],
        summary: [{ label: "Item bahan", value: String(ingredients.length) }, { label: "Preparation", value: String(preparations.length) }, { label: "Nilai persediaan", value: formatRupiah(stockRows.reduce((sum, row) => sum + Number(row[8]), 0)) }],
        note: "Nilai persediaan = stok saat ini × HPP rata-rata. Bukan nilai penjualan; termasuk stok nol/negatif jika tercatat.",
        rows: stockRows };
    } else if (type === "transactions") {
      const [purchases, sales, wasteRows, expenseRows, ingredientAdjustments, prepAdjustments, ingredientCatalog, prepCatalog] = await Promise.all([
        db.select({ date: purchasesTable.date, id: purchasesTable.id, supplierType: purchasesTable.supplierType, ingredientName: ingredientsTable.name, ingredientUnit: ingredientsTable.unit, quantity: purchaseDetailsTable.quantity, totalCost: purchaseDetailsTable.totalCost }).from(purchaseDetailsTable).innerJoin(purchasesTable, eq(purchaseDetailsTable.purchaseId, purchasesTable.id)).innerJoin(ingredientsTable, eq(purchaseDetailsTable.ingredientId, ingredientsTable.id)),
        db.select({ date: salesTable.date, id: salesTable.id, productName: salesDetailsTable.productName, quantity: salesDetailsTable.quantity, revenue: salesDetailsTable.revenue, costOfGoodsSold: salesDetailsTable.costOfGoodsSold }).from(salesDetailsTable).innerJoin(salesTable, eq(salesDetailsTable.salesId, salesTable.id)),
        db.select().from(wasteTable).where(and(gte(wasteTable.date, startDate), lte(wasteTable.date, endDate))),
        db.select().from(operatingExpensesTable).where(and(gte(operatingExpensesTable.date, startDate), lte(operatingExpensesTable.date, endDate))),
        db.select().from(stockMovementsTable).where(and(gte(stockMovementsTable.date, startDate), lte(stockMovementsTable.date, endDate), eq(stockMovementsTable.movementType, "adjustment"))),
        db.select().from(preparationStockMovementsTable).where(and(gte(preparationStockMovementsTable.date, startDate), lte(preparationStockMovementsTable.date, endDate), eq(preparationStockMovementsTable.movementType, "adjustment"))),
        db.select({ id: ingredientsTable.id, name: ingredientsTable.name, unit: ingredientsTable.unit }).from(ingredientsTable),
        db.select({ id: preparationsTable.id, name: preparationsTable.name, unit: preparationsTable.unit }).from(preparationsTable),
      ]);
      const ingredientById = new Map(ingredientCatalog.map(item => [item.id, item]));
      const prepById = new Map(prepCatalog.map(item => [item.id, item]));
      const quantityWithUnit = (quantity: number, unit?: string) => `${quantity.toLocaleString("id-ID", { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}`;
      const fallback = (value?: string | null) => value?.trim() || "—";
      table = { title: "Histori Aktivitas Usaha", subtitle: `Periode ${startDate} sampai ${endDate} (WIB)`, orientation: "landscape",
        columns: ["Tanggal", "Aktivitas", "Ref", "Item/Kategori", "Jumlah", "Nilai", "HPP/Biaya", "Keterangan/Alasan"],
        decimalColumns: ["Nilai", "HPP/Biaya"], currencyColumns: ["Nilai", "HPP/Biaya"], columnWeights: [1, 1.15, 0.48, 1.8, 0.65, 1.1, 1.15, 1.65],
        note: "Nilai: pemasukan penjualan atau belanja bahan. HPP/Biaya: HPP terjual, waste, operasional, atau nilai selisih stok. Jenis biaya berbeda tidak boleh langsung dijumlahkan karena dapat menyebabkan penghitungan ganda.",
        rows: [
        ...purchases.filter(row => dateKey(row.date) >= startDate && dateKey(row.date) <= endDate)
          .map(row => [dateKey(row.date), "Pembelian", row.id, row.ingredientName, quantityWithUnit(number(row.quantity), row.ingredientUnit), number(row.totalCost), "", "—"]),
        ...sales.filter(row => dateKey(row.date) >= startDate && dateKey(row.date) <= endDate)
          .map(row => [dateKey(row.date), "Penjualan", row.id, row.productName, quantityWithUnit(number(row.quantity), "pcs"), number(row.revenue), number(row.costOfGoodsSold), "—"]),
        ...wasteRows.map(row => {
          const item = row.preparationId ? prepById.get(row.preparationId) : ingredientById.get(row.ingredientId ?? -1);
          return [row.date, "Waste", row.id, item?.name ?? "Item tidak ditemukan", quantityWithUnit(number(row.quantity), row.unit), "", number(row.totalCost), fallback(row.reason) + (row.note?.trim() ? " — " + row.note.trim() : "")];
        }),
        ...expenseRows.map(row => [row.date, "Biaya Operasional", row.id, row.category, "—", "", number(row.amount), fallback(row.description)]),
        ...ingredientAdjustments.map(row => {
          const item = ingredientById.get(row.ingredientId);
          return [row.date, "Koreksi Bahan", row.id, item?.name ?? "Bahan tidak ditemukan", quantityWithUnit(number(row.quantityDelta), item?.unit), "", row.varianceValue === null ? "" : number(row.varianceValue), fallback(row.note)];
        }),
        ...prepAdjustments.map(row => {
          const item = prepById.get(row.preparationId);
          return [row.date, "Koreksi Preparation", row.id, item?.name ?? "Preparation tidak ditemukan", quantityWithUnit(number(row.quantityDelta), item?.unit), "", row.varianceValue === null ? "" : number(row.varianceValue), fallback(row.note)];
        }),
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      };
    } else {
      const report = await financeReport(startDate, endDate);
      table = { title: "Laporan Keuangan", subtitle: `Periode ${startDate} sampai ${endDate} (WIB)`, orientation: "portrait", note: "Laba kotor = penjualan dikurangi HPP produk terjual. Belanja bahan bukan pengurang tambahan laba kotor. Laba kotor belum termasuk biaya operasional, waste, dan selisih persediaan.", columns: ["Tanggal", "Penjualan", "HPP", "Belanja", "Laba kotor"], decimalColumns: ["Penjualan", "HPP", "Belanja", "Laba kotor"], summary: [
        { label: "Penjualan", value: formatRupiah(report.revenue) },
        { label: "HPP", value: formatRupiah(report.costOfGoodsSold) },
        { label: "Belanja", value: formatRupiah(report.purchases) },
        { label: "Laba kotor", value: formatRupiah(report.grossProfit) },
      ], rows: report.days.map((day) => [day.date, day.revenue, day.costOfGoodsSold, day.purchases, day.grossProfit]) };
    }
    const stamp = `${type}-${startDate}-${endDate}`;
    if (format === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="kasapink-${stamp}.pdf"`);
      res.end(toPdf(table));
      return;
    }
    if (format === "xls") {
      res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="kasapink-${stamp}.xls"`);
      res.send(toExcelHtml(table));
      return;
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="kasapink-${stamp}.csv"`);
    res.send(`\ufeff${toCsv(table)}`);
  }),
);

router.get(
  "/erp/ingredients",
  safe(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const search = String(req.query.search ?? "").trim();
    const stockType = String(req.query.stockType ?? "").trim();
    const lowStock = String(req.query.lowStock ?? "") === "true";
    const filters = [
      eq(ingredientsTable.active, true),
      search ? or(ilike(ingredientsTable.name, `%${search}%`), ilike(ingredientsTable.category, `%${search}%`)) : undefined,
      stockType === "Makanan" || stockType === "Parfum" ? eq(ingredientsTable.stockType, stockType) : undefined,
      lowStock ? lte(ingredientsTable.stock, ingredientsTable.minStock) : undefined,
    ].filter(Boolean);
    const where = filters.length ? and(...filters) : undefined;
    const [rows, totalRows] = await Promise.all([
      db.select().from(ingredientsTable).where(where).orderBy(asc(ingredientsTable.name)).limit(limit).offset(offset),
      db.select({ total: count() }).from(ingredientsTable).where(where),
    ]);
    const ids = rows.map((row) => row.id);
    const usedIds = new Set<number>();
    if (ids.length) {
      const usages = await Promise.all([
        db.select({ ingredientId: recipeItemsTable.ingredientId }).from(recipeItemsTable).where(inArray(recipeItemsTable.ingredientId, ids)),
        db.select({ ingredientId: preparationRecipeItemsTable.ingredientId }).from(preparationRecipeItemsTable).where(inArray(preparationRecipeItemsTable.ingredientId, ids)),
        db.select({ ingredientId: purchaseDetailsTable.ingredientId }).from(purchaseDetailsTable).where(inArray(purchaseDetailsTable.ingredientId, ids)),
        db.select({ ingredientId: stockMovementsTable.ingredientId }).from(stockMovementsTable).where(inArray(stockMovementsTable.ingredientId, ids)),
        db.select({ ingredientId: wasteTable.ingredientId }).from(wasteTable).where(inArray(wasteTable.ingredientId, ids)),
      ]);
      for (const usage of usages.flat()) {
        if (usage.ingredientId !== null) usedIds.add(usage.ingredientId);
      }
    }
    res.json({
      items: rows.map((row) => ({
        ...asIngredient(row),
        unitLocked: Math.abs(number(row.stock)) > 1e-9 || usedIds.has(row.id),
      })),
      pagination: { limit, offset, total: Number(totalRows[0]?.total ?? 0) },
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
    if (!requireFiniteNumbers([parsed.data.stock, parsed.data.minStock, parsed.data.openingUnitCost], res)) return;
    checkedInputQuantity(parsed.data.stock, "Stok awal", { allowNegative: false });
    checkedInputQuantity(parsed.data.minStock, "Stok minimum", { allowNegative: false });
    const { openingUnitCost, ...ingredientInput } = parsed.data;
    const normalizedName = normalizeIngredientName(ingredientInput.name);
    if (!normalizedName) {
      invalid(res, "Nama bahan wajib diisi.");
      return;
    }
    const ingredient = { ...ingredientInput, name: normalizedName };
    const openingCost = String(roundMoney(openingUnitCost));
    const [row] = await db
      .insert(ingredientsTable)
      .values({
        ...ingredient,
        stock: String(ingredient.stock),
        minStock: String(ingredient.minStock),
        lastPrice: openingCost,
        averageCost: openingCost,
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
    if (body.data.minStock !== undefined) checkedInputQuantity(body.data.minStock, "Stok minimum", { allowNegative: false });
    const update: {
      name?: string;
      category?: string;
      stockType?: "Makanan" | "Parfum";
      unit?: string;
      minStock?: string;
    } = {};
    if (body.data.name !== undefined) {
      update.name = normalizeIngredientName(body.data.name);
      if (!update.name) {
        invalid(res, "Nama bahan wajib diisi.");
        return;
      }
    }
    if (body.data.category !== undefined) update.category = body.data.category;
    if (body.data.stockType !== undefined) update.stockType = body.data.stockType;
    if (body.data.unit !== undefined) update.unit = body.data.unit;
    if (body.data.minStock !== undefined) update.minStock = String(body.data.minStock);
    const row = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(ingredientsTable)
        .where(eq(ingredientsTable.id, params.data.ingredientId))
        .for("update");
      if (!current) throw new HttpError("Bahan tidak ditemukan.", 404);

      if (update.unit !== undefined && update.unit !== current.unit) {
        const lockReasons: string[] = [];
        if (Math.abs(number(current.stock)) > 1e-9) lockReasons.push("masih memiliki stok");

        const [productRecipe] = await tx
          .select({ id: recipeItemsTable.id })
          .from(recipeItemsTable)
          .where(eq(recipeItemsTable.ingredientId, current.id))
          .limit(1);
        const [preparationRecipe] = await tx
          .select({ id: preparationRecipeItemsTable.id })
          .from(preparationRecipeItemsTable)
          .where(eq(preparationRecipeItemsTable.ingredientId, current.id))
          .limit(1);
        if (productRecipe || preparationRecipe) lockReasons.push("digunakan dalam resep");

        const [purchase] = await tx
          .select({ id: purchaseDetailsTable.id })
          .from(purchaseDetailsTable)
          .where(eq(purchaseDetailsTable.ingredientId, current.id))
          .limit(1);
        const [movement] = await tx
          .select({ id: stockMovementsTable.id })
          .from(stockMovementsTable)
          .where(eq(stockMovementsTable.ingredientId, current.id))
          .limit(1);
        const [wasteEntry] = await tx
          .select({ id: wasteTable.id })
          .from(wasteTable)
          .where(eq(wasteTable.ingredientId, current.id))
          .limit(1);
        if (purchase || movement || wasteEntry) lockReasons.push("memiliki riwayat transaksi");

        if (lockReasons.length) {
          throw new HttpError(
            `Satuan ${current.name} tidak dapat diubah karena ${lockReasons.join(" dan ")}. Gunakan aksi konversi satuan khusus agar stok, HPP, minimum stok, dan resep tetap konsisten.`,
            409,
          );
        }
      }

      const [updated] = await tx
        .update(ingredientsTable)
        .set(update)
        .where(eq(ingredientsTable.id, params.data.ingredientId))
        .returning();
      return updated;
    });
    res.json(UpdateIngredientResponse.parse(asIngredient(row)));
  }),
);

router.get(
  "/erp/products",
  safe(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const search = String(req.query.search ?? "").trim();
    const businessType = String(req.query.businessType ?? "").trim();
    const filters = [
      search ? ilike(productsTable.name, `%${search}%`) : undefined,
      businessType === "Makanan" || businessType === "Parfum" ? eq(productsTable.businessType, businessType) : undefined,
    ].filter(Boolean);
    const where = filters.length ? and(...filters) : undefined;
    const [rows, totalRows] = await Promise.all([
      db.select().from(productsTable).where(where).orderBy(asc(productsTable.name)).limit(limit).offset(offset),
      db.select({ total: count() }).from(productsTable).where(where),
    ]);
    res.json({ items: rows.map(asProduct), pagination: { limit, offset, total: Number(totalRows[0]?.total ?? 0) } });
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
    if (!parsed.data.needsRecipe) checkedInputQuantity(parsed.data.stock, "Stok produk", { allowNegative: false });
    const row = await db.transaction(async (tx) => {
      if (parsed.data.autoRecipeIngredientId !== undefined) {
        const [ingredient] = await tx
          .select({ id: ingredientsTable.id, category: ingredientsTable.category })
          .from(ingredientsTable)
          .where(eq(ingredientsTable.id, parsed.data.autoRecipeIngredientId));
        if (!ingredient) throw new HttpError("Bahan untuk auto-resep tidak ditemukan.", 400);
        if (isOperationalIngredient(ingredient.category)) {
          throw new HttpError("Pilih bahan utama; bahan berkategori Mikro/Operasional tidak masuk resep.", 400);
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
    if (body.data.stock !== undefined) checkedInputQuantity(body.data.stock, "Stok produk", { allowNegative: false });
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
    if (body.data.items.some((item) => !validRecipeQuantity(item.qtyRequired))) return invalid(res, "Jumlah resep harus positif, maksimal tiga angka desimal. Gunakan satuan lebih kecil untuk pemakaian kecil.");
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
      const rows = ids.length
        ? await tx
          .select({ id: ingredientsTable.id, category: ingredientsTable.category, unit: ingredientsTable.unit, name: ingredientsTable.name, active: ingredientsTable.active })
          .from(ingredientsTable)
          .where(inArray(ingredientsTable.id, ids))
          .orderBy(asc(ingredientsTable.id))
          .for("update")
        : [];
      if (rows.length !== ids.length) throw new HttpError("Ada bahan resep yang tidak ditemukan.", 400);
      if (rows.some((row) => !row.active)) throw new HttpError("Bahan yang sudah dihapus tidak dapat dipakai dalam resep.", 409);
      if (rows.some((row) => isOperationalIngredient(row.category))) {
        throw new HttpError("Resep hanya menerima bahan utama; keluarkan bahan berkategori Mikro/Operasional.", 400);
      }
      const beforeRecipe = await tx.select().from(recipeItemsTable).where(eq(recipeItemsTable.productId, params.data.productId));
      const ingredientMap = new Map(rows.map((row) => [row.id, row]));
      const recipeRows = body.data.items.map((item) => {
        const ingredient = ingredientMap.get(item.ingredientId)!;
        const conversionFactor = recipeConversionFactor(item.recipeUnit, ingredient.unit);
        if (conversionFactor === null) {
          throw new HttpError(`Satuan resep ${item.recipeUnit} tidak kompatibel dengan satuan stok ${ingredient.unit} untuk bahan ${ingredient.name}.`, 400);
        }
        checkedComputedQuantity(item.qtyRequired * conversionFactor, `Hasil konversi resep ${ingredient.name}`);
        return { productId: params.data.productId, ingredientId: item.ingredientId, qtyRequired: String(item.qtyRequired), recipeUnit: item.recipeUnit, conversionFactor: String(conversionFactor) };
      });
      await tx.delete(recipeItemsTable).where(eq(recipeItemsTable.productId, params.data.productId));
      if (recipeRows.length) await tx.insert(recipeItemsTable).values(recipeRows);
      const [latest] = await tx.select({ version: recipeVersionsTable.version }).from(recipeVersionsTable)
        .where(and(eq(recipeVersionsTable.scope, "product"), eq(recipeVersionsTable.parentId, params.data.productId)))
        .orderBy(desc(recipeVersionsTable.version)).limit(1);
      await tx.insert(recipeVersionsTable).values({ scope: "product", parentId: params.data.productId, version: (latest?.version ?? 0) + 1, snapshot: JSON.stringify(recipeRows), createdBy: (req as AuthRequest).authUser?.id });
      res.locals.auditBefore = beforeRecipe;
      res.locals.auditAfter = recipeRows;
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
function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function stringValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
const PrepBody = {
  safeParse(input: unknown): ParseResult<{ name: string; unit: string; yieldQty: number }> {
    const b = recordBody(input);
    if (!b || !stringValue(b.name) || b.name.length > 120 || !stringValue(b.unit) || b.unit.length > 30 || !positiveNumber(b.yieldQty) || !validStoredQuantity(b.yieldQty, { allowNegative: false, allowZero: false })) return { success: false, error: { message: "Nama, satuan, dan hasil standar prep wajib valid serta maksimal tiga angka desimal." } };
    return { success: true, data: { name: b.name, unit: b.unit, yieldQty: b.yieldQty } };
  }
};
const PrepRecipeBody = {
  safeParse(input: unknown): ParseResult<{ items: Array<{ ingredientId: number; qtyRequired: number; recipeUnit: string }> }> {
    const b = recordBody(input), items = b?.items;
    if (!Array.isArray(items) || items.length > 100 || items.some((x) => { const v = recordBody(x); return !v || !positiveInteger(v.ingredientId) || !validRecipeQuantity(Number(v.qtyRequired)) || !positiveNumber(v.qtyRequired) || !stringValue(v.recipeUnit) || v.recipeUnit.length > 30; })) return { success: false, error: { message: "Daftar resep prep tidak valid." } };
    const ingredientIds = items.map((x) => (x as Record<string, unknown>).ingredientId);
    if (new Set(ingredientIds).size !== ingredientIds.length) return { success: false, error: { message: "Bahan yang sama tidak boleh dicantumkan dua kali dalam resep prep." } };
    return { success: true, data: { items: items as Array<{ ingredientId: number; qtyRequired: number; recipeUnit: string }> } };
  }
};
const ProductPrepBody = {
  safeParse(input: unknown): ParseResult<{ items: Array<{ preparationId: number; qtyRequired: number; recipeUnit: string }> }> {
    const b = recordBody(input), items = b?.items;
    if (!Array.isArray(items) || items.length > 100 || items.some((x) => { const v = recordBody(x); return !v || !positiveInteger(v.preparationId) || !validRecipeQuantity(Number(v.qtyRequired)) || !positiveNumber(v.qtyRequired) || !stringValue(v.recipeUnit) || v.recipeUnit.length > 30; })) return { success: false, error: { message: "Daftar komponen prep produk tidak valid." } };
    const preparationIds = items.map((x) => (x as Record<string, unknown>).preparationId);
    if (new Set(preparationIds).size !== preparationIds.length) return { success: false, error: { message: "Preparation yang sama tidak boleh dicantumkan dua kali dalam produk." } };
    return { success: true, data: { items: items as Array<{ preparationId: number; qtyRequired: number; recipeUnit: string }> } };
  }
};
const BatchBody = {
  safeParse(input: unknown): ParseResult<{ date: string; targetQty: number; actualQty: number }> {
    const b = recordBody(input), d = b?.date;
    const date = typeof d === "string" && isAllowedBusinessDate(d) ? d : null;
    if (!b || !date || !positiveNumber(b.targetQty) || !positiveNumber(b.actualQty) || !validStoredQuantity(b.targetQty, { allowNegative: false, allowZero: false }) || !validStoredQuantity(b.actualQty, { allowNegative: false, allowZero: false })) return { success: false, error: { message: "Tanggal wajib YYYY-MM-DD yang valid dan tidak boleh di masa depan; target serta hasil aktual wajib valid dengan maksimal tiga angka desimal." } };
    return { success: true, data: { date, targetQty: b.targetQty, actualQty: b.actualQty } };
  }
};

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
    const beforeRecipe = await tx.select().from(preparationRecipeItemsTable).where(eq(preparationRecipeItemsTable.preparationId, preparationId));
    const rows = ids.length ? await tx.select({
      id: ingredientsTable.id, name: ingredientsTable.name, unit: ingredientsTable.unit, category: ingredientsTable.category, active: ingredientsTable.active,
    }).from(ingredientsTable).where(inArray(ingredientsTable.id, ids)).orderBy(asc(ingredientsTable.id)).for("update") : [];
    if (rows.length !== ids.length) throw new HttpError("Ada bahan prep yang tidak ditemukan.", 400);
    if (rows.some((row) => !row.active)) throw new HttpError("Bahan yang sudah dihapus tidak dapat dipakai dalam resep prep.", 409);
    const map = new Map(rows.map((r) => [r.id, r]));
    const recipeRows = parsed.data.items.map((item) => {
      const ingredient = map.get(item.ingredientId)!;
      if (isOperationalIngredient(ingredient.category)) throw new HttpError("Bahan Mikro/Operasional tidak dapat dipakai sebagai bahan prep.", 400);
      const factor = recipeConversionFactor(item.recipeUnit, ingredient.unit);
      if (factor === null) throw new HttpError(`Satuan ${item.recipeUnit} tidak kompatibel dengan stok ${ingredient.unit} untuk ${ingredient.name}.`, 400);
      checkedComputedQuantity(item.qtyRequired * factor, `Hasil konversi resep prep ${ingredient.name}`);
      return { preparationId, ingredientId: item.ingredientId, qtyRequired: String(item.qtyRequired), recipeUnit: item.recipeUnit, conversionFactor: String(factor) };
    });
    await tx.delete(preparationRecipeItemsTable).where(eq(preparationRecipeItemsTable.preparationId, preparationId));
    if (recipeRows.length) await tx.insert(preparationRecipeItemsTable).values(recipeRows);
    const [latest] = await tx.select({ version: recipeVersionsTable.version }).from(recipeVersionsTable)
      .where(and(eq(recipeVersionsTable.scope, "preparation"), eq(recipeVersionsTable.parentId, preparationId)))
      .orderBy(desc(recipeVersionsTable.version)).limit(1);
    await tx.insert(recipeVersionsTable).values({ scope: "preparation", parentId: preparationId, version: (latest?.version ?? 0) + 1, snapshot: JSON.stringify(recipeRows), createdBy: (req as AuthRequest).authUser?.id });
    res.locals.auditBefore = beforeRecipe;
    res.locals.auditAfter = recipeRows;
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
      checkedComputedQuantity(item.qtyRequired * factor, `Hasil konversi pemakaian prep ${prep.name}`);
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
    const ingredientIds = [...new Set(recipe.map((r) => r.ingredientId))].sort((a, b) => a - b);
    const locked = await tx.select().from(ingredientsTable).where(inArray(ingredientsTable.id, ingredientIds)).orderBy(asc(ingredientsTable.id)).for("update");
    if (locked.length !== ingredientIds.length) throw new HttpError("Bahan prep tidak lengkap.", 409);
    const byId = new Map(locked.map((r) => [r.id, r]));
    let totalCost = 0;
    const scale = parsed.data.targetQty / number(prep.yieldQty);
    if (!Number.isFinite(scale) || scale <= 0) throw new HttpError("Hasil standar prep tidak valid.", 400);
    for (const line of recipe) {
      const ing = byId.get(line.ingredientId)!;
      const used = checkedComputedQuantity(number(line.qtyRequired) * number(line.conversionFactor) * scale, `Pemakaian bahan ${ing.name}`);
      totalCost += used * number(ing.averageCost);
      const newStock = checkedComputedQuantity(number(ing.stock) - used, `Stok akhir bahan ${ing.name}`);
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
    const newStock = checkedComputedQuantity(number(prep.stock) + parsed.data.actualQty, `Stok akhir prep ${prep.name}`);
    const newAverageCost = movingAverageAfterReceipt({
      stockBefore: number(prep.stock),
      averageCostBefore: number(prep.averageCost),
      quantityReceived: parsed.data.actualQty,
      receiptTotalCost: totalCost,
      round: roundMoney,
    });
    const batchNumber = `P-${dateKey(parsed.data.date).replaceAll("-", "")}-${preparationId}-${Date.now()}`;
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
    return {
      id: batch.id, batchNumber, date: batch.date, targetQty: parsed.data.targetQty, actualQty: parsed.data.actualQty,
      totalCost, unitCost, yieldPercentage, status: "PRODUCED", prepStock: newStock, prepAverageCost: newAverageCost
    };
  });
  res.status(201).json(result);
}));


type WasteBodyData = {
  date: string;
  itemType: "ingredient" | "preparation";
  itemId: number;
  quantity: number;
  reason: string;
  note?: string;
};
type ExpenseBodyData = {
  date: string;
  category: string;
  description: string;
  amount: number;
  businessType: "Makanan" | "Parfum" | "Bersama";
};
type CostingSnapshotIngredient = {
  ingredientId: number;
  ingredientName?: string;
  stockUnit?: string;
  quantityRequired: number;
  recipeUnit: string;
  conversionFactor: number;
  averageCost: number;
  category?: string;
};
type CostingSnapshotPreparation = {
  preparationId: number;
  preparationName?: string;
  stockUnit?: string;
  quantityRequired: number;
  recipeUnit: string;
  conversionFactor: number;
  averageCost: number;
  yieldQty?: number;
  components?: CostingSnapshotIngredient[];
};
type CostingSnapshot = {
  version?: number;
  capturedAt?: string;
  valuationBasis?: string;
  ingredients?: CostingSnapshotIngredient[];
  preparations?: CostingSnapshotPreparation[];
};
type ValidationResult<T> = { success: true; data: T } | { success: false; error: { message: string } };

function parseCostingSnapshot(value: string | null): CostingSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as CostingSnapshot;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.ingredients) || !Array.isArray(parsed.preparations)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseWasteBody(input: unknown): ValidationResult<WasteBodyData> {
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const date = typeof body.date === "string" && isAllowedBusinessDate(body.date) ? body.date : null;
  const itemType = body.itemType;
  const itemId = Number(body.itemId);
  const quantity = Number(body.quantity);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const note = body.note === undefined ? undefined : String(body.note);
  if (!date) return { success: false, error: { message: "Tanggal waste wajib YYYY-MM-DD yang valid dan tidak boleh di masa depan." } };
  if (itemType !== "ingredient" && itemType !== "preparation") return { success: false, error: { message: "Jenis item waste tidak valid." } };
  if (!Number.isSafeInteger(itemId) || itemId <= 0) return { success: false, error: { message: "ID item waste tidak valid." } };
  if (!validStoredQuantity(quantity, { allowNegative: false, allowZero: false })) return { success: false, error: { message: "Jumlah waste harus positif, maksimal tiga desimal, dan sesuai kapasitas penyimpanan." } };
  if (!reason || reason.length > 120) return { success: false, error: { message: "Alasan waste wajib diisi dan maksimal 120 karakter." } };
  if (note !== undefined && note.length > 500) return { success: false, error: { message: "Catatan waste maksimal 500 karakter." } };
  return { success: true, data: { date, itemType, itemId, quantity, reason, note } };
}

function parseExpenseBody(input: unknown): ValidationResult<ExpenseBodyData> {
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const date = typeof body.date === "string" && isAllowedBusinessDate(body.date) ? body.date : null;
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const amount = Number(body.amount);
  const businessType = body.businessType;
  if (!date) return { success: false, error: { message: "Tanggal biaya operasional wajib YYYY-MM-DD yang valid dan tidak boleh di masa depan." } };
  if (!category || category.length > 80) return { success: false, error: { message: "Kategori biaya wajib diisi dan maksimal 80 karakter." } };
  if (!description || description.length > 200) return { success: false, error: { message: "Deskripsi biaya wajib diisi dan maksimal 200 karakter." } };
  if (!Number.isFinite(amount) || amount <= 0) return { success: false, error: { message: "Nominal biaya harus lebih besar dari 0." } };
  if (businessType !== "Makanan" && businessType !== "Parfum" && businessType !== "Bersama") return { success: false, error: { message: "Lini bisnis biaya tidak valid." } };
  return { success: true, data: { date, category, description, amount, businessType } };
}

router.post("/erp/waste", safe(async (req, res) => {
  const parsed = parseWasteBody(req.body);
  if (!parsed.success) return invalid(res, parsed.error.message);
  const result = await db.transaction(async (tx) => {
    let unit = "", unitCost = 0;
    if (parsed.data.itemType === "ingredient") {
      const [item] = await tx.select().from(ingredientsTable).where(eq(ingredientsTable.id, parsed.data.itemId)).for("update");
      if (!item) throw new HttpError("Bahan tidak ditemukan.", 404);
      unit = item.unit; unitCost = number(item.averageCost);
      const newStock = checkedComputedQuantity(number(item.stock) - parsed.data.quantity, `Stok akhir bahan ${item.name}`);
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
      const newStock = checkedComputedQuantity(number(item.stock) - parsed.data.quantity, `Stok akhir prep ${item.name}`);
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
  const parsed = parseExpenseBody(req.body);
  if (!parsed.success) return invalid(res, parsed.error.message);
  const [row] = await db.insert(operatingExpensesTable).values({
    date: dateKey(parsed.data.date), category: parsed.data.category.trim(), description: parsed.data.description.trim(), amount: String(roundMoney(parsed.data.amount)), businessType: parsed.data.businessType,
  }).returning();
  res.status(201).json({ id: row.id, date: row.date, category: row.category, description: row.description, amount: number(row.amount), businessType: row.businessType });
}));

router.get("/erp/fnb-report", safe(async (req, res) => {
  const startDate = checkedBusinessDate(req.query.startDate, "Tanggal awal laporan F&B");
  const endDate = checkedBusinessDate(req.query.endDate, "Tanggal akhir laporan F&B");
  if (startDate > endDate) throw new HttpError("Tanggal awal laporan F&B harus sebelum atau sama dengan tanggal akhir.", 400);
  const sales = await db.select().from(salesTable).where(and(gte(salesTable.date, startDate), lte(salesTable.date, endDate)));
  const saleIds = sales.map((x) => x.id);
  const [allDetails, ingredients, preps, waste, expenses, ingredientMovements, prepMovements] = await Promise.all([
    saleIds.length ? db.select().from(salesDetailsTable).where(inArray(salesDetailsTable.salesId, saleIds)) : Promise.resolve([]),
    db.select().from(ingredientsTable),
    db.select().from(preparationsTable),
    db.select().from(wasteTable).where(and(gte(wasteTable.date, startDate), lte(wasteTable.date, endDate))),
    db.select().from(operatingExpensesTable).where(and(gte(operatingExpensesTable.date, startDate), lte(operatingExpensesTable.date, endDate))),
    db.select().from(stockMovementsTable).where(and(gte(stockMovementsTable.date, startDate), lte(stockMovementsTable.date, endDate))),
    db.select().from(preparationStockMovementsTable).where(and(gte(preparationStockMovementsTable.date, startDate), lte(preparationStockMovementsTable.date, endDate))),
  ]);
  const details = allDetails.filter((line) => line.businessType === "Makanan");
  const ingredientById = new Map(ingredients.map((x) => [x.id, x]));
  const prepById = new Map(preps.map((x) => [x.id, x]));
  const fnbWaste = waste.filter((row) => row.preparationId != null || (row.ingredientId != null && ingredientById.get(row.ingredientId)?.stockType === "Makanan"));
  const menuMap = new Map<number, { productId: number; productName: string; quantity: number; revenue: number; recordedCogs: number }>();
  for (const line of details) {
    const row = menuMap.get(line.productId) ?? { productId: line.productId, productName: line.productName, quantity: 0, revenue: 0, recordedCogs: 0 };
    // This is booked COGS captured when the sale was recorded. It is not an
    // independent physical-inventory measurement and must not be presented as
    // an "actual vs theoretical" variance.
    row.quantity += line.quantity; row.revenue += number(line.revenue); row.recordedCogs += number(line.costOfGoodsSold);
    menuMap.set(line.productId, row);
  }
  const theoreticalIngredient = new Map<number, number>();
  const theoreticalIngredientValue = new Map<number, number>();
  const theoreticalPrep = new Map<number, number>();
  const theoreticalPrepValue = new Map<number, number>();
  let incompleteSnapshotLines = 0;
  for (const line of details) {
    const snapshot = parseCostingSnapshot(line.costingSnapshot);
    if (!snapshot) {
      incompleteSnapshotLines += 1;
      continue;
    }
    let lineIncomplete = false;
    for (const ingredient of snapshot.ingredients ?? []) {
      if (isOperationalIngredient(ingredient.category ?? "")) continue;
      const qty = number(ingredient.quantityRequired) * number(ingredient.conversionFactor) * line.quantity;
      theoreticalIngredient.set(ingredient.ingredientId, (theoreticalIngredient.get(ingredient.ingredientId) ?? 0) + qty);
      theoreticalIngredientValue.set(ingredient.ingredientId, (theoreticalIngredientValue.get(ingredient.ingredientId) ?? 0) + qty * number(ingredient.averageCost));
    }
    for (const prep of snapshot.preparations ?? []) {
      const prepQty = number(prep.quantityRequired) * number(prep.conversionFactor) * line.quantity;
      theoreticalPrep.set(prep.preparationId, (theoreticalPrep.get(prep.preparationId) ?? 0) + prepQty);
      theoreticalPrepValue.set(prep.preparationId, (theoreticalPrepValue.get(prep.preparationId) ?? 0) + prepQty * number(prep.averageCost));
      if (!Array.isArray(prep.components) || !Number.isFinite(number(prep.yieldQty)) || number(prep.yieldQty) <= 0) {
        lineIncomplete = true;
        continue;
      }
      for (const component of prep.components) {
        if (isOperationalIngredient(component.category ?? "")) continue;
        const qty = number(component.quantityRequired) * number(component.conversionFactor) / number(prep.yieldQty) * prepQty;
        theoreticalIngredient.set(component.ingredientId, (theoreticalIngredient.get(component.ingredientId) ?? 0) + qty);
        theoreticalIngredientValue.set(component.ingredientId, (theoreticalIngredientValue.get(component.ingredientId) ?? 0) + qty * number(component.averageCost));
      }
    }
    if (lineIncomplete) incompleteSnapshotLines += 1;
  }
  const actualIngredient = new Map<number, number>();
  const actualIngredientValue = new Map<number, number>();
  for (const m of ingredientMovements) {
    if (ingredientById.get(m.ingredientId)?.stockType === "Makanan" && ["sale", "prep_production", "waste"].includes(m.movementType) && number(m.quantityDelta) < 0) {
      const qty = Math.abs(number(m.quantityDelta));
      actualIngredient.set(m.ingredientId, (actualIngredient.get(m.ingredientId) ?? 0) + qty);
      actualIngredientValue.set(m.ingredientId, (actualIngredientValue.get(m.ingredientId) ?? 0) + qty * number(m.unitCost));
    }
  }
  const ingredientVariance = ingredients
    .filter((x) => actualIngredient.has(x.id) || theoreticalIngredient.has(x.id))
    .map((x) => {
      const actual = actualIngredient.get(x.id) ?? 0;
      const theoretical = theoreticalIngredient.get(x.id) ?? 0;
      const variance = actual - theoretical;
      const actualCost = actualIngredientValue.get(x.id) ?? 0;
      const theoreticalCost = theoreticalIngredientValue.get(x.id) ?? 0;
      return { itemType: "ingredient", itemId: x.id, itemName: x.name, unit: x.unit, actualQty: roundMoney(actual), theoreticalQty: roundMoney(theoretical), varianceQty: roundMoney(variance), actualCost: roundMoney(actualCost), theoreticalCost: roundMoney(theoreticalCost), varianceCost: roundMoney(actualCost - theoreticalCost) };
    })
    .sort((a, b) => Math.abs(b.varianceCost) - Math.abs(a.varianceCost))
    .slice(0, 50);
  const actualPrep = new Map<number, number>();
  const actualPrepValue = new Map<number, number>();
  for (const m of prepMovements) {
    if (["sale", "waste"].includes(m.movementType) && number(m.quantityDelta) < 0) {
      const qty = Math.abs(number(m.quantityDelta));
      actualPrep.set(m.preparationId, (actualPrep.get(m.preparationId) ?? 0) + qty);
      actualPrepValue.set(m.preparationId, (actualPrepValue.get(m.preparationId) ?? 0) + qty * number(m.unitCost));
    }
  }
  const prepVariance = preps.filter((x) => actualPrep.has(x.id) || theoreticalPrep.has(x.id)).map((x) => {
    const actual = actualPrep.get(x.id) ?? 0, theoretical = theoreticalPrep.get(x.id) ?? 0, variance = actual - theoretical;
    const actualCost = actualPrepValue.get(x.id) ?? 0, theoreticalCost = theoreticalPrepValue.get(x.id) ?? 0;
    return { itemType: "preparation", itemId: x.id, itemName: x.name, unit: x.unit, actualQty: roundMoney(actual), theoreticalQty: roundMoney(theoretical), varianceQty: roundMoney(variance), actualCost: roundMoney(actualCost), theoreticalCost: roundMoney(theoreticalCost), varianceCost: roundMoney(actualCost - theoreticalCost) };
  }).sort((a, b) => Math.abs(b.varianceCost) - Math.abs(a.varianceCost)).slice(0, 50);
  const recipeUsageVariance = [...ingredientVariance, ...prepVariance];
  const stockOpnameVariance = [
    ...ingredientMovements.filter((movement) => movement.movementType === "adjustment" && ingredientById.get(movement.ingredientId)?.stockType === "Makanan").map((movement) => {
      const ingredient = ingredientById.get(movement.ingredientId);
      const varianceQty = number(movement.quantityDelta);
      const unitCost = movement.unitCost == null ? null : number(movement.unitCost);
      const varianceValue = movement.varianceValue == null
        ? unitCost == null ? null : roundMoney(varianceQty * unitCost)
        : number(movement.varianceValue);
      return {
        movementId: movement.id, itemType: "ingredient" as const, itemId: movement.ingredientId,
        itemName: ingredient?.name ?? `Ingredient #${movement.ingredientId}`, date: dateKey(movement.date), unit: ingredient?.unit ?? "",
        systemStock: number(movement.stockBefore), physicalStock: number(movement.stockAfter), varianceQty, unitCost, varianceValue,
      };
    }),
    ...prepMovements.filter((movement) => movement.movementType === "adjustment").map((movement) => {
      const preparation = prepById.get(movement.preparationId);
      const varianceQty = number(movement.quantityDelta);
      const unitCost = movement.unitCost == null ? null : number(movement.unitCost);
      const varianceValue = movement.varianceValue == null
        ? unitCost == null ? null : roundMoney(varianceQty * unitCost)
        : number(movement.varianceValue);
      return {
        movementId: movement.id, itemType: "preparation" as const, itemId: movement.preparationId,
        itemName: preparation?.name ?? `Preparation #${movement.preparationId}`, date: dateKey(movement.date), unit: preparation?.unit ?? "",
        systemStock: number(movement.stockBefore), physicalStock: number(movement.stockAfter), varianceQty, unitCost, varianceValue,
      };
    }),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.movementId - a.movementId);

  const revenue = roundMoney(details.reduce((sum, x) => sum + number(x.revenue), 0));
  let totalBusinessRevenueRaw = 0;
  for (const line of allDetails) totalBusinessRevenueRaw += number(line.revenue);
  const totalBusinessRevenue = roundMoney(totalBusinessRevenueRaw);
  const recordedCogs = roundMoney(details.reduce((sum, x) => sum + number(x.costOfGoodsSold), 0));
  const wasteCost = roundMoney(fnbWaste.reduce((sum, x) => sum + number(x.totalCost), 0));
  const sharedExpenseAllocationRate = totalBusinessRevenue > 0 ? revenue / totalBusinessRevenue : 0;
  const directExpenses = roundMoney(expenses.filter((x) => x.businessType === "Makanan").reduce((sum, x) => sum + number(x.amount), 0));
  const sharedExpenses = roundMoney(expenses.filter((x) => x.businessType === "Bersama").reduce((sum, x) => sum + number(x.amount), 0));
  const allocatedSharedExpenses = roundMoney(sharedExpenses * sharedExpenseAllocationRate);
  const unallocatedSharedExpenses = totalBusinessRevenue > 0 ? 0 : sharedExpenses;
  const expenseTotal = roundMoney(directExpenses + allocatedSharedExpenses);
  const grossProfit = roundMoney(revenue - recordedCogs);
  res.json({
    startDate, endDate, revenue, recordedCogs,
    recordedFoodCostPercentage: revenue > 0 ? roundMoney(recordedCogs / revenue * 100) : 0,
    foodCostBasis: "sale_transaction_snapshot",
    wasteCost, grossProfit, operatingExpenses: expenseTotal, directExpenses, sharedExpenses, allocatedSharedExpenses,
    sharedExpenseAllocationRate: roundMoney(sharedExpenseAllocationRate * 100), unallocatedSharedExpenses,
    netProfit: roundMoney(grossProfit - expenseTotal - wasteCost),
    wasteCount: fnbWaste.length,
    varianceValuationBasis: "transaction_time",
    snapshotCoverage: details.length > 0 ? roundMoney(Math.max(0, details.length - incompleteSnapshotLines) / details.length * 100) : 100,
    incompleteSnapshotLines,
    recipeUsageVariance,
    inventoryVariance: recipeUsageVariance,
    stockOpnameVariance,
    menus: [...menuMap.values()].map((x) => ({ ...x, revenue: roundMoney(x.revenue), recordedCogs: roundMoney(x.recordedCogs), grossProfit: roundMoney(x.revenue - x.recordedCogs), foodCostPercentage: x.revenue > 0 ? roundMoney(x.recordedCogs / x.revenue * 100) : 0 })),
    waste: fnbWaste.map((x) => ({ id: x.id, date: x.date, itemType: x.ingredientId ? "ingredient" : "preparation", itemId: x.ingredientId ?? x.preparationId, quantity: number(x.quantity), unit: x.unit, totalCost: number(x.totalCost), reason: x.reason, note: x.note })),
    expenses: expenses.filter((x) => x.businessType !== "Parfum").map((x) => ({ id: x.id, date: x.date, category: x.category, description: x.description, amount: number(x.amount), businessType: x.businessType, allocatedAmount: x.businessType === "Makanan" ? number(x.amount) : roundMoney(number(x.amount) * sharedExpenseAllocationRate) })),
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
    checkedBusinessDate(recordBody(req.body)?.date, "Tanggal pembelian");
    const parsed = RecordPurchaseBody.safeParse(req.body);
    if (!parsed.success) {
      invalid(res, parsed.error.message);
      return;
    }
    if (!requireMaxItems(parsed.data.items, 100, res)) return;
    if (!requireFiniteNumbers(parsed.data.items.flatMap((item) => [item.ingredientId, item.quantity, item.totalCost]), res)) return;
    for (const line of parsed.data.items) checkedInputQuantity(line.quantity, "Jumlah pembelian", { allowNegative: false, allowZero: false });
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
      .map(([ingredientId, values]) => ({ ingredientId, ...values, quantity: checkedComputedQuantity(values.quantity, "Total jumlah pembelian bahan") }));
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
      if (locked.some((row) => !row.active)) {
        throw new HttpError("Bahan yang sudah dihapus tidak dapat dipakai untuk belanja baru.", 409);
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

      const movements: Array<typeof stockMovementsTable.$inferInsert> = [];
      for (const line of purchaseLines) {
        const ingredient = byId.get(line.ingredientId);
        if (!ingredient) throw new HttpError("Bahan belanja tidak ditemukan.", 400);
        const oldStock = number(ingredient.stock);
        const oldAverageCost = number(ingredient.averageCost);
        const unitCost = line.totalCost / line.quantity;
        const newStock = checkedComputedQuantity(oldStock + line.quantity, `Stok akhir bahan ${ingredient.name}`);
        const newAverageCost = movingAverageAfterReceipt({
          stockBefore: oldStock,
          averageCostBefore: oldAverageCost,
          quantityReceived: line.quantity,
          receiptTotalCost: line.totalCost,
          round: roundMoney,
        });
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
      const auditBefore = { sale, details };

      for (const line of details) {
        const [product] = await tx
          .select()
          .from(productsTable)
          .where(eq(productsTable.id, line.productId))
          .for("update");

        if (product && !product.needsRecipe) {
          const restoredStock = checkedComputedQuantity(number(product.stock) + line.quantity, `Stok pemulihan produk ${product.name}`);
          await tx.update(productsTable)
            .set({ stock: String(restoredStock) })
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
        const restoredStock = checkedComputedQuantity(number(prep.stock) + restored, `Stok pemulihan prep ${prep.name}`);
        await tx.update(preparationsTable)
          .set({ stock: String(restoredStock) })
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
        const restoredStock = checkedComputedQuantity(number(ingredient.stock) + restored, `Stok pemulihan bahan ${ingredient.name}`);
        await tx.update(ingredientsTable)
          .set({ stock: String(restoredStock) })
          .where(eq(ingredientsTable.id, ingredient.id));
      }

      await tx.delete(stockMovementsTable)
        .where(and(
          eq(stockMovementsTable.referenceId, idNum),
          eq(stockMovementsTable.movementType, "sale"),
        ));
      await tx.delete(salesDetailsTable).where(eq(salesDetailsTable.salesId, idNum));
      await tx.delete(salesTable).where(eq(salesTable.id, idNum));

      res.locals.auditBefore = auditBefore;
      res.locals.auditAfter = { deletedSaleId: idNum, restoredIngredientMovements: movements.length, restoredPreparationMovements: prepMovements.length };

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
    if (process.env.NODE_ENV === "production" || process.env.ALLOW_DANGEROUS_CLEAR_ALL !== "true") {
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

router.get(
  "/erp/sales",
  safe(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const startDate = checkedBusinessDate(req.query.startDate ?? "2000-01-01", "Tanggal awal penjualan");
    const endDate = checkedBusinessDate(req.query.endDate ?? jakartaToday(), "Tanggal akhir penjualan");
    if (startDate > endDate) throw new HttpError("Tanggal awal penjualan harus sebelum atau sama dengan tanggal akhir.", 400);
    const [headers, totalRows] = await Promise.all([
      db.select().from(salesTable).where(and(gte(salesTable.date, startDate), lte(salesTable.date, endDate)))
        .orderBy(desc(salesTable.date), desc(salesTable.id)).limit(limit).offset(offset),
      db.select({ total: count() }).from(salesTable).where(and(gte(salesTable.date, startDate), lte(salesTable.date, endDate))),
    ]);
    const ids = headers.map((row) => row.id);
    const lines = ids.length ? await db.select().from(salesDetailsTable).where(inArray(salesDetailsTable.salesId, ids)) : [];
    const items = headers.map((sale) => {
      const totalRevenue = number(sale.totalRevenue);
      const totalCostOfGoodsSold = number(sale.totalCostOfGoodsSold);
      return {
        id: sale.id,
        date: dateKey(sale.date),
        totalRevenue,
        totalCostOfGoodsSold,
        grossProfit: roundMoney(totalRevenue - totalCostOfGoodsSold),
        items: lines.filter((line) => line.salesId === sale.id).map((line) => ({
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: number(line.unitPrice),
          revenue: number(line.revenue),
          costOfGoodsSold: number(line.costOfGoodsSold),
        })),
      };
    });
    res.json({ items, pagination: { limit, offset, total: Number(totalRows[0]?.total ?? 0) } });
  }),
);

router.post(
  "/erp/sales",
  safe(async (req, res) => {
    checkedBusinessDate(recordBody(req.body)?.date, "Tanggal penjualan");
    const parsed = RecordSaleBody.safeParse(req.body);
    if (!parsed.success) {
      invalid(res, parsed.error.message);
      return;
    }
    if (!requireMaxItems(parsed.data.items, 100, res)) return;
    if (!requireFiniteNumbers(parsed.data.items.flatMap((item) => [item.productId, item.quantity]), res)) return;
    const quantities = new Map<number, number>();
    for (const line of parsed.data.items) {
      const aggregatedQuantity = (quantities.get(line.productId) ?? 0) + line.quantity;
      if (!Number.isSafeInteger(aggregatedQuantity) || aggregatedQuantity > 2_147_483_647) {
        throw new HttpError("Jumlah penjualan produk melebihi kapasitas integer database.", 400);
      }
      quantities.set(line.productId, aggregatedQuantity);
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
      const negativeStockWarnings: string[] = [];
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
      for (const [ingredientId, required] of requiredByIngredient) {
        requiredByIngredient.set(ingredientId, checkedComputedQuantity(required, `Total kebutuhan bahan #${ingredientId}`));
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
      for (const [preparationId, required] of requiredByPreparation) {
        requiredByPreparation.set(preparationId, checkedComputedQuantity(required, `Total kebutuhan prep #${preparationId}`));
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
          const warning = `Stok prep ${prep.name} kurang: tersedia ${number(prep.stock)} ${prep.unit}, perlu ${required} ${prep.unit}.`;
          warnings.push(warning); negativeStockWarnings.push(warning);
        }
      }

      const preparationRecipeRows = requestedPreparationIds.length
        ? await tx.select().from(preparationRecipeItemsTable).where(inArray(preparationRecipeItemsTable.preparationId, requestedPreparationIds))
        : [];
      const directIngredientIds = [...requiredByIngredient.keys()].sort((a, b) => a - b);
      const requestedIngredientIds = [...new Set([
        ...directIngredientIds,
        ...preparationRecipeRows.map((row) => row.ingredientId),
      ])].sort((a, b) => a - b);
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
      const ingredientIds = directIngredientIds.filter((ingredientId) => {
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
          const warning = `Stok bahan ${ingredient.name} kurang: tersedia ${available} ${ingredient.unit}, perlu ${required} ${ingredient.unit}.`;
          warnings.push(warning); negativeStockWarnings.push(warning);
        }
      }

      const productById = new Map(productRows.map((row) => [row.id, row]));
      for (const [productId, soldQuantity] of quantities) {
        const product = productById.get(productId)!;
        if (!product.needsRecipe && number(product.stock) + 1e-9 < soldQuantity) {
          const warning = `Stok produk ${product.name} kurang: tersedia ${number(product.stock)}, terjual ${soldQuantity}.`;
          warnings.push(warning); negativeStockWarnings.push(warning);
        }
      }

      if (negativeStockWarnings.length && (req as AuthRequest).authUser?.role !== "admin") {
        throw new HttpError("Stok tidak cukup. Hanya admin yang dapat melanjutkan transaksi stok negatif.", 409);
      }
      if (negativeStockWarnings.length) warnings.push("Override stok negatif disetujui oleh admin.");

      const saleLines = productIds.map((productId) => {
        const product = productById.get(productId)!;
        const quantity = quantities.get(productId)!;
        const unitPrice = number(product.sellingPrice);
        const recipe = recipesByProduct.get(productId) ?? [];
        const costingSnapshot = {
          version: 2,
          capturedAt: new Date().toISOString(),
          valuationBasis: "transaction_time",
          productAverageCost: number(product.averageCost),
          ingredients: recipe.filter((item) => item.ingredientId).map((item) => {
            const ingredient = ingredientById.get(item.ingredientId!)!;
            return { ingredientId: item.ingredientId, ingredientName: ingredient.name, stockUnit: ingredient.unit,
              quantityRequired: number(item.qtyRequired), recipeUnit: item.recipeUnit,
              conversionFactor: number(item.conversionFactor), averageCost: number(ingredient.averageCost), category: ingredient.category };
          }),
          preparations: productPrepRows.filter((row) => row.productId === productId).map((item) => {
            const prep = preparationById.get(item.preparationId);
            return { preparationId: item.preparationId, preparationName: prep?.name, stockUnit: prep?.unit,
              quantityRequired: number(item.qtyRequired), recipeUnit: item.recipeUnit,
              conversionFactor: number(item.conversionFactor), averageCost: prep ? number(prep.averageCost) : 0,
              yieldQty: prep ? number(prep.yieldQty) : 0,
              components: preparationRecipeRows.filter((row) => row.preparationId === item.preparationId).map((component) => {
                const ingredient = ingredientById.get(component.ingredientId)!;
                return { ingredientId: component.ingredientId, ingredientName: ingredient.name, stockUnit: ingredient.unit,
                  quantityRequired: number(component.qtyRequired), recipeUnit: component.recipeUnit,
                  conversionFactor: number(component.conversionFactor), averageCost: number(ingredient.averageCost), category: ingredient.category };
              }),
            };
          }),
        };
        const costOfGoodsSold = product.needsRecipe
          ? recipe.reduce((sum, item) => {
            if (!item.ingredientId) return sum;
            const ingredient = ingredientById.get(item.ingredientId)!;
            if (isOperationalIngredient(ingredient.category)) return sum;
            return sum + number(item.qtyRequired) * number(item.conversionFactor) * quantity * number(ingredient.averageCost);
          }, productPrepRows.filter((row) => row.productId === productId).reduce((sum, item) => {
            const prep = preparationById.get(item.preparationId);
            return sum + (prep ? preparationComponentCost({
              quantityRequired: number(item.qtyRequired),
              conversionFactor: number(item.conversionFactor),
              quantity,
              averageCost: number(prep.averageCost),
            }) : 0);
          }, 0))
          : number(product.averageCost) * quantity;
        return {
          productId,
          productName: product.name,
          businessType: product.businessType,
          quantity,
          unitPrice,
          revenue: roundMoney(unitPrice * quantity),
          costOfGoodsSold: roundMoney(costOfGoodsSold),
          costingSnapshot: JSON.stringify(costingSnapshot),
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
          costingSnapshot: line.costingSnapshot,
          businessType: line.businessType,
        })),
      );
      for (const [productId, soldQuantity] of quantities) {
        const product = productById.get(productId)!;
        if (!product.needsRecipe) {
          const newStock = checkedComputedQuantity(number(product.stock) - soldQuantity, `Stok akhir produk ${product.name}`);
          await tx
            .update(productsTable)
            .set({ stock: String(newStock) })
            .where(eq(productsTable.id, productId));
        }
      }
      const prepMovements: Array<typeof preparationStockMovementsTable.$inferInsert> = [];

      for (const preparationId of requestedPreparationIds) {
        const prep = preparationById.get(preparationId)!;
        const used = requiredByPreparation.get(preparationId) ?? 0;
        const oldStock = number(prep.stock);
        const newStock = checkedComputedQuantity(oldStock - used, `Stok akhir prep ${prep.name}`);

        await tx
          .update(preparationsTable)
          .set({ stock: String(newStock) })
          .where(eq(preparationsTable.id, preparationId));

        prepMovements.push({
          date: dateKey(parsed.data.date),
          preparationId,
          movementType: "sale",
          quantityDelta: String(-used),
          stockBefore: String(oldStock),
          stockAfter: String(newStock),
          unitCost: String(number(prep.averageCost)),
          referenceId: sale.id,
          note: `Penjualan #${sale.id}`,
        });
      }

      if (prepMovements.length) {
        await tx
          .insert(preparationStockMovementsTable)
          .values(prepMovements);
      }

      const movements: Array<typeof stockMovementsTable.$inferInsert> = [];
      for (const ingredientId of ingredientIds) {
        const ingredient = ingredientById.get(ingredientId)!;
        const oldStock = number(ingredient.stock);
        const used = requiredByIngredient.get(ingredientId)!;
        const newStock = checkedComputedQuantity(oldStock - used, `Stok akhir bahan ${ingredient.name}`);
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
    checkedBusinessDate(recordBody(req.body)?.date, "Tanggal opname");
    const parsed = RecordStockCountBody.safeParse(req.body);
    if (!parsed.success) {
      invalid(res, parsed.error.message);
      return;
    }
    if (!requireMaxItems(parsed.data.items, 100, res)) return;
    if (!requireFiniteNumbers(parsed.data.items.map((item) => item.countedStock), res)) return;
    for (const item of parsed.data.items) checkedInputQuantity(item.countedStock, "Stok fisik", { allowNegative: false });
    if (parsed.data.items.some((item) =>
      (item.ingredientId === undefined) === (item.preparationId === undefined)
    )) {
      invalid(res, "Setiap item harus memilih tepat satu jenis: bahan atau preparation.");
      return;
    }
    const itemKeys = parsed.data.items.map((item) =>
      item.ingredientId !== undefined ? `ingredient:${item.ingredientId}` : `preparation:${item.preparationId}`
    );
    if (new Set(itemKeys).size !== itemKeys.length) {
      invalid(res, "Setiap item hanya boleh dicatat satu kali.");
      return;
    }

    const validated = await db.transaction(async (tx) => {
      const ingredientIds = parsed.data.items
        .flatMap((item) => item.ingredientId === undefined ? [] : [item.ingredientId])
        .sort((a, b) => a - b);
      const preparationIds = parsed.data.items
        .flatMap((item) => item.preparationId === undefined ? [] : [item.preparationId])
        .sort((a, b) => a - b);
      const lockedIngredients = ingredientIds.length
        ? await tx.select().from(ingredientsTable)
          .where(inArray(ingredientsTable.id, ingredientIds))
          .orderBy(asc(ingredientsTable.id))
          .for("update")
        : [];
      const lockedPreparations = preparationIds.length
        ? await tx.select().from(preparationsTable)
          .where(inArray(preparationsTable.id, preparationIds))
          .orderBy(asc(preparationsTable.id))
          .for("update")
        : [];
      if (lockedIngredients.length !== ingredientIds.length || lockedPreparations.length !== preparationIds.length) {
        throw new HttpError("Ada bahan atau preparation yang tidak ditemukan.", 400);
      }
      if (lockedIngredients.some((row) => !row.active)) {
        throw new HttpError("Bahan yang sudah dihapus tidak dapat dipakai dalam stok opname baru.", 409);
      }
      const ingredientById = new Map(lockedIngredients.map((row) => [row.id, row]));
      const preparationById = new Map(lockedPreparations.map((row) => [row.id, row]));
      const ingredientMovements: Array<typeof stockMovementsTable.$inferInsert> = [];
      const preparationMovements: Array<typeof preparationStockMovementsTable.$inferInsert> = [];
      const rows: Array<Record<string, unknown>> = [];
      for (const item of parsed.data.items) {
        const date = dateKey(parsed.data.date);
        if (item.ingredientId !== undefined) {
          const ingredient = ingredientById.get(item.ingredientId)!;
          const stockBefore = number(ingredient.stock);
          const varianceQty = checkedComputedQuantity(item.countedStock - stockBefore, `Selisih opname bahan ${ingredient.name}`);
          const unitCost = number(ingredient.averageCost);
          const varianceValue = roundMoney(varianceQty * unitCost);
          const [row] = await tx.update(ingredientsTable)
            .set({ stock: String(item.countedStock) })
            .where(eq(ingredientsTable.id, item.ingredientId))
            .returning();
          ingredientMovements.push({
            date, ingredientId: item.ingredientId, movementType: "adjustment",
            quantityDelta: String(varianceQty), stockBefore: String(stockBefore), stockAfter: String(item.countedStock),
            unitCost: String(unitCost), varianceValue: String(varianceValue), note: "Penyesuaian stok opname",
          });
          rows.push({
            ...asIngredient(row), id: row.id, itemType: "ingredient", itemId: row.id, date,
            stockBefore, countedStock: item.countedStock, stockAfter: number(row.stock),
            quantityDelta: varianceQty, varianceQty, unitCost, varianceValue,
          });
        } else {
          const preparation = preparationById.get(item.preparationId!)!;
          const stockBefore = number(preparation.stock);
          const varianceQty = checkedComputedQuantity(item.countedStock - stockBefore, `Selisih opname prep ${preparation.name}`);
          const unitCost = number(preparation.averageCost);
          const varianceValue = roundMoney(varianceQty * unitCost);
          const [row] = await tx.update(preparationsTable)
            .set({ stock: String(item.countedStock) })
            .where(eq(preparationsTable.id, item.preparationId!))
            .returning();
          preparationMovements.push({
            date, preparationId: item.preparationId!, movementType: "adjustment",
            quantityDelta: String(varianceQty), stockBefore: String(stockBefore), stockAfter: String(item.countedStock),
            unitCost: String(unitCost), varianceValue: String(varianceValue), note: "Penyesuaian stok opname",
          });
          rows.push({
            id: row.id, itemType: "preparation", itemId: row.id, date, name: row.name, unit: row.unit,
            stock: number(row.stock), stockBefore, countedStock: item.countedStock, stockAfter: number(row.stock),
            quantityDelta: varianceQty, varianceQty, unitCost, varianceValue,
            yieldQty: number(row.yieldQty), averageCost: number(row.averageCost), active: row.active,
          });
        }
      }
      if (ingredientMovements.length) await tx.insert(stockMovementsTable).values(ingredientMovements);
      if (preparationMovements.length) await tx.insert(preparationStockMovementsTable).values(preparationMovements);
      return RecordStockCountResponse.parse(rows);
    });
    res.json(validated.map((row) => ({ ...row, date: dateKey(row.date) })));
  }),
);

// ==========================================
// ENDPOINT: HAPUS BAHAN (INGREDIENT)
// ==========================================
router.delete(
  "/erp/ingredients/:ingredientId",
  safe(async (req, res) => {
    const rawId = typeof req.params.ingredientId === "string" ? req.params.ingredientId : "";
    const id = Number(rawId);
    if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(id) || id <= 0) {
      invalid(res, "ID bahan tidak valid.");
      return;
    }

    await db.transaction(async (tx) => {
      const [ingredient] = await tx
        .select()
        .from(ingredientsTable)
        .where(eq(ingredientsTable.id, id))
        .for("update");
      if (!ingredient || !ingredient.active) {
        throw new HttpError("Bahan tidak ditemukan.", 404);
      }

      // Resep aktif tidak boleh terus memakai bahan yang sudah diarsipkan. Snapshot
      // transaksi dan versi resep tetap menyimpan histori untuk laporan/HPP.
      const affectedProducts = await tx
        .select({ id: recipeItemsTable.productId })
        .from(recipeItemsTable)
        .where(eq(recipeItemsTable.ingredientId, id));
      const affectedPreparations = await tx
        .select({ id: preparationRecipeItemsTable.preparationId })
        .from(preparationRecipeItemsTable)
        .where(eq(preparationRecipeItemsTable.ingredientId, id));
      await tx.delete(recipeItemsTable).where(eq(recipeItemsTable.ingredientId, id));
      await tx.delete(preparationRecipeItemsTable).where(eq(preparationRecipeItemsTable.ingredientId, id));

      for (const { id: productId } of affectedProducts) {
        const snapshot = await tx.select().from(recipeItemsTable).where(eq(recipeItemsTable.productId, productId));
        const [latest] = await tx.select({ version: recipeVersionsTable.version }).from(recipeVersionsTable)
          .where(and(eq(recipeVersionsTable.scope, "product"), eq(recipeVersionsTable.parentId, productId)))
          .orderBy(desc(recipeVersionsTable.version)).limit(1);
        await tx.insert(recipeVersionsTable).values({
          scope: "product", parentId: productId, version: (latest?.version ?? 0) + 1,
          snapshot: JSON.stringify(snapshot), createdBy: (req as AuthRequest).authUser?.id,
        });
      }
      for (const { id: preparationId } of affectedPreparations) {
        const snapshot = await tx.select().from(preparationRecipeItemsTable).where(eq(preparationRecipeItemsTable.preparationId, preparationId));
        const [latest] = await tx.select({ version: recipeVersionsTable.version }).from(recipeVersionsTable)
          .where(and(eq(recipeVersionsTable.scope, "preparation"), eq(recipeVersionsTable.parentId, preparationId)))
          .orderBy(desc(recipeVersionsTable.version)).limit(1);
        await tx.insert(recipeVersionsTable).values({
          scope: "preparation", parentId: preparationId, version: (latest?.version ?? 0) + 1,
          snapshot: JSON.stringify(snapshot), createdBy: (req as AuthRequest).authUser?.id,
        });
      }
      await tx
        .update(ingredientsTable)
        .set({ active: false })
        .where(eq(ingredientsTable.id, id));

      res.locals.auditBefore = asIngredient(ingredient);
      res.locals.auditAfter = { ...asIngredient(ingredient), active: false };
    });

    res.json({ success: true, archived: true });
  }),
);

// ==========================================
// ENDPOINT: HAPUS PRODUK (PRODUCT)
// ==========================================
router.delete(
  "/erp/products/:productId",
  safe(async (req, res) => {
    const rawId = typeof req.params.productId === "string" ? req.params.productId : "";
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
