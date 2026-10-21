import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { backupKey, decryptArchive, digest, encryptArchive, postgresEnv, runPg, signManifest, validateManifest } from './lib/backup-tools.mjs';

test('PostgreSQL connection secrets never enter arguments and routing overrides are rejected', () => {
  const env = postgresEnv('postgresql://backup:secret%21@db.example:5433/erp?sslmode=require');
  assert.equal(env.PGPASSWORD, 'secret!');
  assert.equal(env.PGDATABASE, 'erp');
  assert.equal(env.PGHOST, 'db.example');
  assert.equal(env.PGSSLMODE, 'verify-full');
  for (const secret of ['DATABASE_URL', 'ERP_BACKUP_KEY', 'ERP_RESTORE_ADMIN_URL', 'ERP_RESTORE_DATABASE_URL']) assert.equal(env[secret], undefined);
  assert.throws(() => postgresEnv('postgresql://u:p@db.example/erp', { localOnly: true }), /loopback/);
  for (const query of ['host=prod.example', 'hostaddr=1.2.3.4', 'service=prod', 'password=secret', 'dbname=prod', 'options=-c']) {
    assert.throws(() => postgresEnv(`postgresql://u:p@localhost/test?${query}`, { localOnly: true }), /overrides/);
  }
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) assert.equal(postgresEnv(`postgresql://u:p@${host}/test`, { localOnly: true }).PGSSLMODE, 'disable');
  assert.throws(() => postgresEnv('https://example.com'), /PostgreSQL/);
  assert.throws(() => postgresEnv('postgresql://u:p@localhost/host%3Dprod'), /database name/);
  assert.throws(() => backupKey('short'), /32-byte/);
});

test('manifest authentication prevents forged backup timestamps', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kasapink manifest test '));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const previous = process.env.ERP_BACKUP_KEY;
  const key = randomBytes(32); process.env.ERP_BACKUP_KEY = key.toString('hex');
  try {
    const file = path.join(dir, 'backup.dump.enc'); await writeFile(file, randomBytes(128));
    const manifest = signManifest({ format: 'kasapink-aes-256-gcm-v1', createdAt: new Date().toISOString(), size: 128, sha256: await digest(file) }, key);
    await writeFile(`${file}.json`, JSON.stringify(manifest));
    await validateManifest(file);
    manifest.createdAt = '2099-01-01T00:00:00.000Z';
    await writeFile(`${file}.json`, JSON.stringify(manifest));
    await assert.rejects(validateManifest(file), /authentication failed/);
  } finally {
    if (previous === undefined) delete process.env.ERP_BACKUP_KEY; else process.env.ERP_BACKUP_KEY = previous;
  }
});

test('AES-GCM authenticates round trips, randomized nonces and every failure cleans temporary plaintext', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kasapink crypto test '));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = randomBytes(32), data = Buffer.concat([Buffer.from('PRIVATE ERP FIXTURE'), randomBytes(128 * 1024)]);
  const input = path.join(dir, 'fixture.dump'), encrypted = path.join(dir, 'one.enc'), second = path.join(dir, 'two.enc'), output = path.join(dir, 'restored.dump');
  await writeFile(input, data);
  await encryptArchive(input, encrypted, key); await encryptArchive(input, second, key);
  assert.notDeepEqual(await readFile(encrypted), await readFile(second));
  assert.equal((await readFile(encrypted)).includes(Buffer.from('PRIVATE ERP FIXTURE')), false);
  await decryptArchive(encrypted, output, key);
  assert.deepEqual(await readFile(output), data);
  if (process.platform !== 'win32') assert.equal((await stat(output)).mode & 0o777, 0o600);
  await assert.rejects(decryptArchive(encrypted, output, key), /EEXIST/);
  assert.deepEqual(await readFile(output), data, 'existing restore target must never be deleted on EEXIST');
  await assert.rejects(encryptArchive(input, encrypted, key), /EEXIST/);
  for (const kind of ['wrong-key', 'tamper', 'truncated']) {
    const bad = path.join(dir, `${kind}.enc`), restored = path.join(dir, `${kind}.dump`);
    const bytes = await readFile(encrypted);
    if (kind === 'tamper') bytes[64] ^= 1;
    await writeFile(bad, kind === 'truncated' ? bytes.subarray(0, 12) : bytes);
    await assert.rejects(decryptArchive(bad, restored, kind === 'wrong-key' ? randomBytes(32) : key), /authentication|truncated/);
    await assert.rejects(access(restored));
  }
});

test('PostgreSQL errors suppress credentials and raw child stderr', async () => {
  const previous = process.env.PSQL_BIN;
  process.env.PSQL_BIN = process.execPath;
  try {
    await assert.rejects(runPg('psql', ['-e', 'throw new Error(process.env.PGPASSWORD)'], { ...process.env, PGPASSWORD: 'NEVER-PRINT-THIS-PASSWORD' }), error => {
      assert.equal(String(error).includes('NEVER-PRINT-THIS-PASSWORD'), false);
      return /psql failed/.test(error.message);
    });
  } finally {
    if (previous === undefined) delete process.env.PSQL_BIN; else process.env.PSQL_BIN = previous;
  }
});
