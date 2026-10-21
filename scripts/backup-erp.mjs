import { execFile } from "node:child_process";
import { chmod, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL wajib diatur.");

const parsed = new URL(databaseUrl);
if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
  throw new Error("DATABASE_URL harus berupa PostgreSQL URI.");
}
const dbPassword = decodeURIComponent(parsed.password);
parsed.password = "";
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
  // Verify the remote server certificate and its hostname, not merely encryption.
  parsed.searchParams.set("sslmode", "verify-full");
}

const outputDir = path.resolve(process.env.ERP_BACKUP_DIR ?? "./backups");
const retentionDays = Number(process.env.ERP_BACKUP_RETENTION_DAYS ?? 30);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputPath = path.join(outputDir, `kasapink-erp-${stamp}.dump`);
const partialPath = `${outputPath}.partial`;
await mkdir(outputDir, { recursive: true, mode: 0o700 });

const pgDump = process.env.PG_DUMP_BIN ?? (process.platform === "win32" ? "pg_dump.exe" : "pg_dump");
const pgRestore = process.env.PG_RESTORE_BIN ?? (process.platform === "win32" ? "pg_restore.exe" : "pg_restore");
const pgEnv = { ...process.env, PGPASSWORD: dbPassword };

try {
  // Password must never appear in command arguments or logs.
  await execFileAsync(pgDump, [
    "--format=custom", "--no-owner", "--no-privileges",
    "--file", partialPath, "--dbname", parsed.toString(),
  ], { windowsHide: true, maxBuffer: 1024 * 1024, env: pgEnv });

  // Validate that the archive is readable before considering it a backup.
  await execFileAsync(pgRestore, ["--list", partialPath], {
    windowsHide: true, maxBuffer: 20 * 1024 * 1024,
  });
  if (process.platform !== "win32") await chmod(partialPath, 0o600);
  await rename(partialPath, outputPath);
} catch (error) {
  await rm(partialPath, { force: true });
  throw error;
}

if (Number.isFinite(retentionDays) && retentionDays > 0) {
  const cutoff = Date.now() - retentionDays * 86400000;
  for (const file of await readdir(outputDir)) {
    if (!/^kasapink-erp-.*\\.dump$/.test(file)) continue;
    const target = path.join(outputDir, file);
    if ((await stat(target)).mtimeMs < cutoff && target !== outputPath) {
      await rm(target, { force: true });
    }
  }
}
console.log(`Verified ERP backup created: ${outputPath}`);
