import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

globalThis.require = createRequire(import.meta.url);

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function buildVercelApi() {
  await esbuild({
    entryPoints: [path.resolve(rootDir, "artifacts/api-server/src/app.ts")],
    platform: "node",
    target: "node20",
    bundle: true,
    format: "cjs",
    outfile: path.resolve(rootDir, "api/index.js"),
    logLevel: "info",
    external: [
      "*.node",
      "pg-native",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "fsevents"
    ],
    sourcemap: false,
    footer: {
      js: "module.exports = app_default;",
    },
  });
}

buildVercelApi().catch((err) => {
  console.error(err);
  process.exit(1);
});