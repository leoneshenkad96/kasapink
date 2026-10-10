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

const allowedHex = new Set(["#613248", "#f2bfd2", "#f8e7ed", "#f9f5f6", "#fdcee0"]);
const lockHex = [...lock.matchAll(/#[0-9a-fA-F]{3,8}/g)].map(([color]) => color.toLowerCase());
const outsidePalette = [...new Set(lockHex.filter((color) => !allowedHex.has(color)))];
if (outsidePalette.length) throw new Error(`Palette lock mengandung warna di luar palette: ${outsidePalette.join(", ")}`);

const sourceFiles = [
  new URL("../artifacts/erp-rumahan-emak/src/App.tsx", import.meta.url),
  new URL("../artifacts/erp-rumahan-emak/src/pages/UsersPage.tsx", import.meta.url),
];
for (const sourcePath of sourceFiles) {
  const source = await readFile(sourcePath, "utf8");
  const sourceHex = [...source.matchAll(/#[0-9a-fA-F]{3,8}/g)].map(([color]) => color.toLowerCase());
  const sourceOutsidePalette = [...new Set(sourceHex.filter((color) => !allowedHex.has(color)))];
  if (sourceOutsidePalette.length) throw new Error(`Inline UI ${sourcePath.pathname} mengandung warna di luar palette: ${sourceOutsidePalette.join(", ")}`);
}
console.log("Palette lock check passed: active ERP colors remain within Kasapink pink palette.");
