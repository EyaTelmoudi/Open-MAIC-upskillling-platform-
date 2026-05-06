#!/bin/sh
set -eu

VOICE="${PIPER_VOICE:-en_US-lessac-medium}"
DATA_DIR="${PIPER_DATA_DIR:-/voices}"
HOST="${PIPER_HOST:-0.0.0.0}"
PORT="${PIPER_PORT:-5000}"

mkdir -p "$DATA_DIR"

if [ ! -f "$DATA_DIR/$VOICE.onnx" ] || [ ! -f "$DATA_DIR/$VOICE.onnx.json" ]; then
  python3 -m piper.download_voices --data-dir "$DATA_DIR" "$VOICE"
fi

exec python3 -m piper.http_server \
  --data-dir "$DATA_DIR" \
  --host "$HOST" \
  --port "$PORT" \
  -m "$VOICE"
