/**
 * Calculates the moving weighted-average unit cost after receiving stock.
 * Negative stock is a fulfilment shortfall, not inventory with a negative
 * asset value. Once a receipt clears that shortfall, the remaining positive
 * stock uses the receipt unit cost.
 */
export function movingAverageAfterReceipt({
  stockBefore,
  averageCostBefore,
  quantityReceived,
  receiptTotalCost,
  round = (value: number) => value,
}: {
  stockBefore: number;
  averageCostBefore: number;
  quantityReceived: number;
  receiptTotalCost: number;
  round?: (value: number) => number;
}): number {
  if (!Number.isFinite(stockBefore) || !Number.isFinite(averageCostBefore) ||
    !Number.isFinite(quantityReceived) || !Number.isFinite(receiptTotalCost) ||
    quantityReceived <= 0) {
    throw new Error("Receipt values must be finite and quantity must be positive.");
  }
  const receiptUnitCost = receiptTotalCost / quantityReceived;
  const stockAfter = stockBefore + quantityReceived;
  if (stockBefore < 0) return stockAfter > 0 ? round(receiptUnitCost) : round(averageCostBefore);
  if (stockAfter <= 0) return round(averageCostBefore);
  return round((stockBefore * averageCostBefore + receiptTotalCost) / stockAfter);
}
