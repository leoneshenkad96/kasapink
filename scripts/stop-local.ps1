[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$localRoot = [IO.Path]::GetFullPath((Join-Path $root ".local"))
$dataDir = [IO.Path]::GetFullPath((Join-Path $localRoot "postgres-data"))
$statePath = [IO.Path]::GetFullPath((Join-Path $localRoot "local-dev-state.json"))
$pgBin = if ($env:PG_BIN) { $env:PG_BIN } else { "C:\Program Files\PostgreSQL\17\bin" }
$pgCtl = Join-Path $pgBin "pg_ctl.exe"

if (-not $dataDir.StartsWith($localRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Unsafe PostgreSQL path: $dataDir"
}

if (Test-Path -LiteralPath $statePath) {
  $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  foreach ($entry in @(
    @{ Id = [int]$state.webPid; StartedAt = [datetime]$state.webStartedAt; Label = "frontend" },
    @{ Id = [int]$state.apiPid; StartedAt = [datetime]$state.apiStartedAt; Label = "backend" }
  )) {
    $process = Get-Process -Id $entry.Id -ErrorAction SilentlyContinue
    if ($process) {
      $delta = [Math]::Abs(($process.StartTime.ToUniversalTime() - $entry.StartedAt.ToUniversalTime()).TotalSeconds)
      if ($delta -lt 2) {
        Stop-Process -Id $process.Id -Force
        Write-Host "Stopped $($entry.Label)."
      } else {
        Write-Warning "Skipped PID $($entry.Id): its start time no longer matches local state."
      }
    }
  }
  Remove-Item -LiteralPath $statePath
}

if ((Test-Path -LiteralPath $pgCtl) -and (Test-Path -LiteralPath (Join-Path $dataDir "PG_VERSION"))) {
  & $pgCtl -D $dataDir status *> $null
  if ($LASTEXITCODE -eq 0) {
    & $pgCtl -D $dataDir -m fast -w stop
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL failed to stop." }
    Write-Host "Stopped local PostgreSQL."
  }
}

Write-Host "Local data remains in $localRoot for the next start."
