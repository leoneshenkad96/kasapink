import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { createRequire, Module } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import express from 'express';
import bcrypt from 'bcryptjs';

// Run the real auth router/middleware with an in-memory persistence double.
// No DATABASE_URL, file output, remote requests or production writes are used.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mockDb = String.raw`
  import { usersTable } from './lib/db/src/schema/users.ts';
  import { PgDialect } from 'drizzle-orm/pg-core';
  export { usersTable };
  export const state = { user: null, writes: 0, beforeWrite: null };
  const dialect = new PgDialect();
  const field = (column) => Object.keys(usersTable).find(k => usersTable[k] === column);
  // Evaluate only the equality/AND predicates used by this auth router. Fail
  // rather than silently ignoring a new query shape in future changes.
  const matches = (condition) => {
    if (!state.user) return false;
    if (!condition) return true;
    const query = dialect.sqlToQuery(condition);
    let checked = 0;
    for (const match of query.sql.matchAll(/"erp_users"\."(id|username|password_hash)" = \$(\d+)/g)) {
      const key = match[1] === 'password_hash' ? 'passwordHash' : match[1];
      checked++;
      if (state.user[key] !== query.params[Number(match[2]) - 1]) return false;
    }
    const timestamp = query.sql.match(/date_trunc\('milliseconds', "erp_users"\."updated_at"\) = \$(\d+)::timestamptz/);
    if (timestamp) {
      checked++;
      if (state.user.updatedAt.toISOString() !== query.params[Number(timestamp[1]) - 1]) return false;
    }
    if (checked !== query.params.length || checked === 0) throw new Error('Unsupported mock DB predicate');
    return true;
  };
  const project = (row, fields) => fields
    ? Object.fromEntries(Object.entries(fields).map(([key, column]) => [key, row[field(column)]]))
    : { ...row };
  export const db = {
    select(fields) {
      let condition;
      const query = {
        from() { return query; }, where(c) { condition = c; return query; }, limit() { return query; },
        then(resolve, reject) { return Promise.resolve(matches(condition) ? [project(state.user, fields)] : []).then(resolve, reject); }
      };
      return query;
    },
    update() {
      let values, fields, condition, executed = false, rows;
      const query = {
        set(v) { values = v; return query; }, where(c) { condition = c; return query; },
        returning(f) { fields = f; return query; },
        then(resolve, reject) {
          if (!executed) {
            executed = true;
            state.beforeWrite?.();
            state.beforeWrite = null;
            if (matches(condition)) {
              // Emulate the monotonic SQL timestamp. Actual SQL execution is
              // intentionally outside this isolated suite.
              const updatedAt = new Date(Math.max(Date.now(), state.user.updatedAt.getTime() + 1));
              state.user = { ...state.user, ...values, updatedAt };
              state.writes++;
              rows = [project(state.user, fields)];
            } else rows = [];
          }
          return Promise.resolve(rows).then(resolve, reject);
        }
      };
      return query;
    }
  };
