import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import test from 'node:test';
import { digest, postgresEnv, requiredTables, runPg } from './lib/backup-tools.mjs';

const exec = promisify(execFile);
test('real PostgreSQL: encrypted dump, independent copy, complete restore and clean disposal', { skip: !process.env.BACKUP_PG_TEST_URL }, async t => {
  const uri = process.env.BACKUP_PG_TEST_URL;
  const pg = postgresEnv(uri, { localOnly: true });
  assert.equal(pg.PGDATABASE, 'kasapink_backup_fixture', 'only the disposable CI fixture may be written');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kasapink postgres test '));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const local = path.join(dir, 'local'), second = path.join(dir, 'second');
  const env = { ...process.env, DATABASE_URL: uri, ERP_BACKUP_KEY: randomBytes(32).toString('hex'), ERP_BACKUP_DIR: local, ERP_BACKUP_OFFSITE_DIR: second, ERP_RESTORE_ADMIN_URL: uri };
  delete env.ERP_BACKUP_FILE;
  const cli = script => exec(process.execPath, [`scripts/${script}.mjs`], { env, timeout: 120_000 });
  const sql = command => runPg('psql', ['--no-psqlrc', '--no-password', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--command', command], pg);
  await sql(requiredTables.map(table => `CREATE TABLE public.${table} (id integer PRIMARY KEY, quantity numeric NOT NULL CHECK (quantity >= 0)); INSERT INTO public.${table} VALUES (1, 0.25), (2, 8.50);`).join('\n'));
  await cli('backup-erp'); await cli('check-backup'); await cli('restore-check');
  const file = (await readdir(local)).find(name => name.endsWith('.dump.enc'));
  assert.ok(file);
  assert.equal(await digest(path.join(local, file)), await digest(path.join(second, file)));
  const report = JSON.parse(await readFile(path.join(local, `${file}.restore-check.json`), 'utf8'));
  assert.equal(report.restored, true); assert.equal(report.disposed, true);
  assert.deepEqual(Object.values(report.counts), requiredTables.map(() => '2'));
  assert.equal((await sql("SELECT count(*) FROM pg_database WHERE datname LIKE 'kasapink_restore_check_%'")).stdout.trim(), '0');
  assert.equal((await sql('SELECT sum(quantity) FROM erp_sales')).stdout.trim(), '8.75', 'source fixture data must be unchanged');
  assert.equal((await readdir(local)).some(name => name.endsWith('.dump') || name.startsWith('.pending-')), false);
  // A corrupt copy must not produce a successful restore report.
  const damaged = path.join(second, file), bytes = await readFile(damaged); bytes[64] ^= 1; await writeFile(damaged, bytes);
  const bad = { ...env, ERP_BACKUP_FILE: damaged };
  await assert.rejects(exec(process.execPath, ['scripts/restore-check.mjs'], { env: bad }), /checksum/);
});
