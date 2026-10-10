import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve(process.env.ERP_BACKUP_DIR ?? "./backups");
const maxAgeHours = Number(process.env.ERP_BACKUP_MAX_AGE_HOURS ?? 26);
const files = (await readdir(outputDir)).filter((file) => /^kasapink-erp-.*\.dump$/.test(file));
if (!files.length) throw new Error(`No ERP backup found in ${outputDir}`);
const stats = await Promise.all(files.map(async (file) => ({ file, info: await stat(path.join(outputDir, file)) })));
const latest = stats.sort((a, b) => b.info.mtimeMs - a.info.mtimeMs)[0];
const ageHours = (Date.now() - latest.info.mtimeMs) / 3600000;
if (ageHours > maxAgeHours) throw new Error(`Latest ERP backup is ${ageHours.toFixed(1)} hours old: ${latest.file}`);
console.log(`Backup check passed: ${latest.file} (${ageHours.toFixed(1)} hours old).`);
