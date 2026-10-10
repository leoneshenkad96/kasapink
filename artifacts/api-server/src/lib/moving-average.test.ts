import { strict as assert } from "node:assert";
import test from "node:test";
import { movingAverageAfterReceipt } from "./moving-average";

test("uses receipt cost when a receipt clears negative stock", () => {
  assert.equal(movingAverageAfterReceipt({
    stockBefore: -5,
    averageCostBefore: 100,
    quantityReceived: 10,
    receiptTotalCost: 1200,
  }), 120);
});

test("keeps the existing cost basis while stock remains negative", () => {
  assert.equal(movingAverageAfterReceipt({
    stockBefore: -5,
    averageCostBefore: 100,
    quantityReceived: 3,
    receiptTotalCost: 390,
  }), 100);
});

test("keeps standard weighted average for non-negative stock", () => {
  assert.equal(movingAverageAfterReceipt({
    stockBefore: 10,
    averageCostBefore: 100,
    quantityReceived: 5,
    receiptTotalCost: 600,
    round: (value) => Math.round(value * 100) / 100,
  }), 106.67);
});
