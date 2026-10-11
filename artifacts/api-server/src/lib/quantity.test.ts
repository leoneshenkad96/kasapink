import assert from "node:assert/strict";
import test from "node:test";
import { normalizeComputedQuantity, QUANTITY_MAX, validStoredQuantity } from "./quantity";

test("numeric(14,3) accepts representable boundary values", () => {
  assert.equal(validStoredQuantity(0), true);
  assert.equal(validStoredQuantity(0.001, { allowNegative: false, allowZero: false }), true);
  assert.equal(validStoredQuantity(QUANTITY_MAX), true);
  assert.equal(validStoredQuantity(-QUANTITY_MAX), true);
});

test("numeric(14,3) rejects extra decimals, overflow, and invalid signs", () => {
  assert.equal(validStoredQuantity(0.0001), false);
  assert.equal(validStoredQuantity(1.2345), false);
  assert.equal(validStoredQuantity(QUANTITY_MAX + 0.001), false);
  assert.equal(validStoredQuantity(-1, { allowNegative: false }), false);
  assert.equal(validStoredQuantity(0, { allowZero: false }), false);
});

test("numeric(14,3) normalizes computed values without silent zero or overflow", () => {
  assert.equal(normalizeComputedQuantity(1.2344), 1.234);
  assert.equal(normalizeComputedQuantity(1.2345), 1.235);
  assert.equal(normalizeComputedQuantity(-1.2345), -1.235);
  assert.equal(normalizeComputedQuantity(0.0004), null);
  assert.equal(normalizeComputedQuantity(-0.0004), null);
  assert.equal(normalizeComputedQuantity(QUANTITY_MAX + 1), null);
});
