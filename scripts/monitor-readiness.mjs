import { spawn } from "node:child_process";

const baseUrl = (process.env.READINESS_BASE_URL ?? "http://127.0.0.1:5000").replace(/\/$/, "");
const requireBackup = process.env.READINESS_REQUIRE_BACKUP === "1";

async function checkEndpoint(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(Number(process.env.READINESS_TIMEOUT_MS ?? 5000)),
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  console.log(`PASS  ${path} -> ${response.status}`);
}

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function main() {
  console.log(`ERP readiness monitor against ${baseUrl}`);
  await checkEndpoint("/api/healthz");
  await checkEndpoint("/api/readyz");
  await run(process.platform === "win32" ? "node.exe" : "node", ["scripts/check-migrations.mjs"]);
  if (requireBackup) {
    await run(process.platform === "win32" ? "node.exe" : "node", ["scripts/check-backup.mjs"]);
  } else {
    console.log("SKIP  backup freshness (set READINESS_REQUIRE_BACKUP=1 to enforce it)");
  }
  console.log("ERP readiness monitor passed.");
}

main().catch((error) => {
  console.error("ERP readiness monitor failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
