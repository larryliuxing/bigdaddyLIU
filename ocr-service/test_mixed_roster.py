#!/usr/bin/env python3
"""Mixed roster screenshots keep ornate lines and ordinary Paddle names."""
from __future__ import annotations

import base64
from pathlib import Path

from PIL import Image

from ornate_names import NAME_1, NAME_2, NAME_3, NAME_4, NAME_5, NAME_7, SAMPLE_DIR
from server import get_ocr, recognize_images, run_one

LIST3 = SAMPLE_DIR / "name-list-mixed.png"


def _payload(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    # Cold Paddle load exceeds leftover timeout and drops 沧笙踏歌.
    get_ocr()
    run_one(Image.new("RGB", (96, 32), (20, 24, 28)))

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

    # User-drawn name-column box at native scale (3x upscale blurs radicals).
    paste = SAMPLE_DIR / "name-list-paste.png"
    img = Image.open(paste).convert("RGB")
    w, h = img.size
    box = (
        int(w * 0.12),
        int(h * 0.1),
        int(w * 0.12) + max(1, int(w * 0.76)),
        int(h * 0.1) + max(1, int(h * 0.86)),
    )
    crop = img.crop(box)
    result = recognize_images([_payload_from_image(crop)])
    lines = result.get("lines") or []
    print("paste crop", crop.size, "lines", lines)
    for want in (NAME_1, NAME_7, "\u6ca7\u7b19\u8e0f\u6b4c"):
        if want not in lines:
            raise SystemExit(f"paste crop missing {want!r} in {lines}")
    print("OK paste crop")

    stuck = SAMPLE_DIR / "name-list-stuck.png"
    if not stuck.is_file():
        raise SystemExit(f"missing {stuck}")
    import time

    started = time.time()
    result = recognize_images([_payload(stuck)])
    elapsed = time.time() - started
    lines = result.get("lines") or []
    print("stuck list", lines, f"{elapsed:.3f}s")
    recomb = "\u9468\u9f93\u9468\u9f93\u8d1a\u7216"
    for want in (NAME_2, recomb):
        if want not in lines:
            raise SystemExit(f"stuck list missing {want!r} in {lines}")
    if elapsed > 2.5:
        raise SystemExit(f"stuck list too slow: {elapsed:.3f}s (paddle hang?)")
    print("OK stuck list")

    name4_list = SAMPLE_DIR / "name-list-name4.png"
    if not name4_list.is_file():
        raise SystemExit(f"missing {name4_list}")
    import time

    started = time.time()
    result = recognize_images([_payload(name4_list)])
    elapsed = time.time() - started
    lines = result.get("lines") or []
    print("name4 list", lines, f"{elapsed:.3f}s")
    ordinary = (
        "\u6ca7\u7b19\u8e0f\u6b4c",
        "\u59d0\u59d0\u597d\u5e05\u7684\u5200",
        "\u843d\u65e5\u4f34\u5b64\u884c",
    )
    for want in (NAME_3, NAME_5, NAME_4, *ordinary):
        if want not in lines:
            raise SystemExit(f"name4 list missing {want!r} in {lines}")
    if elapsed > 2.0:
        raise SystemExit(f"name4 list too slow: {elapsed:.3f}s")
    print("OK name4 mixed list")


def _payload_from_image(img: Image.Image) -> str:
    import io

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


if __name__ == "__main__":
    main()
