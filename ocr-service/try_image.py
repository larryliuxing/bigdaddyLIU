#!/usr/bin/env python3
"""One-shot PaddleOCR check for a screenshot path."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from server import prepare_variants, run_one, merge_rows, get_ocr  # noqa: E402


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: try_image.py <image>", file=sys.stderr)
        sys.exit(2)
    path = Path(sys.argv[1])
    img = Image.open(path).convert("RGB")
    get_ocr()
    rows = []
    for variant in prepare_variants(img):
        rows.extend(run_one(variant))
    lines = merge_rows(rows)
    print(json.dumps({"ok": True, "lines": lines, "text": "\n".join(lines)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
