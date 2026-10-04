#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

from PIL import Image

from ornate_names import SEED_LABELS, recognize_ornate_image

EXPECTED = ["".join(chars) for chars in SEED_LABELS.values()]


def main() -> None:
    path = Path("/workspace/tmp/user-stylized-names.png")
    img = Image.open(path).convert("RGB")
    found = [name for name, _score in recognize_ornate_image(img)]
    print("expected", EXPECTED)
    print("found   ", found)
    if found != EXPECTED:
        raise SystemExit("name mismatch")
    print("OK")


if __name__ == "__main__":
    main()
