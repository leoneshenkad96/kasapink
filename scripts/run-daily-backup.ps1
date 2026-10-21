[CmdletBinding()]
param([string]$ConfigPath = (Join-Path $PSScriptRoot '../.local/backup/config.clixml'))
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'This runner requires Windows DPAPI.' }
$config = Import-Clixml -LiteralPath $ConfigPath
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
function Get-SecretText([Security.SecureString]$secret) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
$values = @{
  DATABASE_URL = Get-SecretText $config.DatabaseUrl
  ERP_BACKUP_KEY = Get-SecretText $config.BackupKey
  ERP_RESTORE_ADMIN_URL = Get-SecretText $config.RestoreAdminUrl
  ERP_BACKUP_DIR = $config.BackupDir
  ERP_BACKUP_OFFSITE_DIR = $config.OffsiteDir
  PG_BIN = $config.PgBin
  ERP_BACKUP_FILE = $null
}
$saved = @{}
Push-Location $root
try {
  foreach ($name in $values.Keys) {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process')
  }
  & $config.NodeBin scripts/check-node-security.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Node.js security baseline failed.' }
  foreach ($script in @('backup-erp.mjs', 'check-backup.mjs', 'restore-check.mjs')) {
    & $config.NodeBin (Join-Path $root "scripts/$script")
    if ($LASTEXITCODE -ne 0) { throw "Daily recovery verification failed at $script. Previous backups are retained." }
  }
  @{ verifiedAt = (Get-Date).ToUniversalTime().ToString('o'); backup = 'passed'; restore = 'passed' } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path (Split-Path -Parent $ConfigPath) 'last-success.json') -Encoding UTF8
} finally {
  foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
  $values.Clear()
  Pop-Location
}