`;
const compiled = await build({
  stdin: {
    contents: `export { default as router } from './artifacts/api-server/src/routes/auth.ts';
      export { createToken, verifyToken } from './artifacts/api-server/src/lib/auth.ts';
      export { state } from '@workspace/db';`,
    resolveDir: root, loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  plugins: [{ name: 'isolated-db', setup(builder) {
    builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: 'db', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: mockDb, loader: 'js', resolveDir: root }));
  } }],
});
const filename = path.join(root, 'auth-test-memory.cjs');
const loaded = new Module(filename);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(root);
loaded.require = createRequire(filename);
loaded._compile(compiled.outputFiles[0].text, filename);
const { router, createToken, state } = loaded.exports;

test('authentication sessions through the real HTTP router', async (t) => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = randomBytes(48).toString('hex');
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  const password = 'Local-test-password-123';
  const baseline = {
    id: 1, username: 'test-user', role: 'admin',
    passwordHash: await bcrypt.hash(password, 4), updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
  const reset = () => { state.user = { ...baseline }; state.writes = 0; state.beforeWrite = null; };
  const request = async (route, token, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.text();
    return { status: response.status, body: data ? JSON.parse(data) : null };
  };
  const signed = (payload) => {
    const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const content = head + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
    return content + '.' + createHmac('sha256', process.env.JWT_SECRET).update(content).digest('base64url');
  };

  await t.test('login and /me return only public user fields', async () => {
    reset();
    const login = await request('/login', null, 'POST', { username: baseline.username, password });
    assert.equal(login.status, 200);
    assert.deepEqual(Object.keys(login.body.user).sort(), ['id', 'role', 'username']);
    const payload = JSON.parse(Buffer.from(login.body.token.split('.')[1], 'base64url'));
    assert.equal(payload.passwordHash, undefined);
    const me = await request('/me', login.body.token);
    assert.equal(me.status, 200);
    assert.deepEqual(Object.keys(me.body.user).sort(), ['id', 'role', 'username']);
  });
  await t.test('invalid, expired and legacy tokens cannot access the API or logout', async () => {
    reset();
    const token = createToken(state.user);
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
    for (const invalid of [null, token + 'x', signed({ ...payload, exp: undefined }),
      signed({ ...payload, exp: '9999999999' }), signed({ ...payload, exp: payload.iat - 1 }),
      signed({ ...payload, revision: undefined }), signed({ ...payload, iat: payload.exp + 1 })]) {
      assert.equal((await request('/me', invalid)).status, 401);
      assert.equal((await request('/logout', invalid, 'POST')).status, 401);
    }
    assert.equal(state.writes, 0);
  });
  await t.test('logout invalidates all existing tokens and allows a fresh login', async () => {
    reset();
    const first = createToken(state.user);
    const second = createToken(state.user);
    assert.equal((await request('/logout', first, 'POST')).status, 204);
    assert.equal((await request('/me', first)).status, 401);
    assert.equal((await request('/me', second)).status, 401);
    assert.equal((await request('/me', createToken(state.user))).status, 200);
  });
  await t.test('password change revokes prior tokens and returns a working replacement', async () => {
    reset();
    const oldToken = createToken(state.user);
    const result = await request('/users/change-password', oldToken, 'PUT', {
      oldPassword: password, newPassword: 'New-local-password-456',
    });
    assert.equal(result.status, 200);
    assert.equal((await request('/me', oldToken)).status, 401);
    assert.equal((await request('/me', result.body.token)).status, 200);
    assert.equal(await bcrypt.compare('New-local-password-456', state.user.passwordHash), true);
  });
  await t.test('wrong password cannot change credentials or revoke a valid session', async () => {
    reset();
    const token = createToken(state.user);
    assert.equal((await request('/users/change-password', token, 'PUT', {
      oldPassword: 'wrong', newPassword: 'New-local-password-456',
    })).status, 400);
    assert.equal(state.writes, 0);
    assert.equal((await request('/me', token)).status, 200);
  });
  await t.test('delayed logout cannot revoke a newer account revision', async () => {
    reset();
    const token = createToken(state.user);
    state.beforeWrite = () => { state.user.updatedAt = new Date(baseline.updatedAt.getTime() + 1); };
    assert.equal((await request('/logout', token, 'POST')).status, 204);
    assert.equal(state.writes, 0);
    assert.equal((await request('/me', token)).status, 401);
    assert.equal((await request('/me', createToken(state.user))).status, 200);
  });
  await t.test('concurrent account changes cannot be overwritten by password change', async () => {
    reset();
    const token = createToken(state.user);
    state.beforeWrite = () => { state.user.updatedAt = new Date(baseline.updatedAt.getTime() + 1); };
    assert.equal((await request('/users/change-password', token, 'PUT', {
      oldPassword: password, newPassword: 'Concurrent-new-password-456',
    })).status, 409);
    assert.equal(state.writes, 0);
    assert.equal(state.user.passwordHash, baseline.passwordHash);
  });
  await t.test('admin reset and account role changes invalidate previous tokens', async () => {
    reset();
    const token = createToken(state.user);
    assert.equal((await request('/users/1', token, 'PUT', {
      role: 'admin', newPassword: 'Reset-local-password-789',
    })).status, 200);
    assert.equal((await request('/me', token)).status, 401);
    const fresh = createToken(state.user);
    state.user.role = 'testing';
    assert.equal((await request('/me', fresh)).status, 401);
    state.user = null;
    assert.equal((await request('/me', fresh)).status, 401);
  });
});
