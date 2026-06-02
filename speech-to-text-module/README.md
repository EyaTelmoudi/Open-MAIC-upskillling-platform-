# Speech-to-Text Module

This module runs a dedicated `faster-whisper-server` service for:

- course video transcription
- learner voice transcription
- future integration with the learning platform

## Structure

- `docker-compose.yml`: CPU and GPU service definitions
- `scripts/start_cpu.ps1`: starts the CPU service
- `scripts/start_gpu.ps1`: starts the CUDA service
- `scripts/transcribe_media.py`: sends a local media file to the STT API
- `scripts/test_sample_audio.ps1`: downloads a sample WAV and validates the pipeline
- `inputs/`: put videos or audio files here
- `outputs/`: generated transcripts
- `hf-cache/`: Hugging Face cache mounted into the container

## Recommended mode on this machine

Start with the GPU service. If Docker GPU access fails, use the CPU service.

## Quick start

1. Copy `.env.example` to `.env` if you want to customize the port or model.
2. Start the service:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_gpu.ps1
```

Fallback:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_cpu.ps1
```

3. Put a media file in `inputs/`, then transcribe it:

```powershell
python .\scripts\transcribe_media.py .\inputs\my-course-video.mp4
```

The script writes:

- `outputs\<name>.txt`
- `outputs\<name>.json`

## Notes

- The first request can be slow because the model may download on first use.
- If direct video upload ever fails with a specific format, we can add a preprocessing step later.

