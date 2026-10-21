[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory = $true)][string]$OffsiteDir,
  [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin',
  [string]$TaskName = 'Kasapink ERP Daily Backup',
  [string]$At = '02:00'
)
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Windows DPAPI is required.' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$state = Join-Path $root '.local/backup'
$node = (Get-Command node.exe -ErrorAction Stop).Source
foreach ($bin in @('pg_dump.exe', 'pg_restore.exe', 'psql.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PgBin $bin))) { throw "PostgreSQL client is missing: $bin" }
}
& $node (Join-Path $PSScriptRoot 'check-node-security.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Update to patched Node.js 24 before installing backup.' }
if (-not $PSCmdlet.ShouldProcess($TaskName, 'Save Windows-protected secrets, run an initial backup/restore check, then schedule daily')) { return }
New-Item -ItemType Directory -Force -Path $state | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetOwner($identity.User)
$acl.SetAccessRuleProtection($true, $false)
$inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
foreach ($sid in @($identity.User, (New-Object Security.Principal.SecurityIdentifier 'S-1-5-18'))) {
  $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', $inherit, 'None', 'Allow')
  $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $state -AclObject $acl
Write-Host 'Secrets are entered here on your PC. Keep a separate recovery key in your password manager.'
$config = [pscustomobject]@{
  DatabaseUrl = Read-Host 'Source PostgreSQL URI (backup reads only)' -AsSecureString
  BackupKey = Read-Host 'Recovery key: 64 hex characters, already saved separately' -AsSecureString
  RestoreAdminUrl = Read-Host 'LOCAL PostgreSQL admin URI with CREATEDB permission' -AsSecureString
  BackupDir = Join-Path $state 'archives'
  OffsiteDir = [IO.Path]::GetFullPath($OffsiteDir)
  PgBin = [IO.Path]::GetFullPath($PgBin)
  NodeBin = $node
}
$configPath = Join-Path $state 'config.clixml'
$config | Export-Clixml -LiteralPath $configPath
# Do not register a task which has never successfully backed up and restored.
& (Join-Path $PSScriptRoot 'run-daily-backup.ps1') -ConfigPath $configPath
if (-not (Test-Path -LiteralPath (Join-Path $state 'last-success.json'))) { throw 'Initial recovery verification did not complete.' }
$runner = Join-Path $PSScriptRoot 'run-daily-backup.ps1'
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runner`" -ConfigPath `"$configPath`""
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments -WorkingDirectory $root
$triggers = @((New-ScheduledTaskTrigger -Daily -At ([DateTime]::Parse($At))), (New-ScheduledTaskTrigger -AtLogOn -User $identity.Name))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$principal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Encrypted ERP backup, verified second copy and disposable local restore check; requires this Windows user to be logged in' -Force | Out-Null
Write-Host "PASS: initial encrypted backup and full restore passed; scheduled daily at $At and at user logon. PC must be on and this user logged in." -ForegroundColor Green
