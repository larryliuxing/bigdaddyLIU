#!/usr/bin/env python3
"""Lock user-confirmed ornate names against their labeled samples."""
from __future__ import annotations

import base64

from PIL import Image

from ornate_names import (
    NAME_1,
    NAME_2,
    NAME_3,
    NAME_4,
    NAME_5,
    NAME_6,
    NAME_7,
    NAME_8,
    SAMPLE_DIR,
    SEED_LABELS,
    collect_seed_pairs,
    load_templates,
    match_glyphs,
    recognize_ornate_image,
    split_glyphs,
    split_rows,
    templates_from_pairs,
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
    name, score, _parts = match_glyphs(glyphs, templates)
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
        "name-4.png": "\u9468\u8d1a\u8d1a\u8c45\u7216\u5dc3",
        "name-4b.png": "\u9468\u8d1a\u8d1a\u8c45\u7216\u5dc3",
        "name-4c.png": "\u9468\u8d1a\u8d1a\u8c45\u7216\u5dc3",
        "name-5.png": "\u9468\u9468\u9f93\u9468\u9468\u9468",
        "name-6.png": "\u9468\u7216\u5dc4\u5dc3\u7932\u8c45",
        "name-7.png": "\u9468\u9f93\u5fbf\u8d1a\u8d1a\u9468",
        "name-7b.png": "\u9468\u9f93\u5fbf\u8d1a\u8d1a\u9468",
        "name-8.png": "\u5131\u5131\u5131\u6f0b\u6f0b\u6f0b",
        "name-8b.png": "\u5131\u5131\u5131\u6f0b\u6f0b\u6f0b",
    }
    if NAME_1 != expected["name-luolong-1.png"]:
        raise SystemExit(f"NAME_1 codepoints wrong: {_hex(NAME_1)}")
    if NAME_2 != expected["name-2.png"]:
        raise SystemExit(f"NAME_2 codepoints wrong: {_hex(NAME_2)}")
    if NAME_3 != expected["name-3.png"]:
        raise SystemExit(f"NAME_3 codepoints wrong: {_hex(NAME_3)}")
    if NAME_4 != expected["name-4.png"]:
        raise SystemExit(f"NAME_4 codepoints wrong: {_hex(NAME_4)}")
    if NAME_5 != expected["name-5.png"]:
        raise SystemExit(f"NAME_5 codepoints wrong: {_hex(NAME_5)}")
    if NAME_6 != expected["name-6.png"]:
        raise SystemExit(f"NAME_6 codepoints wrong: {_hex(NAME_6)}")
    if NAME_7 != expected["name-7.png"]:
        raise SystemExit(f"NAME_7 codepoints wrong: {_hex(NAME_7)}")
    if NAME_8 != expected["name-8.png"]:
        raise SystemExit(f"NAME_8 codepoints wrong: {_hex(NAME_8)}")
    if set(SEED_LABELS) != set(expected):
        raise SystemExit("SEED_LABELS keys mismatch")

    for filename, name in expected.items():
        _check_sample(filename, name)
        print("OK", filename, name, _hex(name))

    # New arrangements of already-seen glyphs must not need their own sample.
    for holdout in ("name-4.png", "name-5.png"):
        want = expected[holdout]
        templates = templates_from_pairs(collect_seed_pairs(exclude={holdout}))
        img = Image.open(SAMPLE_DIR / holdout).convert("RGB")
        found = recognize_ornate_image(img, templates=templates)
        got = found[0][0] if found else ""
        print("holdout", holdout, "want", _hex(want), "got", _hex(got), found[0][1] if found else 0)
        if got != want:
            raise SystemExit(f"leave-one-out {holdout}: {got} {_hex(got)} != {want} {_hex(want)}")
        print("OK holdout", holdout)


if __name__ == "__main__":
    main()
