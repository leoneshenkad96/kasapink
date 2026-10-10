import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const backupFile = process.env.ERP_BACKUP_FILE;
const databaseUrl = process.env.DATABASE_URL;
const pgRestore = process.env.PG_RESTORE_BIN || "pg_restore";

if (!backupFile || !databaseUrl) throw new Error("Set ERP_BACKUP_FILE and DATABASE_URL before restoring.");
if (process.env.ALLOW_ERP_RESTORE !== "true") throw new Error("Restore is disabled. Set ALLOW_ERP_RESTORE=true for a deliberate local restore.");
if (process.env.CONFIRM_ERP_RESTORE !== "RESTORE KASAPINK ERP") throw new Error("Set CONFIRM_ERP_RESTORE='RESTORE KASAPINK ERP' to confirm the overwrite.");
const parsed = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) throw new Error("Restore is restricted to a local database host.");
await access(backupFile);
await run(pgRestore, ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--dbname", databaseUrl, backupFile], { windowsHide: true, timeout: 120000 });
console.log(`ERP restore completed from ${backupFile}`);
