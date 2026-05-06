#!/usr/bin/env bash
set -euo pipefail

COMFYUI_HOME="${COMFYUI_HOME:-/opt/ComfyUI}"
MODEL_DIR="${COMFYUI_HOME}/models/checkpoints"
MODEL_NAME="${COMFYUI_MODEL_NAME:-sd-v1-5-tiny.safetensors}"
MODEL_REPO="${COMFYUI_MODEL_REPO:-ehristoforu/stable-diffusion-v1-5-tiny}"
MODEL_FILE="${COMFYUI_MODEL_FILE:-sd-v1-5-tiny.safetensors}"
HOST="${COMFYUI_HOST:-0.0.0.0}"
PORT="${COMFYUI_PORT:-8188}"
ARGS="${COMFYUI_ARGS:---cpu}"

mkdir -p "${MODEL_DIR}" "${COMFYUI_HOME}/input" "${COMFYUI_HOME}/output"

if [ -f "${MODEL_DIR}/${MODEL_NAME}" ] && [ "$(stat -c%s "${MODEL_DIR}/${MODEL_NAME}")" -lt 1073741824 ]; then
  echo "[ComfyUI] Removing incomplete checkpoint ${MODEL_NAME}..."
  rm -f "${MODEL_DIR}/${MODEL_NAME}"
fi

if [ ! -f "${MODEL_DIR}/${MODEL_NAME}" ]; then
  echo "[ComfyUI] Downloading lightweight checkpoint ${MODEL_NAME}..."
  python - <<PY
from huggingface_hub import hf_hub_download

hf_hub_download(
    repo_id="${MODEL_REPO}",
    filename="${MODEL_FILE}",
    local_dir="${MODEL_DIR}",
    local_dir_use_symlinks=False,
)
PY
fi

cd "${COMFYUI_HOME}"
echo "[ComfyUI] Starting with model ${MODEL_NAME} on ${HOST}:${PORT}"
exec python main.py --listen "${HOST}" --port "${PORT}" ${ARGS}
