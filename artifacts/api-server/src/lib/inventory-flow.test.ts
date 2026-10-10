import { strict as assert } from "node:assert";
import test from "node:test";
import { preparationComponentCost } from "./costing";
import { movingAverageAfterReceipt } from "./moving-average";

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

test("inventory flow keeps stock, COGS, waste, and gross profit consistent", () => {
  let stock = 0;
  let averageCost = 100;

  // A sale is allowed to create negative stock and snapshots current COGS.
  const firstSaleQty = 5;
  const firstSaleCogs = firstSaleQty * averageCost;
  stock -= firstSaleQty;
  assert.equal(stock, -5);
  assert.equal(firstSaleCogs, 500);

  // A receipt that clears the negative balance uses its own unit cost.
  const receiptQty = 10;
  const receiptTotal = 1200;
  averageCost = movingAverageAfterReceipt({
    stockBefore: stock,
    averageCostBefore: averageCost,
    quantityReceived: receiptQty,
    receiptTotalCost: receiptTotal,
    round: roundMoney,
  });
  stock += receiptQty;
  assert.equal(stock, 5);
  assert.equal(averageCost, 120);

  // Waste is valued at the current moving average, then reduces stock.
  const wasteQty = 2;
  const wasteCost = roundMoney(wasteQty * averageCost);
  stock -= wasteQty;
  assert.equal(stock, 3);
  assert.equal(wasteCost, 240);

  // Preparation cost uses the same unit conversion as the sale path.
  const prepCogs = preparationComponentCost({
    quantityRequired: 250,
    conversionFactor: 0.001,
    quantity: 4,
    averageCost,
  });
  assert.equal(prepCogs, 120);

  const secondSaleQty = 2;
  const secondSaleCogs = roundMoney(secondSaleQty * averageCost);
  stock -= secondSaleQty;
  assert.equal(stock, 1);
  assert.equal(secondSaleCogs, 240);
  const grossProfit = roundMoney(2000 - firstSaleCogs - secondSaleCogs);
  assert.equal(grossProfit, 1260);
  assert.equal(roundMoney(grossProfit - wasteCost), 1020);
});
