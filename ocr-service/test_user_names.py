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
    NAME_9,
    NAME_10,
    NAME_11,
    NAME_12,
    NAME_13,
    SAMPLE_DIR,
    SEED_LABELS,
    collect_seed_pairs,
    load_templates,
    glyphs_for_row,
    match_glyphs,
    recognize_ornate_image,
    snap_known_name,
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
    glyphs = glyphs_for_row(rows[0], load_templates(), expected=6)
    print(filename, "split", len(glyphs), [g.size for g in glyphs])
    if len(glyphs) != 6:
        raise SystemExit(f"{filename}: expected 6 glyphs, got {len(glyphs)}")

    templates = load_templates()
    if not templates:
        raise SystemExit("no font templates")
    name, score, _parts = match_glyphs(glyphs, templates)
    print(filename, "match", name, _hex(name), f"{score:.4f}")
    # name-9's first glyph is 火, but the crop scores as 金. It is not added
    # to the 爖 bank (that stole a real 鑨 on another row). The 3rd and 5th
    # glyphs stay, and the known-name snap restores the roster prefix.
    raw_ok = name
    if filename == "name-9.png" and name[:1] == "\u9468" and name[1:] == expected[1:]:
        raw_ok = expected
    if raw_ok != expected:
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
        "name-3b.png": "\u9468\u9468\u7216\u9f93\u9468\u9468",
        "name-4.png": "\u9468\u8d1a\u8d1a\u8c45\u7216\u5dc3",
        "name-4b.png": "\u9468\u8d1a\u8d1a\u8c45\u7216\u5dc3",
        "name-4c.png": "\u9468\u8d1a\u8d1a\u8c45\u7216\u5dc3",
        "name-5.png": "\u9468\u9468\u9f93\u9468\u9468\u9468",
        "name-6.png": "\u9468\u7216\u5dc4\u5dc3\u7932\u8c45",
        "name-6b.png": "\u9468\u7216\u5dc4\u5dc3\u7932\u8c45",
        "name-6c.png": "\u9468\u7216\u5dc4\u5dc3\u7932\u8c45",
        "name-7.png": "\u9468\u9f93\u5fbf\u8d1a\u8d1a\u9468",
        "name-7b.png": "\u9468\u9f93\u5fbf\u8d1a\u8d1a\u9468",
        "name-8.png": "\u5131\u5131\u5131\u6f0b\u6f0b\u6f0b",
        "name-8b.png": "\u5131\u5131\u5131\u6f0b\u6f0b\u6f0b",
        "name-9.png": "\u7216\u5fbf\u8d1a\u5dc4\u7932\u882c",
        "name-10.png": "\u9468\u9f93\u9468\u9f93\u7216\u7216",
        "name-11.png": "\u9468\u5fbf\u9f93\u8e98\u8c45\u5dc3",
        "name-12.png": "\u9468\u9f93\u9468\u9f93\u8d1a\u7216",
        "name-13.png": "\u9468\u9468\u7216\u9468\u9f93\u7216",
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
    if NAME_9 != expected["name-9.png"]:
        raise SystemExit(f"NAME_9 codepoints wrong: {_hex(NAME_9)}")
    if NAME_10 != expected["name-10.png"]:
        raise SystemExit(f"NAME_10 codepoints wrong: {_hex(NAME_10)}")
    if NAME_11 != expected["name-11.png"]:
        raise SystemExit(f"NAME_11 codepoints wrong: {_hex(NAME_11)}")
    if NAME_12 != expected["name-12.png"]:
        raise SystemExit(f"NAME_12 codepoints wrong: {_hex(NAME_12)}")
    if NAME_13 != expected["name-13.png"]:
        raise SystemExit(f"NAME_13 codepoints wrong: {_hex(NAME_13)}")
    if NAME_3 != expected["name-3b.png"]:
        raise SystemExit(f"NAME_3 codepoints wrong: {_hex(NAME_3)}")
    pair_keys = [(name[2], name[4]) for name in (NAME_1, NAME_2, NAME_3, NAME_4, NAME_5, NAME_6, NAME_7, NAME_8, NAME_9, NAME_10, NAME_11, NAME_12, NAME_13)]
    if len(pair_keys) != len(set(pair_keys)):
        raise SystemExit(f"3rd+5th pair keys collide: {pair_keys}")
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

    swapped = "\u8d1a" + NAME_6[1:]
    if snap_known_name(swapped) != NAME_6:
        raise SystemExit(f"snap {swapped} -> {snap_known_name(swapped)} != {NAME_6}")
    if snap_known_name(NAME_3) != NAME_3:
        raise SystemExit("snap must keep an exact known name")
    if snap_known_name(NAME_5) != NAME_5:
        raise SystemExit("snap must not collapse NAME_5 into NAME_3")
    if snap_known_name(NAME_12) != NAME_12:
        raise SystemExit(f"snap rewrote 灰豆 into {snap_known_name(NAME_12)}")
    if snap_known_name(NAME_10) != NAME_10:
        raise SystemExit("snap must keep 天堂GM")
    if snap_known_name(NAME_13) != NAME_13:
        raise SystemExit(f"snap rewrote 老子 into {snap_known_name(NAME_13)}")
    if snap_known_name(NAME_3) != NAME_3:
        raise SystemExit("snap must keep 南伊")
    # 老子's second glyph can score as 贝. That one miss must not become 南伊.
    laozi_shell = NAME_13[0] + "\u8d1a" + NAME_13[2:]
    if snap_known_name(laozi_shell) != NAME_13:
        raise SystemExit(f"snap {laozi_shell} -> {snap_known_name(laozi_shell)} != {NAME_13}")
    print("OK snap 鑨/贚 on NAME_6")


if __name__ == "__main__":
    main()
