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

# One BLAS thread, and it must sleep when idle. Name accuracy is unchanged.
export OMP_NUM_THREADS=1
export MKL_NUM_THREADS=1
export OPENBLAS_NUM_THREADS=1
export NUMEXPR_NUM_THREADS=1
export VECLIB_MAXIMUM_THREADS=1
export OMP_WAIT_POLICY=PASSIVE
export KMP_BLOCKTIME=0
export MKL_DYNAMIC=FALSE
export FLAGS_use_mkldnn=0
export FLAGS_enable_mkldnn=0
export FLAGS_allocator_strategy=auto_growth
export FLAGS_eager_delete_tensor_gb=0

exec "$PY" "$ROOT/ocr-service/server.py"
