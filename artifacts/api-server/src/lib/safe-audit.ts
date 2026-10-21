type SafeValue = string | number | boolean;
const SNAPSHOT_FIELDS = new Set([
  "id", "ingredientId", "productId", "preparationId", "deletedSaleId",
  "active", "stock", "averageCost", "quantity", "quantityDelta",
  "restoredIngredientMovements", "restoredPreparationMovements",
]);
function safeScalar(value: unknown): SafeValue | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value) && value.length < 35) return value;
  return undefined;
}

// Never store request payload values, headers, passwords, tokens or user notes.
export function auditRequestSummary(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  return JSON.stringify({
    operation: "erp_mutation",
    ...(Array.isArray(value) ? { recordCount: value.length } : {}),
    ...(Array.isArray(obj.items) ? { itemCount: obj.items.length } : {}),
  });
}

// Capture explicitly allowlisted inventory metadata only.
export function auditSnapshot(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result: Record<string, SafeValue> = {};
  for (const [key, candidate] of Object.entries(value as Record<string, unknown>)) {
    if (!SNAPSHOT_FIELDS.has(key)) continue;
    const scalar = safeScalar(candidate);
    if (scalar !== undefined) result[key] = scalar;
  }
  return Object.keys(result).length > 0 ? JSON.stringify(result) : undefined;
}

export function auditReason(value: unknown): string | undefined {
  // Machine-readable reason code only. Do not accept arbitrary untrusted text.
  return typeof value === "string" && /^[a-z0-9_-]{1,32}$/i.test(value) ? value : undefined;
}
