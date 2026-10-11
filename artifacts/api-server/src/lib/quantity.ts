export const QUANTITY_MAX = 99_999_999_999.999;
export const QUANTITY_MIN_POSITIVE = 0.001;

export function roundStoredQuantity(value: number): number {
  const roundedAbsolute = Math.round((Math.abs(value) + Number.EPSILON) * 1000) / 1000;
  return Math.sign(value) * roundedAbsolute;
}

export function validStoredQuantity(
  value: number,
  options: { allowNegative?: boolean; allowZero?: boolean } = {},
): boolean {
  const { allowNegative = true, allowZero = true } = options;
  if (!Number.isFinite(value) || Math.abs(value) > QUANTITY_MAX) return false;
  if (!allowNegative && value < 0) return false;
  if (!allowZero && value === 0) return false;
  return Math.abs(value - roundStoredQuantity(value)) < 1e-9;
}

// Computed quantities may need rounding to the database scale. Return null
// rather than silently turning a non-zero result into zero or overflowing.
export function normalizeComputedQuantity(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = roundStoredQuantity(value);
  if (Math.abs(rounded) > QUANTITY_MAX) return null;
  if (value !== 0 && rounded === 0) return null;
  return rounded;
}
