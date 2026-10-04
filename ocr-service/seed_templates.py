#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

from PIL import Image

from ornate_names import (
    SEED_LABELS,
    recognize_ornate_image,
    save_templates,
    split_glyphs,
    split_rows,
)

FULL = Path("/workspace/tmp/user-stylized-names.png")


def main() -> None:
    img = Image.open(FULL).convert("RGB")
    rows = split_rows(img)
    labels = list(SEED_LABELS.values())
    print("rows", len(rows), "labels", len(labels))
    if len(rows) != len(labels):
        raise SystemExit("row count mismatch")
    pairs = []
    for row, chars in zip(rows, labels):
        glyphs = split_glyphs(row, expected=len(chars))
        print("".join(chars), "glyphs", len(glyphs), [g.size for g in glyphs])
        if len(glyphs) != len(chars):
            raise SystemExit("glyph count mismatch")
        pairs.extend(zip(chars, glyphs))
    save_templates(pairs)
    print("recognized", recognize_ornate_image(img))


if __name__ == "__main__":
    main()
