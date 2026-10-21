import { copyFile, mkdir, mkdtemp, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { backupKey, digest, encryptArchive, postgresEnv, runPg, validateArchive } from './lib/backup-tools.mjs';

const key = backupKey();
const env = postgresEnv(process.env.DATABASE_URL);
const outputDir = path.resolve(process.env.ERP_BACKUP_DIR || './backups');
const copyDir = process.env.ERP_BACKUP_OFFSITE_DIR && path.resolve(process.env.ERP_BACKUP_OFFSITE_DIR);
if (!copyDir) throw new Error('ERP_BACKUP_OFFSITE_DIR is required: choose a separately stored, trusted backup destination.');
await mkdir(outputDir, { recursive: true, mode: 0o700 });
await mkdir(copyDir, { recursive: true, mode: 0o700 });
const [local, second] = await Promise.all([realpath(outputDir), realpath(copyDir)]);
if (local === second || local.startsWith(second + path.sep) || second.startsWith(local + path.sep)) throw new Error('Backup destinations must be separate directories, including after resolving links.');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const name = `kasapink-erp-${stamp}-${randomBytes(4).toString('hex')}.dump.enc`;
const output = path.join(local, name), copied = path.join(second, name);
const temp = await mkdtemp(path.join(local, '.pending-'));
try {
  const dump = path.join(temp, 'backup.dump'), encrypted = path.join(temp, name);
  await runPg('dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', dump], env);
  await validateArchive(dump);
  await encryptArchive(dump, encrypted, key);
  const manifest = { format: 'kasapink-aes-256-gcm-v1', createdAt: new Date().toISOString(), size: (await stat(encrypted)).size, sha256: await digest(encrypted) };
  await rename(encrypted, output);
  await writeFile(`${output}.json`, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await copyFile(output, `${copied}.partial`, constants.COPYFILE_EXCL);
  if (await digest(`${copied}.partial`) !== manifest.sha256) throw new Error('Second backup copy failed checksum verification.');
  await rename(`${copied}.partial`, copied);
  await copyFile(`${output}.json`, `${copied}.json`, constants.COPYFILE_EXCL);
  // Retention is deliberately separate: do not remove older recovery points
  // before a full restore test of the new backup has passed.
  console.log(`PASS: encrypted backup and checksum-verified second copy created: ${name}`);
  console.log('The operator must ensure the second destination is on independent storage and keep a separate recovery key.');
} finally {
  key.fill(0);
  await rm(temp, { recursive: true, force: true });
  await rm(`${copied}.partial`, { force: true });
}
