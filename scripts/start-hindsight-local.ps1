$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$hindsightRoot = Join-Path $root "hindsight\hindsight"
$envFile = Join-Path $hindsightRoot ".env"
$logFile = Join-Path $root "hindsight_api_current.log"
$exe = Join-Path $hindsightRoot ".venv\Scripts\hindsight-api.exe"

if (-not (Test-Path -LiteralPath $envFile)) {
  throw "Missing Hindsight env file: $envFile"
}

if (-not (Test-Path -LiteralPath $exe)) {
  throw "Missing Hindsight executable: $exe"
}

$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Get-Content -LiteralPath $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
    return
  }

  $name, $value = $line -split "=", 2
  [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
}

Set-Location -LiteralPath $hindsightRoot
$ErrorActionPreference = "Continue"
& $exe *>&1 | Tee-Object -FilePath $logFile
