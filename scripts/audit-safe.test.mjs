import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: ["artifacts/api-server/src/lib/safe-audit.ts"],
  platform: "node", format: "esm", bundle: true, write: false,
});
const source = compiled.outputFiles[0].text;
const { auditRequestSummary, auditSnapshot, auditReason } =
  await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

test("never serializes passwords, tokens, cookies or notes", () => {
  const secret = "do-not-log-this-secret";
  const body = { password: secret, token: secret, cookie: secret, items: [{ note: secret }] };
  const serialized = auditRequestSummary(body);
  assert.deepEqual(JSON.parse(serialized), { operation: "erp_mutation", itemCount: 1 });
  assert.equal(serialized.includes(secret), false);
});

test("snapshot includes only known non-secret metadata", () => {
  const snapshot = auditSnapshot({ id: 3, stock: "5.5", active: true,
    passwordHash: "secret", details: {token:"secret"}, name: "private" });
  assert.deepEqual(JSON.parse(snapshot), { id:3, stock:"5.5", active:true });
  assert.equal(auditSnapshot({ note: "private" }), undefined);
});

test("audit reason permits only structured codes", () => {
  assert.equal(auditReason("stock_opname"), "stock_opname");
  assert.equal(auditReason("secret with whitespace"), undefined);
});
