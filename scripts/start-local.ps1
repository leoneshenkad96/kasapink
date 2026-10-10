[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$localRoot = [IO.Path]::GetFullPath((Join-Path $root ".local"))
$dataDir = Join-Path $localRoot "postgres-data"
$logsDir = Join-Path $localRoot "logs"
$configPath = Join-Path $localRoot "local-dev-config.json"
$statePath = Join-Path $localRoot "local-dev-state.json"
$pgBin = if ($env:PG_BIN) { $env:PG_BIN } else { "C:\Program Files\PostgreSQL\17\bin" }
$initdb = Join-Path $pgBin "initdb.exe"
$pgCtl = Join-Path $pgBin "pg_ctl.exe"

function Assert-ChildPath([string]$candidate) {
  $full = [IO.Path]::GetFullPath($candidate)
  if (-not $full.StartsWith($localRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe local path: $full"
  }
}

function New-RandomSecret([int]$bytes = 36) {
  $buffer = New-Object byte[] $bytes
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
  return [Convert]::ToBase64String($buffer).Replace("+", "A").Replace("/", "B").TrimEnd("=")
}

function Test-Port([int]$port) {
  $client = New-Object Net.Sockets.TcpClient
  try {
    $task = $client.ConnectAsync("127.0.0.1", $port)
    return $task.Wait(250) -and $client.Connected
  } catch { return $false } finally { $client.Dispose() }
}

function Wait-Http([string]$url, [int]$seconds = 45) {
  $deadline = (Get-Date).AddSeconds($seconds)
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3
      if ([int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 500) { return }
    } catch {}
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  throw "Timed out waiting for $url"
}

foreach ($path in @($dataDir, $logsDir, $configPath, $statePath)) { Assert-ChildPath $path }
if (-not (Test-Path -LiteralPath $initdb) -or -not (Test-Path -LiteralPath $pgCtl)) {
  throw "PostgreSQL tools not found in $pgBin. Set PG_BIN to the installed bin directory."
}
New-Item -ItemType Directory -Force -Path $localRoot, $logsDir | Out-Null

if (Test-Path -LiteralPath $configPath) {
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
} else {
  $config = [ordered]@{
    postgresPort = 55432
    backendPort = 5000
    frontendPort = 5173
    jwtSecret = New-RandomSecret 48
    adminUsername = "admin-local"
    adminPassword = "Kasapink-Local-2026!"
  }
  $config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
}

if (-not (Test-Path -LiteralPath (Join-Path $dataDir "PG_VERSION"))) {
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
  & $initdb -D $dataDir -U kasapink_local --auth=trust --no-locale --encoding=UTF8
  if ($LASTEXITCODE -ne 0) { throw "initdb failed with exit code $LASTEXITCODE" }
}

& $pgCtl -D $dataDir status *> $null
if ($LASTEXITCODE -ne 0) {
  if (Test-Port ([int]$config.postgresPort)) {
    throw "Port $($config.postgresPort) is already occupied by another process."
  }
  & $pgCtl -D $dataDir -l (Join-Path $logsDir "postgres.log") -w `
    -o "-h 127.0.0.1 -p $($config.postgresPort) -F" start
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL failed to start." }
}

$databaseUrl = "postgresql://kasapink_local@127.0.0.1:$($config.postgresPort)/postgres"
$savedEnv = @{
  DATABASE_URL = $env:DATABASE_URL
  JWT_SECRET = $env:JWT_SECRET
  NODE_ENV = $env:NODE_ENV
  PORT = $env:PORT
  LOCAL_ADMIN_USERNAME = $env:LOCAL_ADMIN_USERNAME
  LOCAL_ADMIN_PASSWORD = $env:LOCAL_ADMIN_PASSWORD
}
try {
  $env:DATABASE_URL = $databaseUrl
  & pnpm.cmd --filter "@workspace/db" push-force
  if ($LASTEXITCODE -ne 0) { throw "Local schema creation failed." }
  $env:LOCAL_ADMIN_USERNAME = $config.adminUsername
  $env:LOCAL_ADMIN_PASSWORD = $config.adminPassword
  & node.exe (Join-Path $root "scripts/create-local-admin.mjs")
  if ($LASTEXITCODE -ne 0) { throw "Local admin setup failed." }
  & node.exe (Join-Path $root "scripts/seed-local-demo.mjs")
  if ($LASTEXITCODE -ne 0) { throw "Local demo seed failed." }
  & pnpm.cmd --filter "@workspace/api-server" build
  if ($LASTEXITCODE -ne 0) { throw "Backend build failed." }

  if (Test-Port ([int]$config.backendPort)) { throw "Backend port $($config.backendPort) is already in use." }
  $env:JWT_SECRET = $config.jwtSecret
  $env:NODE_ENV = "development"
  $env:PORT = [string]$config.backendPort
  $api = Start-Process -FilePath "node.exe" `
    -ArgumentList @("--enable-source-maps", ('"' + (Join-Path $root "artifacts/api-server/dist/index.mjs") + '"')) `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logsDir "api.out.log") `
    -RedirectStandardError (Join-Path $logsDir "api.err.log")
  Wait-Http "http://127.0.0.1:$($config.backendPort)/api/healthz"

  if (Test-Port ([int]$config.frontendPort)) { throw "Frontend port $($config.frontendPort) is already in use." }
  $env:PORT = [string]$config.frontendPort
  $env:API_PROXY_TARGET = "http://127.0.0.1:$($config.backendPort)"
  $vite = Start-Process -FilePath "node.exe" `
    -ArgumentList @(
      ('"' + (Join-Path $root "artifacts/erp-rumahan-emak/node_modules/vite/bin/vite.js") + '"'),
      "--config",
      ('"' + (Join-Path $root "artifacts/erp-rumahan-emak/vite.config.ts") + '"'),
      "--host",
      "127.0.0.1"
    ) `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logsDir "web.out.log") `
    -RedirectStandardError (Join-Path $logsDir "web.err.log")
  Wait-Http "http://127.0.0.1:$($config.frontendPort)/"

  [ordered]@{
    apiPid = $api.Id
    apiStartedAt = $api.StartTime.ToUniversalTime().ToString("o")
    webPid = $vite.Id
    webStartedAt = $vite.StartTime.ToUniversalTime().ToString("o")
    startedAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
} catch {
  if ($api -and -not $api.HasExited) { Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue }
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force -ErrorAction SilentlyContinue }
  throw
} finally {
  foreach ($key in $savedEnv.Keys) {
    if ($null -eq $savedEnv[$key]) { Remove-Item "Env:$key" -ErrorAction SilentlyContinue }
    else { Set-Item "Env:$key" $savedEnv[$key] }
  }
}

Write-Host ""
Write-Host "Kasapink ERP lokal siap:" -ForegroundColor Green
Write-Host "  URL      : http://localhost:$($config.frontendPort)"
Write-Host "  Username : $($config.adminUsername)"
Write-Host "  Password : $($config.adminPassword)"
Write-Host "  Stop     : pnpm local:stop"
Write-Host "  Logs     : $logsDir"

# Keep the launcher alive so managed terminals do not tear down its child
# processes. `pnpm local:stop` stops both servers and lets this command exit.
Wait-Process -Id @($api.Id, $vite.Id)
