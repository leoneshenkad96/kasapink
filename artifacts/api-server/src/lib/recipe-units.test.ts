import assert from 'node:assert/strict';
import test from 'node:test';
import { recipeConversionFactor, validRecipeQuantity } from './recipe-units';
import { preparationComponentCost } from './costing';

test('weight and volume conversions preserve stock usage and HPP', () => {
  assert.equal(recipeConversionFactor('gram', 'kg'), 0.001);
  assert.equal(recipeConversionFactor('kg', 'gram'), 1000);
  assert.equal(recipeConversionFactor('ml', 'liter'), 0.001);
  assert.equal(recipeConversionFactor('liter', 'ml'), 1000);
  const gramCost = preparationComponentCost({ quantityRequired: 250, conversionFactor: recipeConversionFactor('gram', 'kg')!, quantity: 4, averageCost: 20000 });
  const kgCost = preparationComponentCost({ quantityRequired: 0.25, conversionFactor: 1, quantity: 4, averageCost: 20000 });
  assert.equal(gramCost, kgCost); assert.equal(gramCost, 20000);
  assert.equal(preparationComponentCost({ quantityRequired: 0.2, conversionFactor: 1, quantity: 1, averageCost: 3130.43 }), 626.086);
});

test('discrete stock units require exact matches, cross-dimension conversions fail', () => {
  for (const unit of ['pcs', 'butir', 'ekor', 'potong', 'ikat', 'pack', 'box', 'botol', 'sdm']) assert.equal(recipeConversionFactor(unit, unit), 1);
  for (const [from, to] of [['pack', 'pcs'], ['box', 'pcs'], ['butir', 'gram'], ['kg', 'liter'], ['sdm', 'ml'], ['pcs', 'ekor']]) assert.equal(recipeConversionFactor(from, to), null);
});

test('recipe precision is validated before database rounding', () => {
  for (const value of [0.001, 0.25, 250.5]) assert.equal(validRecipeQuantity(value), true);
  for (const value of [0, -1, 0.0001, 1.2345, Infinity, NaN, 100000000000]) assert.equal(validRecipeQuantity(value), false);
});
