const UNIT_GROUPS: Record<string, { group: string; factor: number }> = {
  gram: { group: "weight", factor: 1 }, kg: { group: "weight", factor: 1000 },
  ml: { group: "volume", factor: 1 }, liter: { group: "volume", factor: 1000 },

};
export function recipeConversionFactor(recipeUnit: string, stockUnit: string): number | null {
  if (recipeUnit === stockUnit) return 1;
  const recipe = UNIT_GROUPS[recipeUnit], stock = UNIT_GROUPS[stockUnit];
  if (!recipe || !stock || recipe.group !== stock.group) return null;
  return recipe.factor / stock.factor;
}


// Recipe quantity columns are numeric(14,3); reject silent rounding to zero.
export function validRecipeQuantity(value: number): boolean {
  return Number.isFinite(value) && value >= 0.001 && value <= 99999999999.999
    && Math.abs(value - Number(value.toFixed(3))) < 1e-9;
}
