import { execFile } from "node:child_process";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL wajib diatur.");

const outputDir = path.resolve(process.env.ERP_BACKUP_DIR ?? "./backups");
const retentionDays = Number(process.env.ERP_BACKUP_RETENTION_DAYS ?? 30);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputPath = path.join(outputDir, `kasapink-erp-${stamp}.dump`);
await mkdir(outputDir, { recursive: true });

const pgDump = process.env.PG_DUMP_BIN ?? (process.platform === "win32" ? "pg_dump.exe" : "pg_dump");
await execFileAsync(pgDump, ["--format=custom", "--no-owner", "--no-privileges", "--file", outputPath, databaseUrl], {
  windowsHide: true,
  maxBuffer: 1024 * 1024,
});
if (Number.isFinite(retentionDays) && retentionDays > 0) {
  const cutoff = Date.now() - retentionDays * 86400000;
  for (const file of await readdir(outputDir)) {
    if (!/^kasapink-erp-.*\.dump$/.test(file)) continue;
    const target = path.join(outputDir, file);
    if ((await stat(target)).mtimeMs < cutoff && target !== outputPath) await rm(target, { force: true });
  }
}
console.log(`ERP backup created: ${outputPath}`);
