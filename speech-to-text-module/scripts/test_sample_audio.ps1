$ErrorActionPreference = "Stop"

$moduleRoot = Split-Path -Parent $PSScriptRoot
Set-Location $moduleRoot

if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
    Copy-Item ".env.example" ".env"
}

$inputsDir = Join-Path $moduleRoot "inputs"
New-Item -ItemType Directory -Force -Path $inputsDir | Out-Null

$samplePath = Join-Path $inputsDir "sample.wav"
$sampleUrl = "https://github.com/Azure-Samples/cognitive-services-speech-sdk/raw/master/sampledata/audiofiles/katiesteve.wav"

Invoke-WebRequest -Uri $sampleUrl -OutFile $samplePath
python .\scripts\transcribe_media.py $samplePath

