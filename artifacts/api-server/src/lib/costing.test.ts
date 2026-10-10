import { strict as assert } from "node:assert";
import test from "node:test";
import { preparationComponentCost } from "./costing";

test("applies preparation unit conversion to theoretical and actual cost", () => {
  assert.equal(preparationComponentCost({
    quantityRequired: 250,
    conversionFactor: 0.001,
    quantity: 4,
    averageCost: 80,
  }), 80);
});
