#!/usr/bin/env python3
"""Build glyph templates from labeled sample crops."""
from __future__ import annotations

from PIL import Image

from ornate_names import (
    SAMPLE_DIR,
    SEED_LABELS,
    collect_seed_pairs,
    recognize_ornate_image,
    save_templates,
)


def main() -> None:
    pairs = collect_seed_pairs()
    print("pairs", len(pairs), "samples", list(SEED_LABELS))
    save_templates(pairs)
    for filename in SEED_LABELS:
        img = Image.open(SAMPLE_DIR / filename).convert("RGB")
        found = recognize_ornate_image(img)
        print("recognized", [(name, [hex(ord(c)) for c in name], score) for name, score in found])


if __name__ == "__main__":
    main()
