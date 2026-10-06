import assert from "node:assert/strict";

const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const timeoutMs = Number(process.env.TEST_TIMEOUT_MS ?? 10000);

async function request(path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(baseUrl + path, {
      redirect: "manual",
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch {}
    return { response, body, text };
  } finally {
    clearTimeout(timer);
  }
}

async function expectStatus(name, path, status, init) {
  const { response, body } = await request(path, init);
  assert.equal(response.status, status, `${name}: expected ${status}, got ${response.status}`);
  console.log(`PASS  ${name} -> ${response.status}`);
  return { response, body };
}

async function main() {
  console.log(`Security/API smoke tests against ${baseUrl}`);

  await expectStatus("public healthz", "/api/healthz", 200);
  await expectStatus("public legacy health", "/api/health", 200);

  await expectStatus("missing auth on /me", "/api/me", 401);
  await expectStatus("missing auth on ERP state", "/api/erp/state", 401);
  await expectStatus("malformed bearer token", "/api/me", 401, {
    headers: { Authorization: "Bearer not-a-jwt" },
  });

  await expectStatus("write endpoint without auth", "/api/erp/sales", 401, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  const cors = await request("/api/healthz", {
    headers: { Origin: "https://evil.example" },
  });
  assert.notEqual(
    cors.response.headers.get("access-control-allow-origin"),
    "https://evil.example",
    "untrusted origin must not receive an ACAO allow header",
  );
  console.log("PASS  untrusted CORS origin rejected");

  const allowed = await request("/api/healthz", {
    headers: { Origin: "https://erp.kasapink.com" },
  });
  assert.equal(
    allowed.response.headers.get("access-control-allow-origin"),
    "https://erp.kasapink.com",
    "production origin must be explicitly allowed",
  );
  console.log("PASS  production CORS origin allowed");

  const preflight = await request("/api/erp/sales", {
    method: "OPTIONS",
    headers: {
      Origin: "https://erp.kasapink.com",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "Authorization, Content-Type",
    },
  });
  assert.equal(preflight.response.status, 204, `CORS preflight: expected 204, got ${preflight.response.status}`);
  assert.equal(preflight.response.headers.get("access-control-allow-origin"), "https://erp.kasapink.com");
  console.log("PASS  CORS preflight");

  console.log("All security/API smoke tests passed.");
}

main().catch((error) => {
  console.error("Security/API tests failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
