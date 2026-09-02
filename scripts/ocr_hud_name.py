#!/usr/bin/env python3
"""Paddle/RapidOCR fallback for stylized HUD names (飞飞) that Tesseract misses."""
from __future__ import annotations

import base64
import json
import os
import re
import sys
import tempfile

DATA_URL_RE = re.compile(
    r"^data:image/(png|jpeg|jpg|webp);base64,(.+)$",
    re.IGNORECASE | re.DOTALL,
)


def decode_data_url(s: str) -> tuple[str, bytes]:
    m = DATA_URL_RE.match(s.strip())
    if not m:
        raise ValueError("unsupported image")
    ext = m.group(1).lower()
    if ext == "jpeg":
        ext = "jpg"
    blob = base64.b64decode(m.group(2))
    if len(blob) > 2_500_000:
        raise ValueError("image too large")
    return ext, blob


def collect_text(ocr, path: str) -> list[str]:
    out = ocr(path)
    res = out[0] if isinstance(out, (list, tuple)) else out
    texts: list[str] = []
    if not res:
        return texts
    for item in res:
        if not item:
            continue
        t = str(item[1] if len(item) > 1 else item).strip()
        if t:
            texts.append(t)
    return texts


def main() -> None:
    paths = [p for p in sys.argv[1:] if os.path.isfile(p)]
    payload: dict = {}
    if not paths and not sys.stdin.isatty():
        raw = sys.stdin.read()
        if raw.strip():
            payload = json.loads(raw)
    images = list(payload.get("images") or [])
    if payload.get("image"):
        images.insert(0, payload["image"])

    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError:
        json.dump({"text": "", "error": "rapidocr-missing"}, sys.stdout, ensure_ascii=False)
        return

    ocr = RapidOCR()
    texts: list[str] = []
    tmp_files: list[str] = []
    try:
        for data_url in images[:3]:
            try:
                ext, blob = decode_data_url(str(data_url))
            except Exception:
                continue
            fd, tmp = tempfile.mkstemp(suffix="." + ext)
            os.write(fd, blob)
            os.close(fd)
            tmp_files.append(tmp)
            paths.append(tmp)
        for path in paths[:4]:
            try:
                texts.extend(collect_text(ocr, path))
            except Exception:
                continue
    finally:
        for tmp in tmp_files:
            try:
                os.remove(tmp)
            except OSError:
                pass

    seen: set[str] = set()
    merged: list[str] = []
    for t in texts:
        key = re.sub(r"\s+", "", t)
        if not key or key in seen:
            continue
        seen.add(key)
        merged.append(t)
    json.dump({"text": "\n".join(merged)}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
