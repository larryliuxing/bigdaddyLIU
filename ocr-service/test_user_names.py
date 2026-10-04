#!/usr/bin/env python3
"""Lock user-confirmed ornate names against their labeled samples."""
from __future__ import annotations

import base64

from PIL import Image

from ornate_names import (
    NAME_1,
    NAME_2,
    NAME_3,
    SAMPLE_DIR,
    SEED_LABELS,
    load_templates,
    match_glyphs,
    recognize_ornate_image,
    split_glyphs,
    split_rows,
)
from server import recognize_images


def _hex(s: str) -> list[str]:
    return [hex(ord(c)) for c in s]


def _check_sample(filename: str, expected: str) -> None:
    if list(expected) != SEED_LABELS[filename]:
        raise SystemExit(f"{filename}: SEED_LABELS mismatch")
    path = SAMPLE_DIR / filename
    if not path.is_file():
        raise SystemExit(f"missing {path}")
    img = Image.open(path).convert("RGB")
    rows = split_rows(img) or [img]
    glyphs = split_glyphs(rows[0], expected=6)
    print(filename, "split", len(glyphs), [g.size for g in glyphs])
    if len(glyphs) != 6:
        raise SystemExit(f"{filename}: expected 6 glyphs, got {len(glyphs)}")

    templates = load_templates()
    if not templates:
        raise SystemExit("no font templates")
    name, score = match_glyphs(glyphs, templates)
    print(filename, "match", name, _hex(name), f"{score:.4f}")
    if name != expected:
        raise SystemExit(
            f"{filename}: glyph match {name} {_hex(name)} != {expected} {_hex(expected)}"
        )

    found = recognize_ornate_image(img)
    names = [item[0] for item in found]
    print(filename, "found", [(item[0], _hex(item[0]), item[1]) for item in found])
    if names != [expected]:
        raise SystemExit(f"{filename}: recognize {names} != {[expected]}")

    payload = "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")
    result = recognize_images([payload])
    print(
        filename,
        "service",
        result.get("engine"),
        result.get("lines"),
        [_hex(x) for x in result.get("lines") or []],
    )
    if result.get("lines") != [expected]:
        raise SystemExit(f"{filename}: service lines {result.get('lines')} != {[expected]}")


def main() -> None:
    expected = {
        "name-luolong-1.png": "\u9468\u9f93\u5dc4\u9f93\u5dc3\u9468",
        "name-2.png": "\u9468\u8c45\u8d1a\u9468\u8d1a\u5dc4",
        "name-3.png": "\u9468\u9468\u7216\u9f93\u9468\u9468",
    }
    if NAME_1 != expected["name-luolong-1.png"]:
        raise SystemExit(f"NAME_1 codepoints wrong: {_hex(NAME_1)}")
    if NAME_2 != expected["name-2.png"]:
        raise SystemExit(f"NAME_2 codepoints wrong: {_hex(NAME_2)}")
    if NAME_3 != expected["name-3.png"]:
        raise SystemExit(f"NAME_3 codepoints wrong: {_hex(NAME_3)}")
    if set(SEED_LABELS) != set(expected):
        raise SystemExit("SEED_LABELS keys mismatch")

    for filename, name in expected.items():
        _check_sample(filename, name)
        print("OK", filename, name, _hex(name))


if __name__ == "__main__":
    main()
