import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const status = (...args) => spawnSync('git', args, { cwd: root, windowsHide: true, stdio: 'ignore' }).status;
const repositoryRoot = git('rev-parse', '--show-toplevel');
if (path.resolve(repositoryRoot).toLowerCase() !== root.toLowerCase()) throw new Error('Select the root of the ERP Kasapink repository.');
const origin = git('config', '--get', 'remote.origin.url');
if (!/^(https:\/\/github\.com\/|git@github\.com:)leoneshenkad96\/kasapink(?:\.git)?\/?$/i.test(origin)) throw new Error('Origin must point to leoneshenkad96/kasapink on GitHub.');
if (git('branch', '--show-current') !== 'main') throw new Error('Local branch is not main. Preserve/review that branch before syncing; no files were changed.');
if (git('ls-files', '--unmerged')) throw new Error('Resolve the existing merge conflict before syncing.');
git('fetch', 'origin', 'main');
const before = git('rev-parse', 'HEAD'), latest = git('rev-parse', 'FETCH_HEAD');
if (status('merge-base', '--is-ancestor', before, latest) !== 0) throw new Error('Local commits diverge from GitHub main. No reset or rebase was performed.');
const dirty = git('status', '--porcelain', '--untracked-files=normal');
let savedWork = null;
if (dirty) {
  git('stash', 'push', '--include-untracked', '-m', `Kasapink local work before sync ${new Date().toISOString()}`);
  savedWork = git('rev-parse', 'stash@{0}');
}
try { git('merge', '--ff-only', latest); }
catch {
  throw new Error(`Fast-forward failed. Local work remains preserved${savedWork ? ` in stash ${savedWork}` : ''}. No reset was performed.`);
}
mkdirSync(path.join(root, '.local'), { recursive: true, mode: 0o700 });
writeFileSync(path.join(root, '.local', 'last-sync.json'), JSON.stringify({ syncedAt: new Date().toISOString(), before, after: latest, savedWork }, null, 2) + '\n', { mode: 0o600 });
console.log(`PASS: local source is at GitHub main ${latest.slice(0, 12)}.`);
if (savedWork) console.log(`Local edits are preserved in stash ${savedWork}. Review with git stash show; apply deliberately after reviewing conflicts/security changes.`);
console.log('Ignored .env, .local and database files were retained. No database migrations or production operations were run.');
