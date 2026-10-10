[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$TaskName = "Kasapink ERP Daily Backup",
  [string]$At = "02:00"
)

$ErrorActionPreference = "Stop"
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$packageManager = (Get-Command pnpm.cmd -ErrorAction Stop).Source
$arguments = "--dir `"$root`" backup:erp"
$action = New-ScheduledTaskAction -Execute $packageManager -Argument $arguments -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At ([DateTime]::Parse($At))
if ($PSCmdlet.ShouldProcess($TaskName, "Register daily ERP backup at $At")) {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Description "Daily local Kasapink ERP PostgreSQL backup" -Force | Out-Null
  Write-Host "Scheduled daily backup: $TaskName at $At"
}
