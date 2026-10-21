import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { newestBackup, postgresEnv, requiredTables, runPg, validateArchive, validateManifest, withArchive } from './lib/backup-tools.mjs';

const adminEnv = postgresEnv(process.env.ERP_RESTORE_ADMIN_URL, { localOnly: true });
const name = `kasapink_restore_check_${randomBytes(8).toString('hex')}`;
const targetEnv = { ...adminEnv, PGDATABASE: name };
const file = await newestBackup(path.resolve(process.env.ERP_BACKUP_DIR || './backups'));
const manifest = await validateManifest(file);
const sql = (command, env = adminEnv) => runPg('psql', ['--no-psqlrc', '--no-password', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--command', command], env);
let created = false, counts;
try {
  await withArchive(file, async archive => {
    await validateArchive(archive);
    await sql(`CREATE DATABASE "${name}"`); created = true;
    await runPg('restore', ['--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges', '--no-password', archive], targetEnv);
    counts = {};
    for (const table of requiredTables) {
      const { stdout } = await sql(`SELECT count(*) FROM public."${table}"`, targetEnv);
      const count = stdout.trim();
      if (!/^\d+$/.test(count)) throw new Error(`Restored table ${table} could not be counted.`);
      counts[table] = count;
    }
  });
} finally {
  // This name is generated internally. Never drop a caller-provided database.
  if (created) await sql(`DROP DATABASE "${name}"`);
}
const report = { verifiedAt: new Date().toISOString(), backup: path.basename(file), sha256: manifest.sha256, target: 'disposable loopback PostgreSQL database', counts, restored: true, disposed: true };
await writeFile(`${file}.restore-check.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log('PASS: full restore, required-table row counts and disposable-database cleanup completed.');
