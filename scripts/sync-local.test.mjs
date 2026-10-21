import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./sync-local.mjs', import.meta.url));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function fixture(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'kasapink sync test '));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const remote = path.join(dir, 'remote.git'), producer = path.join(dir, 'producer'), local = path.join(dir, 'laptop');
  mkdirSync(producer); git(dir, 'init', '--bare', remote); git(producer, 'init', '-b', 'main');
  git(producer, 'config', 'user.email', 'test@example.invalid'); git(producer, 'config', 'user.name', 'Test');
  writeFileSync(path.join(producer, '.gitignore'), '.env\n.local/\n');
  writeFileSync(path.join(producer, 'base.txt'), 'original\n');
  git(producer, 'add', '.'); git(producer, 'commit', '-m', 'base'); git(producer, 'push', remote, 'main');
  git(dir, 'clone', '-b', 'main', remote, local);
  git(local, 'remote', 'set-url', 'origin', 'https://github.com/leoneshenkad96/kasapink.git');
  git(local, 'config', 'user.email', 'test@example.invalid'); git(local, 'config', 'user.name', 'Test');
  writeFileSync(path.join(producer, 'security.txt'), 'new security patch\n');
  git(producer, 'add', '.'); git(producer, 'commit', '-m', 'security patch'); git(producer, 'push', remote, 'main');
  const env = { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `url.${remote.replaceAll('\\', '/')}.insteadOf`, GIT_CONFIG_VALUE_0: 'https://github.com/leoneshenkad96/kasapink.git' };
  const run = () => spawnSync(process.execPath, [script, local], { env, encoding: 'utf8' });
  return { dir, producer, local, run };
}

test('sync fast-forwards latest source, preserves dirty/untracked work and leaves ignored secrets/data intact', t => {
  const { producer, local, run } = fixture(t);
  writeFileSync(path.join(local, 'base.txt'), 'laptop work\n');
  writeFileSync(path.join(local, 'notes.txt'), 'untracked work\n');
  writeFileSync(path.join(local, '.env'), 'PRIVATE-ENV');
  mkdirSync(path.join(local, '.local'));
  writeFileSync(path.join(local, '.local', 'database.bin'), 'IMPORTANT-LOCAL-DATA');
  const result = run(); assert.equal(result.status, 0, result.stderr);
  assert.equal(git(local, 'rev-parse', 'HEAD'), git(producer, 'rev-parse', 'HEAD'));
  assert.equal(readFileSync(path.join(local, 'security.txt'), 'utf8'), 'new security patch\n');
  assert.equal(readFileSync(path.join(local, '.env'), 'utf8'), 'PRIVATE-ENV');
  assert.equal(readFileSync(path.join(local, '.local', 'database.bin'), 'utf8'), 'IMPORTANT-LOCAL-DATA');
  const { savedWork } = JSON.parse(readFileSync(path.join(local, '.local', 'last-sync.json')));
  assert.match(git(local, 'stash', 'show', '-p', savedWork), /laptop work/);
  assert.equal(git(local, 'show', `${savedWork}^3:notes.txt`), 'untracked work');
  assert.equal(git(local, 'status', '--porcelain'), '');
  assert.equal(run().status, 0, 'repeated clean synchronization is safe');
  assert.equal(git(local, 'rev-parse', 'stash@{0}'), savedWork, 'a later sync must not delete the saved work');
});

test('sync refuses divergent local commits before stashing or changing files', t => {
  const { local, run } = fixture(t);
  writeFileSync(path.join(local, 'local-only.txt'), 'local commit');
  git(local, 'add', '.'); git(local, 'commit', '-m', 'local-only');
  const before = git(local, 'rev-parse', 'HEAD');
  writeFileSync(path.join(local, 'base.txt'), 'unsaved edits');
  const result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /diverge/);
  assert.equal(git(local, 'rev-parse', 'HEAD'), before);
  assert.equal(readFileSync(path.join(local, 'base.txt'), 'utf8'), 'unsaved edits');
  assert.equal(git(local, 'stash', 'list'), '');
});

test('sync refuses the wrong repository and non-main branches', t => {
  const { local, run } = fixture(t);
  git(local, 'switch', '-c', 'unfinished-work');
  assert.match(run().stderr, /not main/);
  git(local, 'switch', 'main');
  git(local, 'remote', 'set-url', 'origin', 'https://github.com/example/another-repo.git');
  assert.match(run().stderr, /Origin must/);
});
