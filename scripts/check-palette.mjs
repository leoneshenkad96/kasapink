import { readFile } from "node:fs/promises";

const cssPath = new URL("../artifacts/erp-rumahan-emak/src/index.css", import.meta.url);
const css = await readFile(cssPath, "utf8");
const marker = "/* Palette lock must remain last";
const markerIndex = css.indexOf(marker);
if (markerIndex < 0) throw new Error("Palette lock marker tidak ditemukan.");

const lock = css.slice(markerIndex);
const required = [
  ["body", "#f2bfd2"],
  [".app-shell", "#f9f5f6"],
  [".sidebar", "#f8e7ed"],
  [".button-primary", "#f2bfd2"],
  [".metric-feature", "#f2bfd2"],
];
for (const [selector, color] of required) {
  if (!lock.includes(color)) throw new Error(`Palette lock ${selector} tidak memakai warna palette yang diharapkan.`);
}

const legacyColors = ["#e8d28c", "#fff8dc", "#624b0b"];
for (const color of legacyColors) {
  if (css.toLowerCase().includes(color)) throw new Error(`Warna legacy ${color} masih ditemukan di CSS.`);
}

const trailing = css.slice(markerIndex + marker.length).trim();
if (!trailing) throw new Error("Palette lock kosong.");
console.log("Palette lock check passed: active ERP colors remain within Kasapink pink palette.");
