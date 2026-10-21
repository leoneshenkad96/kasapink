import assert from "node:assert/strict";

const base = (process.env.ERP_PRODUCTION_URL ?? "https://erp.kasapink.com").replace(/\/$/, "");
const url = new URL(base);
if (url.protocol !== "https:" || url.hostname !== "erp.kasapink.com" || url.pathname !== "/") {
  throw new Error("Smoke checks are limited to the canonical production ERP URL.");
}
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 15000);
async function get(path, expected) {
  const response = await fetch(new URL(path, base), {
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "Cache-Control": "no-cache", Accept: "application/json, text/html" },
  });
  assert.equal(response.status, expected, `${path}: expected HTTP ${expected}, got ${response.status}`);
  return response;
}
const health = await get("/api/healthz", 200);
const result = await health.json();
assert.equal(result.status, "ok", "/api/healthz must report ok");
assert.equal(health.headers.get("x-content-type-options"), "nosniff");
assert.equal(health.headers.get("x-powered-by"), null);
const csp = health.headers.get("content-security-policy") ?? "";
assert.ok(csp.includes("object-src 'none'"), "CSP must prohibit objects");
console.log("PASS: healthz, security headers and CSP");

const ready = await get("/api/readyz", 200);
const readiness = await ready.json();
assert.equal(readiness.status, "ok");
assert.equal(readiness.database, "ready");
console.log("PASS: Postgres readiness (read-only)");

await get("/api/me", 401);
await get("/api/erp/state", 401);
console.log("PASS: unauthenticated endpoints reject access");

const home = await get("/", 200);
assert.ok((home.headers.get("content-security-policy") ?? "").includes("default-src 'self'"));
const html = await home.text();
assert.match(html, /<html|<!doctype html/i);
console.log("PASS: SPA and static CSP");

console.log("Production ERP read-only security smoke test PASSED; no transactions or authentication attempts were made.");
