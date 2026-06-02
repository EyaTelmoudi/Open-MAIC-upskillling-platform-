param(
    [Parameter(Mandatory = $true)]
    [string]$VideoPath
)

$ErrorActionPreference = "Stop"

$moduleRoot = Split-Path -Parent $PSScriptRoot
Set-Location $moduleRoot

if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
    Copy-Item ".env.example" ".env"
}

Write-Host "Starting live STT test..."
Write-Host "Video: $VideoPath"
Write-Host "Watching container logs while the transcription request is running."
Write-Host ""

$logJob = Start-Job -ScriptBlock {
    docker logs -f openmaic-stt-gpu --tail 30
}

try {
    python .\scripts\transcribe_media.py $VideoPath --base-url http://127.0.0.1:8011
}
finally {
    Start-Sleep -Seconds 2
    Stop-Job $logJob -ErrorAction SilentlyContinue | Out-Null
    Receive-Job $logJob -Keep -ErrorAction SilentlyContinue
    Remove-Job $logJob -Force -ErrorAction SilentlyContinue
}
