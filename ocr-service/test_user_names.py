#!/usr/bin/env python3
"""Lock the user-confirmed ornate name against its labeled sample."""
from __future__ import annotations

import base64

import numpy as np
from PIL import Image

from ornate_names import (
    NAME_LUOLONG,
    SAMPLE_DIR,
    SEED_LABELS,
    _normalize,
    load_templates,
    match_glyphs,
    recognize_ornate_image,
    split_glyphs,
    split_rows,
)


def _hex(s: str) -> list[str]:
    return [hex(ord(c)) for c in s]


def main() -> None:
    expected = NAME_LUOLONG
    if expected != "\u9468\u9f93\u5dc4\u9f93\u5dc3\u9468":
        raise SystemExit(f"NAME_LUOLONG codepoints wrong: {_hex(expected)}")
    if list(expected) != SEED_LABELS["name-luolong-1.png"]:
        raise SystemExit("SEED_LABELS mismatch")

    path = SAMPLE_DIR / "name-luolong-1.png"
    if not path.is_file():
        raise SystemExit(f"missing {path}")
    img = Image.open(path).convert("RGB")
    rows = split_rows(img) or [img]
    glyphs = split_glyphs(rows[0], expected=6)
    print("split", len(glyphs), [g.size for g in glyphs])
    if len(glyphs) != 6:
        raise SystemExit(f"expected 6 glyphs, got {len(glyphs)}")

    templates = load_templates()
    if not templates:
        raise SystemExit("no font templates")
    name, score = match_glyphs(glyphs, templates)
    print("match", name, _hex(name), f"{score:.4f}")
    if name != expected:
        raise SystemExit(f"glyph match {name} {_hex(name)} != {expected} {_hex(expected)}")

    # 3rd vs 5th must not swap: U+5DC4 at index 2, U+5DC3 at index 4.
    third_ch = "\u5dc4"
    fifth_ch = "\u5dc3"
    if name[2] != third_ch or name[4] != fifth_ch:
        raise SystemExit(f"3rd/5th swapped: got {_hex(name[2])}/{_hex(name[4])}")

    found = recognize_ornate_image(img)
    names = [item[0] for item in found]
    print("found", [(item[0], _hex(item[0]), item[1]) for item in found])
    if names != [expected]:
        raise SystemExit(f"recognize {names} != {[expected]}")

    third_vec = _normalize(glyphs[2]).ravel()
    fifth_vec = _normalize(glyphs[4]).ravel()
    t_third = templates[third_ch][0].ravel()
    t_fifth = templates[fifth_ch][0].ravel()
    s33 = float(np.dot(third_vec, t_third))
    s35 = float(np.dot(third_vec, t_fifth))
    s55 = float(np.dot(fifth_vec, t_fifth))
    s53 = float(np.dot(fifth_vec, t_third))
    print(f"third self/cross {s33:.3f}/{s35:.3f} fifth self/cross {s55:.3f}/{s53:.3f}")
    if s33 <= s35 or s55 <= s53:
        raise SystemExit("3rd/5th templates are not distinct")

    from server import recognize_images

    payload = "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")
    result = recognize_images([payload])
    print(
        "service",
        result.get("engine"),
        result.get("lines"),
        [_hex(x) for x in result.get("lines") or []],
    )
    if result.get("lines") != [expected]:
        raise SystemExit(f"service lines {result.get('lines')} != {[expected]}")
    print("OK", expected, _hex(expected))


if __name__ == "__main__":
    main()
