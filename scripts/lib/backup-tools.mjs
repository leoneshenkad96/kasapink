import { execFile } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, mkdtemp, open, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { once } from 'node:events';

const exec = promisify(execFile);
const magic = Buffer.from('KASAPINK-BACKUP-V1\n');
const headerLength = magic.length + 12;
export const requiredTables = ['erp_users', 'erp_ingredients', 'erp_products', 'erp_sales', 'erp_purchases', 'erp_auth_rate_limit'];

export function backupKey(value = process.env.ERP_BACKUP_KEY) {
  if (!/^[a-f0-9]{64}$/i.test(value ?? '')) throw new Error('ERP_BACKUP_KEY must contain a random 32-byte key encoded as 64 hex characters.');
  return Buffer.from(value, 'hex');
}

// Secrets stay in the child environment, never in process arguments.
// Reject query-string routing overrides, including libpq host/service bypasses.
export function postgresEnv(uri, { localOnly = false } = {}) {
  let url;
  try { url = new URL(uri); } catch { throw new Error('A valid PostgreSQL connection URI is required.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Only PostgreSQL URIs are accepted.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const local = ['localhost', '127.0.0.1', '::1'].includes(host);
  if (!host || (localOnly && !local)) throw new Error('Restore is restricted to an explicit loopback database host.');
  const allowed = new Set(['sslmode', 'channel_binding', 'connect_timeout', 'application_name']);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) throw new Error('Unsupported PostgreSQL URI query option; routing and credential overrides are forbidden.');
  }
  const env = { ...process.env };
  for (const name of ['PGSERVICE', 'PGSERVICEFILE', 'PGHOSTADDR', 'PGOPTIONS', 'DATABASE_URL', 'ERP_RESTORE_DATABASE_URL', 'ERP_RESTORE_ADMIN_URL', 'ERP_BACKUP_KEY']) delete env[name];
  Object.assign(env, {
    PGHOST: host, PGPORT: url.port || '5432', PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGCONNECT_TIMEOUT: '15', PGAPPNAME: 'kasapink-recovery',
    PGSSLMODE: local ? 'disable' : 'verify-full',
  });
  if (!env.PGDATABASE || !env.PGUSER) throw new Error('The PostgreSQL URI must name a database and user.');
  if (!/^[A-Za-z0-9_.-]{1,63}$/.test(env.PGDATABASE)) throw new Error('Use a simple database name; connection-string-like database names are forbidden.');
  if (!local) env.PGSSLROOTCERT = process.env.PGSSLROOTCERT || 'system';
  if (url.searchParams.has('channel_binding')) env.PGCHANNELBINDING = url.searchParams.get('channel_binding');
  return env;
}

export async function runPg(kind, args, env) {
  const bin = process.env[`PG_${kind.toUpperCase()}_BIN`] ||
    (process.env.PG_BIN ? path.join(process.env.PG_BIN, `pg_${kind}${process.platform === 'win32' ? '.exe' : ''}`) : `pg_${kind}`);
  const executable = kind === 'psql' ? (process.env.PSQL_BIN || (process.env.PG_BIN ? path.join(process.env.PG_BIN, `psql${process.platform === 'win32' ? '.exe' : ''}`) : 'psql')) : bin;
  try {
    return await exec(executable, args, { env, windowsHide: true, timeout: 600_000, maxBuffer: 32 * 1024 * 1024 });
  } catch (error) {
    // Child-process Error objects can expose arguments, stderr and environment.
    throw new Error(`${kind} failed (${error.code ?? 'unknown'}). Check client version, permissions, connectivity and certificate trust; connection details are suppressed.`);
  }
}

export async function encryptArchive(source, target, key) {
  const nonce = randomBytes(12), header = Buffer.concat([magic, nonce]);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(header);
  const output = createWriteStream(target, { flags: 'wx', mode: 0o600 });
  await once(output, 'open');
  output.write(header);
  try {
    await pipeline(createReadStream(source), cipher, output);
    await appendFile(target, cipher.getAuthTag());
  } catch (error) { await rm(target, { force: true }); throw error; }
}

export async function decryptArchive(source, target, key) {
  const handle = await open(source, 'r');
  let header, tag, size;
  try {
    ({ size } = await handle.stat());
    if (size <= headerLength + 16) throw new Error('Encrypted archive is truncated.');
    header = Buffer.alloc(headerLength); tag = Buffer.alloc(16);
    await handle.read(header, 0, header.length, 0);
    await handle.read(tag, 0, tag.length, size - tag.length);
  } finally { await handle.close(); }
  if (!header.subarray(0, magic.length).equals(magic)) throw new Error('Unsupported encrypted archive format.');
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(magic.length));
  decipher.setAAD(header); decipher.setAuthTag(tag);
  const output = createWriteStream(target, { flags: 'wx', mode: 0o600 });
  await once(output, 'open');
  try {
    await pipeline(createReadStream(source, { start: headerLength, end: size - 17 }), decipher,
      output);
  } catch {
    await rm(target, { force: true });
    throw new Error('Archive authentication failed: wrong key or damaged encrypted backup.');
  }
}

export async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function withArchive(file, callback) {
  if (!file.endsWith('.enc')) {
    if (process.env.ERP_ALLOW_PLAINTEXT_BACKUP !== 'true') throw new Error('Legacy plaintext archives require ERP_ALLOW_PLAINTEXT_BACKUP=true.');
    return callback(file);
  }
  const temp = await mkdtemp(path.join(os.tmpdir(), 'kasapink-restore-'));
  try {
    const archive = path.join(temp, 'backup.dump');
    await decryptArchive(file, archive, backupKey());
    return await callback(archive);
  } finally { await rm(temp, { recursive: true, force: true }); }
}

export async function newestBackup(dir) {
  if (process.env.ERP_BACKUP_FILE) return path.resolve(process.env.ERP_BACKUP_FILE);
  const candidates = [];
  for (const name of await readdir(dir)) {
    if (!/^kasapink-erp-.*\.dump\.enc$/.test(name)) continue;
    const file = path.join(dir, name), info = await stat(file);
    if (info.isFile()) candidates.push({ file, time: info.mtimeMs });
  }
  candidates.sort((a, b) => b.time - a.time);
  if (!candidates.length) throw new Error('No encrypted ERP backups found.');
  return candidates[0].file;
}

export async function validateArchive(archive) {
  const { stdout } = await runPg('restore', ['--list', archive], process.env);
  for (const table of requiredTables) {
    if (!new RegExp(` TABLE public ${table} `).test(stdout)) throw new Error(`Backup is missing required table ${table}.`);
  }
}

export async function validateManifest(file) {
  const manifest = JSON.parse(await readFile(`${file}.json`, 'utf8'));
  const key = backupKey();
  try {
    const expected = signManifest(manifest, key).mac;
    if (!/^[a-f0-9]{64}$/.test(manifest.mac ?? '') || !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(manifest.mac, 'hex'))) throw new Error('Backup manifest authentication failed.');
  } finally { key.fill(0); }
  const info = await stat(file);
  if (manifest.sha256 !== await digest(file) || manifest.size !== info.size) throw new Error('Backup checksum/size does not match its manifest.');
  return manifest;
}

export function signManifest(manifest, key) {
  const { format, createdAt, size, sha256 } = manifest;
  const core = { format, createdAt, size, sha256 };
  const macKey = createHmac('sha256', key).update('kasapink-backup-manifest-v1').digest();
  const mac = createHmac('sha256', macKey).update(JSON.stringify(core)).digest('hex');
  macKey.fill(0);
  return { ...core, mac };
}
