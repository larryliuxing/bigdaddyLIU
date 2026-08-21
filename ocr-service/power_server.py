#!/usr/bin/env python3
"""
Persistent PP-OCR (PaddleOCR-family) service for top-left combat power.

Uses RapidOCR ONNX runtime — same PP-OCR models as PaddleOCR, much faster
cold-start on CPU Aliyun boxes without paddlepaddle ABI pain.

POST /ocr/power  JSON: { "imageData": "data:image/png;base64,..." }
Response: { "ok": true, "text": "...", "lines": ["..."], "ms": 12 }
"""

from __future__ import annotations

import base64
import io
import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from PIL import Image
from rapidocr_onnxruntime import RapidOCR

HOST = os.environ.get("GUILD_OCR_HOST", "127.0.0.1")
PORT = int(os.environ.get("GUILD_OCR_PORT", "8765"))

# Top-left HUD strips (ratio of full screenshot)
TOP_LEFT_CROPS = [
    (0.0, 0.0, 0.36, 0.09),
    (0.0, 0.0, 0.28, 0.07),
    (0.02, 0.01, 0.24, 0.08),
]

_ocr: RapidOCR | None = None


def get_ocr() -> RapidOCR:
    global _ocr
    if _ocr is None:
        _ocr = RapidOCR()
    return _ocr


def decode_image(image_data: str) -> Image.Image:
    raw = image_data
    if "," in raw and raw.strip().startswith("data:"):
        raw = raw.split(",", 1)[1]
    buf = base64.b64decode(raw)
    img = Image.open(io.BytesIO(buf)).convert("RGB")
    # Cap huge screenshots for speed
    max_edge = 1600
    w, h = img.size
    edge = max(w, h)
    if edge > max_edge:
        scale = max_edge / edge
        img = img.resize(
            (max(1, int(w * scale)), max(1, int(h * scale))),
            Image.Resampling.BILINEAR,
        )
    return img


def crop_ratio(img: Image.Image, box: tuple[float, float, float, float]) -> Image.Image:
    w, h = img.size
    x, y, rw, rh = box
    left = max(0, int(w * x))
    top = max(0, int(h * y))
    right = min(w, int(w * (x + rw)))
    bottom = min(h, int(h * (y + rh)))
    if right <= left or bottom <= top:
        return img
    crop = img.crop((left, top, right, bottom))
    # Upscale small HUD crops so digits stay sharp for OCR
    cw, ch = crop.size
    if cw < 280:
        scale = 280 / max(1, cw)
        crop = crop.resize(
            (max(1, int(cw * scale)), max(1, int(ch * scale))),
            Image.Resampling.NEAREST,
        )
    return crop


def run_ocr_lines(img: Image.Image) -> list[str]:
    ocr = get_ocr()
    # RapidOCR accepts numpy / path; use temp-like bytes via numpy
    import numpy as np

    arr = np.array(img)
    result, _elapse = ocr(arr)
    lines: list[str] = []
    if not result:
        return lines
    for item in result:
        # item: [box, text, score]
        if not item or len(item) < 2:
            continue
        text = str(item[1]).strip()
        if text:
            lines.append(text)
    return lines


def recognize_top_left_power(image_data: str) -> dict[str, Any]:
    t0 = time.time()
    img = decode_image(image_data)
    all_lines: list[str] = []

    for box in TOP_LEFT_CROPS:
        crop = crop_ratio(img, box)
        lines = run_ocr_lines(crop)
        all_lines.extend(lines)
        joined = "\n".join(lines)
        # Early stop when we clearly see 战斗力 + digits
        if re.search(r"战斗力|战力", joined) and re.search(r"\d{3,6}", joined):
            break
        # Or a clean 4–5 digit HUD number alone
        if re.fullmatch(r"\d{4,5}", joined.replace("\n", "").replace(" ", "")):
            break

    # de-dupe preserve order
    seen: set[str] = set()
    uniq: list[str] = []
    for line in all_lines:
        key = re.sub(r"\s+", "", line)
        if not key or key in seen:
            continue
        seen.add(key)
        uniq.append(line)

    text = "\n".join(uniq)
    ms = int((time.time() - t0) * 1000)
    return {"ok": bool(text), "text": text, "lines": uniq, "ms": ms}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        # Keep pm2 logs short
        sys_stderr = __import__("sys").stderr
        print(f"[guild-ocr] {self.address_string()} {fmt % args}", file=sys_stderr)

    def _send(self, code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path in ("/health", "/"):
            self._send(200, {"ok": True, "service": "guild-ocr", "engine": "rapidocr-ppocr"})
            return
        self._send(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/ocr/power":
            self._send(404, {"ok": False, "error": "not found"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 12 * 1024 * 1024:
            self._send(400, {"ok": False, "error": "invalid body size"})
            return
        try:
            raw = self.rfile.read(length)
            data = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send(400, {"ok": False, "error": "invalid json"})
            return

        image_data = data.get("imageData")
        if not isinstance(image_data, str) or len(image_data) < 32:
            self._send(400, {"ok": False, "error": "missing imageData"})
            return

        try:
            result = recognize_top_left_power(image_data)
            self._send(200, result)
        except Exception as exc:  # noqa: BLE001
            self._send(500, {"ok": False, "error": f"ocr failed: {exc}"})


def main() -> None:
    # Warm model at boot so first user request is fast
    print(f"[guild-ocr] loading PP-OCR models…", flush=True)
    get_ocr()
    print(f"[guild-ocr] listening on http://{HOST}:{PORT}", flush=True)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
