import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { createRequire, Module } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { build } from 'esbuild';
import express from 'express';

// Always create our own PostgreSQL cluster. Never accept an existing DATABASE_URL.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);
const pgBin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/17/bin' : '');
const binary = name => path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : ''));
const command = (name, args) => run(binary(name), args, { windowsHide: true, timeout: 45000 });
const freePort = () => new Promise((resolve, reject) => {
  const listener = net.createServer();
  listener.on('error', reject);
  listener.listen(0, '127.0.0.1', () => {
    const port = listener.address().port;
    listener.close(error => error ? reject(error) : resolve(port));
  });
});

test('auth with an isolated PostgreSQL cluster and the real Drizzle adapter', { timeout: 180000 }, async (t) => {
  const originalEnv = Object.fromEntries(['DATABASE_URL', 'JWT_SECRET', 'ADMIN_BOOTSTRAP_TOKEN'].map(k => [k, process.env[k]]));
  const tempRoot = await realpath(os.tmpdir());
  const testDir = await mkdtemp(path.join(tempRoot, 'kasapink-auth-pg-'));
  const dataDir = path.join(testDir, 'data');
  let startAttempted = false;
  let pool;
  let server;
  t.after(async () => {
    try {
      try {
        if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      } finally {
        if (pool) await pool.end();
      }
    } finally {
      try {
        if (startAttempted) {
          try { await command('pg_ctl', ['-D', dataDir, '-m', 'fast', '-w', 'stop']); }
          catch (error) {
            // Exit code 3 from status means no server is running. Any other
            // failure leaves the directory intact and fails cleanup visibly.
            let stopped = false;
            try { await command('pg_ctl', ['-D', dataDir, 'status']); }
            catch (statusError) { stopped = statusError.code === 3; }
            if (!stopped) throw error;
          }
        }
        const resolved = await realpath(testDir);
        assert.equal(path.dirname(resolved).toLowerCase(), tempRoot.toLowerCase());
        assert.ok(path.basename(resolved).startsWith('kasapink-auth-pg-'));
        await rm(resolved, { recursive: true });
        console.log('Temporary PostgreSQL cluster stopped and removed.');
      } finally {
        for (const [key, value] of Object.entries(originalEnv)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }
  });

  await command('initdb', ['-D', dataDir, '-U', 'kasapink_test', '--auth=trust', '--no-locale', '--encoding=UTF8']);
  const port = await freePort();
  startAttempted = true;
  await command('pg_ctl', ['-D', dataDir, '-l', path.join(testDir, 'postgres.log'), '-w',
    '-o', `-h 127.0.0.1 -p ${port} -F`, 'start']);
  console.log('Temporary PostgreSQL is ready; running real auth SQL.');
  process.env.DATABASE_URL = `postgresql://kasapink_test@127.0.0.1:${port}/postgres`;
  process.env.JWT_SECRET = randomBytes(48).toString('hex');
  process.env.ADMIN_BOOTSTRAP_TOKEN = randomBytes(32).toString('hex');

  const compiled = await build({
    stdin: {
      contents: `export { default as router } from './artifacts/api-server/src/routes/auth.ts';
        export { getPool } from './lib/db/src/index.ts';`,
      resolveDir: root, loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'cjs', write: false, external: ['pg-native'],
  });
  const filename = path.join(root, 'auth-postgres-memory.cjs');
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(root);
  loaded.require = createRequire(filename);
  loaded._compile(compiled.outputFiles[0].text, filename);
  pool = loaded.exports.getPool();
  // Apply the repository's existing account migrations to the empty test DB.
  for (const migration of ['0005_user_roles.sql', '0006_add_user_role.sql']) {
    await pool.query(await readFile(path.join(root, 'lib/db/migrations', migration), 'utf8'));
  }
  const app = express();
  app.use(express.json());
  app.use('/api', loaded.exports.router);
  app.use((error, _req, res, _next) => {
    // Don't log SQL parameters or credentials even when a test fails.
    res.status(500).json({ error: 'Test API error', code: error.cause?.code || error.code || 'UNKNOWN' });
  });
  server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    instance.on('error', reject);
  });
  const request = async (route, token, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.text();
    return { status: response.status, body: data ? JSON.parse(data) : null };
  };
  const password = randomBytes(16).toString('hex');
  const login = async (username, currentPassword = password) => {
    const result = await request('/login', null, 'POST', { username, password: currentPassword });
    assert.equal(result.status, 200, 'Login must succeed');
    return result.body.token;
  };
  let adminToken;
  let operatorId;
  let operatorPassword = password;

  await t.test('simultaneous bootstrap creates exactly one admin and a usable token', async () => {
    assert.equal((await request('/setup/status')).body.needsAdmin, true);
    const setup = () => request('/setup/admin', null, 'POST', {
      bootstrapToken: process.env.ADMIN_BOOTSTRAP_TOKEN, username: 'test-admin', password,
    });
    const results = await Promise.all([setup(), setup()]);
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
    const created = results.find(r => r.status === 201);
    adminToken = created.body.token;
    assert.deepEqual(Object.keys(created.body.user).sort(), ['id', 'role', 'username']);
    const me = await request('/me', adminToken);
    assert.equal(me.status, 200);
    assert.deepEqual(Object.keys(me.body.user).sort(), ['id', 'role', 'username']);
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM erp_users')).rows[0].total, 1);
  });

  await t.test('admin creates an operator; non-admin access and wrong login are rejected', async () => {
    const created = await request('/users', adminToken, 'POST', { username: 'test-operator', password, role: 'user' });
    assert.equal(created.status, 201);
    operatorId = created.body.id;
    assert.ok(Number.isSafeInteger(operatorId));
    const operatorToken = await login('test-operator');
    assert.equal((await request('/users', operatorToken)).status, 403);
    assert.equal((await request('/users', null)).status, 401);
    assert.equal((await request('/login', null, 'POST', { username: 'not-an-account', password })).status, 401);
    assert.equal((await request('/login', null, 'POST', { username: 'test-operator', password: 'incorrect' })).status, 401);
  });

  await t.test('logout handles microsecond timestamps, revokes all tokens, and preserves other users', async () => {
    assert.equal((await pool.query("UPDATE erp_users SET updated_at = '2026-01-01 00:00:00.123456+00' WHERE id = $1", [operatorId])).rowCount, 1);
    const first = await login('test-operator');
    const second = await login('test-operator');
    assert.equal((await request('/logout', first, 'POST')).status, 204);
    assert.equal((await request('/me', first)).status, 401);
    assert.equal((await request('/me', second)).status, 401);
    assert.equal((await request('/me', adminToken)).status, 200);
    assert.equal((await request('/me', await login('test-operator'))).status, 200);
  });

  await t.test('logout always advances the database revision even beyond the current clock', async () => {
    assert.equal((await pool.query("UPDATE erp_users SET updated_at = clock_timestamp() + interval '1 day' WHERE id = $1", [operatorId])).rowCount, 1);
    const before = (await pool.query('SELECT updated_at FROM erp_users WHERE id = $1', [operatorId])).rows[0].updated_at;
    const token = await login('test-operator');
    assert.equal((await request('/logout', token, 'POST')).status, 204);
    const after = (await pool.query('SELECT updated_at FROM erp_users WHERE id = $1', [operatorId])).rows[0].updated_at;
    assert.ok(after.getTime() > before.getTime());
    assert.equal((await request('/me', token)).status, 401);
  });

  await t.test('password change replaces the current token and invalidates other sessions', async () => {
    const token = await login('test-operator', operatorPassword);
    const other = await login('test-operator', operatorPassword);
    const newPassword = randomBytes(16).toString('hex');
    const changed = await request('/users/change-password', token, 'PUT', { oldPassword: operatorPassword, newPassword });
    assert.equal(changed.status, 200);
    assert.equal((await request('/me', token)).status, 401);
    assert.equal((await request('/me', other)).status, 401);
    assert.equal((await request('/me', changed.body.token)).status, 200);
    assert.equal((await request('/login', null, 'POST', { username: 'test-operator', password: operatorPassword })).status, 401);
    operatorPassword = newPassword;
    assert.equal((await request('/me', await login('test-operator', operatorPassword))).status, 200);
  });

  await t.test('concurrent password changes have only one winner', async () => {
    const token = await login('test-operator', operatorPassword);
    const passwords = [randomBytes(16).toString('hex'), randomBytes(16).toString('hex')];
    const results = await Promise.all(passwords.map(newPassword => request('/users/change-password', token, 'PUT', {
      oldPassword: operatorPassword, newPassword,
    })));
    assert.equal(results.filter(r => r.status === 200).length, 1);
    assert.ok(results.every(r => [200, 401, 409].includes(r.status)));
    const winner = results.findIndex(r => r.status === 200);
    operatorPassword = passwords[winner];
    assert.equal((await request('/me', results[winner].body.token)).status, 200);
    await login('test-operator', operatorPassword);
  });

  await t.test('admin reset, role update and deletion revoke real persisted sessions', async () => {
    const oldToken = await login('test-operator', operatorPassword);
    const resetPassword = randomBytes(16).toString('hex');
    const reset = await request(`/users/${operatorId}`, adminToken, 'PUT', { role: 'user', newPassword: resetPassword });
    assert.equal(reset.status, 200);
    assert.equal((await request('/me', oldToken)).status, 401);
    const fresh = await login('test-operator', resetPassword);
    assert.equal((await request(`/users/${operatorId}`, adminToken, 'PUT', { role: 'testing' })).status, 200);
    assert.equal((await request('/me', fresh)).status, 401);
    const testingToken = await login('test-operator', resetPassword);
    assert.equal((await request(`/users/${operatorId}`, adminToken, 'DELETE')).status, 200);
    assert.equal((await request('/me', testingToken)).status, 401);
    assert.equal((await request('/me', adminToken)).status, 200);
  });
});
