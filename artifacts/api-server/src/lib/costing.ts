export function preparationComponentCost({
  quantityRequired,
  conversionFactor,
  quantity,
  averageCost,
}: {
  quantityRequired: number;
  conversionFactor: number;
  quantity: number;
  averageCost: number;
}): number {
  return quantityRequired * conversionFactor * quantity * averageCost;
}
