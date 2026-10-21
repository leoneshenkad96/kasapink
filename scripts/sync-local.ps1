[CmdletBinding()]
param([string]$RepoPath = (Join-Path $PSScriptRoot '..'))
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($RepoPath)
# This file can be downloaded by itself. Read the updater from the verified
# repository's fetched commit, without overwriting the existing worktree.
$origin = & git -C $root config --get remote.origin.url
if ($LASTEXITCODE -ne 0 -or $origin -notmatch '^(https://github\.com/|git@github\.com:)leoneshenkad96/kasapink(\.git)?/?$') { throw 'Select the local leoneshenkad96/kasapink repository.' }
& git -C $root fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'GitHub fetch failed; local files were not changed.' }
$source = & git -C $root show 'FETCH_HEAD:scripts/sync-local.mjs'
if ($LASTEXITCODE -ne 0) { throw 'The fetched main branch does not contain the safe updater yet.' }
$helper = Join-Path ([IO.Path]::GetTempPath()) ('kasapink-sync-' + [Guid]::NewGuid().ToString('N') + '.mjs')
try {
  [IO.File]::WriteAllText($helper, ($source -join "`n"), (New-Object Text.UTF8Encoding $false))
  & node.exe $helper $root
  if ($LASTEXITCODE -ne 0) { throw 'Source synchronization stopped safely. Read the preceding message.' }
} finally { Remove-Item -LiteralPath $helper -Force -ErrorAction SilentlyContinue }
Push-Location $root
try {
  & node.exe scripts/check-node-security.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Install/use patched Node.js 24.22.1 or newer on the 24.x line, then rerun.' }
  & pnpm.cmd install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
  foreach ($check in @('check:migrations', 'typecheck', 'test:auth', 'build')) {
    & pnpm.cmd run $check
    if ($LASTEXITCODE -ne 0) { throw "Verification failed: $check" }
  }
  & node.exe --test scripts/audit-safe.test.mjs scripts/backup-tools.test.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Security regression tests failed.' }
  Write-Host 'Source sync and code checks passed. Existing server processes require a deliberate restart. Database contents have not been synchronized.' -ForegroundColor Green
} finally { Pop-Location }
