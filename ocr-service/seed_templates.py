#!/usr/bin/env python3
"""Build glyph templates from labeled sample crops."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

from ornate_names import (
    SAMPLE_DIR,
    SEED_LABELS,
    recognize_ornate_image,
    save_templates,
    split_glyphs,
    split_rows,
)


def main() -> None:
    pairs: list[tuple[str, Image.Image]] = []
    for filename, chars in SEED_LABELS.items():
        path = SAMPLE_DIR / filename
        if not path.is_file():
            raise SystemExit(f"missing sample {path}")
        img = Image.open(path).convert("RGB")
        rows = split_rows(img) or [img]
        if len(rows) != 1:
            raise SystemExit(f"{filename}: expected 1 row, got {len(rows)}")
        glyphs = split_glyphs(rows[0], expected=len(chars))
        print(
            filename,
            "".join(chars),
            [hex(ord(c)) for c in chars],
            "glyphs",
            len(glyphs),
            [g.size for g in glyphs],
        )
        if len(glyphs) != len(chars):
            raise SystemExit(f"{filename}: glyph count mismatch")
        pairs.extend(zip(chars, glyphs))
    save_templates(pairs)
    for filename in SEED_LABELS:
        img = Image.open(SAMPLE_DIR / filename).convert("RGB")
        found = recognize_ornate_image(img)
        print("recognized", [(name, [hex(ord(c)) for c in name], score) for name, score in found])


if __name__ == "__main__":
    main()
