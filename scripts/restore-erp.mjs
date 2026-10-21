import path from 'node:path';
import { newestBackup, postgresEnv, runPg, validateArchive, validateManifest, withArchive } from './lib/backup-tools.mjs';

if (process.env.ALLOW_ERP_RESTORE !== 'true' || process.env.CONFIRM_ERP_RESTORE !== 'RESTORE KASAPINK ERP') throw new Error('Restore disabled. Set ALLOW_ERP_RESTORE=true and CONFIRM_ERP_RESTORE="RESTORE KASAPINK ERP" deliberately.');
// Never reuse DATABASE_URL, which often points to Production.
const env = postgresEnv(process.env.ERP_RESTORE_DATABASE_URL, { localOnly: true });
if (['postgres', 'template0', 'template1'].includes(env.PGDATABASE)) throw new Error('Restore into a dedicated local ERP database, never a maintenance database.');
const file = await newestBackup(path.resolve(process.env.ERP_BACKUP_DIR || './backups'));
if (file.endsWith('.enc')) await validateManifest(file);
await withArchive(file, async archive => {
  await validateArchive(archive);
  await runPg('restore', ['--single-transaction', '--exit-on-error', '--clean', '--if-exists', '--no-owner', '--no-privileges', '--no-password', archive], env);
});
console.log('PASS: local restore committed atomically. Production was not a restore target.');
