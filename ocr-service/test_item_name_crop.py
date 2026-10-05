#!/usr/bin/env python3
"""Auction item-name OCR must crop the title and skip ornate roster matching."""
from __future__ import annotations

import base64
import inspect
import io
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from server import Handler, recognize_item_name_images  # noqa: E402

SAMPLE = ROOT / "samples" / "item-modao-shu.png"


def crop_title(img: Image.Image) -> Image.Image:
    width, height = img.size
    left = int(width * 0.22)
    top = int(height * 0.01)
    right = int(width * 0.92)
    bottom = int(height * 0.09)
    return img.crop((left, top, right, bottom))


def to_jpeg_data_url(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=88)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode(
        "ascii"
    )


def post_ocr(data_url: str, task: str) -> dict:
    payload = json.dumps({"task": task, "images": [data_url]}).encode("utf-8")
    req = urllib.request.Request(
        "http://127.0.0.1:8765/ocr/recognize",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        return json.loads(res.read().decode("utf-8"))


def main() -> None:
    source = inspect.getsource(Handler.do_POST)
    if "recognize_item_name_images" not in source:
        raise SystemExit("auction_item_name must skip ornate roster matching")
    if "auction_item_name" not in source:
        raise SystemExit("missing auction_item_name task branch")
    if recognize_item_name_images.__doc__ is None:
        raise SystemExit("missing item-name recognizer")

    if not SAMPLE.is_file():
        raise SystemExit(f"missing {SAMPLE}")
    img = Image.open(SAMPLE).convert("RGB")
    crop = crop_title(img)
    if crop.width < 80 or crop.height < 16:
        raise SystemExit(f"title crop too small {crop.size}")
    print("sample", img.size, "title crop", crop.size)

    data_url = to_jpeg_data_url(crop)
    if len(data_url) > 200_000:
        raise SystemExit(f"title jpeg too large {len(data_url)} chars")

    try:
        started = time.time()
        result = post_ocr(data_url, "auction_item_name")
        elapsed_ms = int((time.time() - started) * 1000)
    except urllib.error.URLError as exc:
        print("OCR service not reachable, skip live crop:", exc)
        print("OK item-name task routing")
        return

    text = str(result.get("text") or "")
    lines = result.get("lines") or []
    print("live", elapsed_ms, "ms", result.get("engine"), text, lines)
    compact = "".join(str(text).split())
    if "魔道书" not in compact:
        raise SystemExit(f"expected 魔道书 in title OCR, got {text!r}")
    if elapsed_ms > 3500:
        raise SystemExit(f"title OCR too slow: {elapsed_ms}ms")
    print("OK item-name title crop")


if __name__ == "__main__":
    main()
