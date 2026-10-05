#!/usr/bin/env python3
"""Leftover ordinary rows: latin names count, and Paddle is tried once."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from server import _looks_like_name, leftover_paddle_attempts, crop_name_ink


def main() -> None:
    if not _looks_like_name("天刀"):
        raise SystemExit("天刀 should look like a name")
    if not _looks_like_name("job"):
        raise SystemExit("job should look like a name")
    if not _looks_like_name("bob1"):
        raise SystemExit("bob1 should look like a name")
    if _looks_like_name("A"):
        raise SystemExit("single letter should not look like a name")

    dark = Image.new("RGB", (200, 24), (11, 15, 19))
    for x in range(8, 60):
        for y in range(4, 20):
            dark.putpixel((x, y), (130, 134, 138))
    attempts = leftover_paddle_attempts(dark)
    if len(attempts) != 1:
        raise SystemExit(f"leftover should be one invert attempt, got {len(attempts)}")
    cropped = crop_name_ink(dark)
    if cropped.width >= dark.width:
        raise SystemExit(f"expected ink crop to trim padding, got {cropped.size}")
    print("OK leftover latin/timeout guards")


if __name__ == "__main__":
    main()
