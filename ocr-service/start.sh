#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/ocr-service/.venv/bin/python"

if [[ ! -x "$PY" ]]; then
  echo "[guild-ocr] missing $PY" >&2
  echo "[guild-ocr] run: python3 -m venv ocr-service/.venv && ocr-service/.venv/bin/pip install -r requirements-ocr.txt" >&2
  exit 1
fi

if ! "$PY" -c "from PIL import Image" >/dev/null 2>&1; then
  echo "[guild-ocr] $PY has no Pillow" >&2
  echo "[guild-ocr] run: $PY -m pip install -r $ROOT/requirements-ocr.txt" >&2
  exit 1
fi

exec "$PY" "$ROOT/ocr-service/server.py"
