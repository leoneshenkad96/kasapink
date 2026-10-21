import path from 'node:path';
import { stat } from 'node:fs/promises';
import { newestBackup, validateArchive, validateManifest, withArchive } from './lib/backup-tools.mjs';

const file = await newestBackup(path.resolve(process.env.ERP_BACKUP_DIR || './backups'));
const maxAge = Number(process.env.ERP_BACKUP_MAX_AGE_HOURS || 26);
if (!Number.isFinite(maxAge) || maxAge <= 0) throw new Error('ERP_BACKUP_MAX_AGE_HOURS must be positive.');
const manifest = await validateManifest(file);
const age = (Date.now() - Date.parse(manifest.createdAt)) / 3_600_000;
if (!Number.isFinite(age) || age < -0.1 || age > maxAge || !(await stat(file)).isFile()) throw new Error('Newest backup has invalid time or is stale.');
await withArchive(file, validateArchive);
console.log(`PASS: checksum, AES-GCM authentication, required tables and freshness (${age.toFixed(2)} hours). A full restore is still required.`);
