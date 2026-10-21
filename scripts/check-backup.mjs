import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
const run = promisify(execFile);
const dir = path.resolve(process.env.ERP_BACKUP_DIR ?? "./backups");
const maxAgeHours = Number(process.env.ERP_BACKUP_MAX_AGE_HOURS ?? 26);
if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) throw new Error("ERP_BACKUP_MAX_AGE_HOURS must be positive.");
const files = (await readdir(dir)).filter(name => /^kasapink-erp-.*\.dump$/.test(name));
if (!files.length) throw new Error("No PostgreSQL backup archives found.");
const candidates = await Promise.all(files.map(async name => ({name,info:await stat(path.join(dir,name))})));
candidates.sort((a,b)=>b.info.mtimeMs-a.info.mtimeMs);
const {name,info} = candidates[0];
const backupFile = path.join(dir,name);
if (!info.isFile() || info.size < 64) throw new Error("Newest backup is missing or suspiciously small.");
const age = (Date.now()-info.mtimeMs)/3600000;
if (age > maxAgeHours) throw new Error(`Newest backup is stale: ${age.toFixed(1)} hours old.`);
const command = process.env.PG_RESTORE_BIN ?? (process.platform === "win32" ? "pg_restore.exe" : "pg_restore");
const {stdout} = await run(command, ["--list",backupFile], {windowsHide:true,maxBuffer:20*1024*1024});
if (!stdout.includes("TOC Entries") && !stdout.includes("; Dumped from database")) {
  throw new Error("pg_restore returned an unexpected archive listing.");
}
console.log(`PASS: verified backup archive ${name}, age ${age.toFixed(2)} h, size ${info.size} bytes`);
