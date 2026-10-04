#!/usr/bin/env python3
"""Mixed roster screenshots keep ornate lines and ordinary Paddle names."""
from __future__ import annotations

import base64
from pathlib import Path

from PIL import Image

from ornate_names import NAME_1, NAME_7, SAMPLE_DIR
from server import recognize_images

LIST3 = SAMPLE_DIR / "name-list-mixed.png"


def _payload(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    if not LIST3.is_file():
        raise SystemExit(f"missing {LIST3}")
    result = recognize_images([_payload(LIST3)])
    lines = result.get("lines") or []
    print("engine", result.get("engine"), "lines", lines)
    for want in (NAME_1, NAME_7, "\u6ca7\u7b19\u8e0f\u6b4c"):
        if want not in lines:
            raise SystemExit(f"missing {want!r} in {lines}")
    print("OK mixed list", len(lines), "lines")

    # Single ornate crop still returns only that name.
    sample = Path(__file__).resolve().parent / "samples" / "name-luolong-1.png"
    one = recognize_images([_payload(sample)])
    if one.get("lines") != [NAME_1]:
        raise SystemExit(f"single crop {one.get('lines')} != {[NAME_1]}")
    print("OK single ornate crop")


if __name__ == "__main__":
    main()
