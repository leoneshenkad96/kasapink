import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "lib", "db", "migrations");
const files = (await readdir(migrationsDir)).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
const ids = files.map((file) => Number(file.slice(0, 4)));
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
const outOfOrder = ids.slice(1).filter((id, index) => id <= ids[index]);

if (duplicates.length || outOfOrder.length) {
  throw new Error(`Migration sequence invalid: duplicates=${duplicates.join(",") || "none"}; outOfOrder=${outOfOrder.join(",") || "none"}`);
}

for (const required of ["0017_audit_log.sql", "0018_sales_costing_snapshot.sql"]) {
  if (!files.includes(required)) throw new Error(`Required migration missing: ${required}`);
}

console.log(`Migration check passed: ${files.length} files, ${files.at(-1)} latest.`);
