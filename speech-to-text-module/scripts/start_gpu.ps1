$ErrorActionPreference = "Stop"

$moduleRoot = Split-Path -Parent $PSScriptRoot
Set-Location $moduleRoot

if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
    Copy-Item ".env.example" ".env"
}

docker compose --profile gpu up -d stt-gpu
Write-Host "GPU STT service started on $((Get-Content .env | Select-String '^STT_BASE_URL=' | ForEach-Object { $_.ToString().Split('=')[1] }) -join '')"

