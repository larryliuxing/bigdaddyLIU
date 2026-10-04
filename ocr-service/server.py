#!/usr/bin/env python3
"""Local PaddleOCR service for every guild screenshot recognition path."""
from __future__ import annotations

import base64
import io
import json
import os
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from PIL import Image, ImageEnhance, ImageOps

HOST = os.environ.get("GUILD_OCR_HOST", "127.0.0.1")
PORT = int(os.environ.get("GUILD_OCR_PORT", "8765"))
MAX_IMAGE_BYTES = 6_000_000
MAX_IMAGES = 4

DATA_URL_RE = re.compile(
    r"^data:image/(png|jpeg|jpg|webp);base64,(.+)$",
    re.IGNORECASE | re.DOTALL,
)

_ocr: Any = None
_ocr_api = ""
_models_ready = False
_models_error = ""
_load_lock = threading.Lock()


def get_ocr() -> Any:
    global _ocr, _ocr_api
    if _ocr is not None:
        return _ocr
    from paddleocr import PaddleOCR

    # PaddleOCR 3.x — PP-OCRv5 server is better on decorative CJK.
    try:
        _ocr = PaddleOCR(
            lang="ch",
            ocr_version="PP-OCRv5",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            text_det_limit_side_len=4096,
            text_det_limit_type="max",
        )
        _ocr_api = "predict"
        return _ocr
    except TypeError:
        pass

    # PaddleOCR 2.x
    try:
        _ocr = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)
    except TypeError:
        _ocr = PaddleOCR(use_angle_cls=True, lang="ch")
    _ocr_api = "ocr"
    return _ocr


def decode_image(raw: str) -> Image.Image:
    text = (raw or "").strip()
    if text.startswith("data:image/"):
        match = DATA_URL_RE.match(text)
        if not match:
            raise ValueError("unsupported image")
        blob = base64.b64decode(match.group(2))
    else:
        blob = base64.b64decode(text)
    if not blob or len(blob) > MAX_IMAGE_BYTES:
        raise ValueError("image too large")
    img = Image.open(io.BytesIO(blob))
    return img.convert("RGB")


def prepare_variants(img: Image.Image) -> list[Image.Image]:
    variants: list[Image.Image] = [img]
    width, height = img.size
    longest = max(width, height)
    if longest < 900:
        scale = 900 / longest
        variants.append(
            img.resize(
                (max(1, int(width * scale)), max(1, int(height * scale))),
                Image.Resampling.LANCZOS,
            )
        )
    gray = img.convert("L")
    pixels = list(gray.getdata())
    mean = sum(pixels) / max(1, len(pixels))
    if mean < 120:
        inverted = ImageOps.invert(gray)
        sharp = ImageEnhance.Contrast(inverted).enhance(2.2)
        variants.append(sharp.convert("RGB"))
        if longest < 1200:
            scale = 1200 / max(longest, 1)
            variants.append(
                sharp.resize(
                    (max(1, int(width * scale)), max(1, int(height * scale))),
                    Image.Resampling.LANCZOS,
                ).convert("RGB")
            )
    return variants[:3]


def _box_top(box: Any) -> float:
    try:
        if isinstance(box, dict):
            return float(box.get("y", 0) or 0)
        if hasattr(box, "__len__") and len(box) >= 2:
            ys = [float(pt[1]) for pt in box]
            return min(ys)
    except Exception:
        return 0.0
    return 0.0


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    try:
        return list(value)
    except TypeError:
        return [value]


def collect_from_predict(result: Any) -> list[tuple[float, str, float]]:
    rows: list[tuple[float, str, float]] = []
    items = result if isinstance(result, list) else [result]
    for item in items:
        rec: dict[str, Any] = {}
        if isinstance(item, dict):
            rec = item
        elif hasattr(item, "json") and isinstance(item.json, dict):
            rec = item.json.get("res", item.json)
        elif hasattr(item, "keys"):
            rec = {k: item[k] for k in item.keys()}  # type: ignore[index]
        texts = _as_list(rec.get("rec_texts", rec.get("rec_text")))
        scores = _as_list(rec.get("rec_scores", rec.get("rec_score")))
        boxes = _as_list(
            rec.get("rec_boxes", rec.get("rec_polys", rec.get("dt_polys"))),
        )
        for i, text in enumerate(texts):
            cleaned = str(text or "").strip()
            if not cleaned:
                continue
            box = boxes[i] if i < len(boxes) else None
            score = float(scores[i]) if i < len(scores) else 1.0
            rows.append((_box_top(box), cleaned, score))
    return rows


def collect_from_ocr(result: Any) -> list[tuple[float, str, float]]:
    rows: list[tuple[float, str, float]] = []
    pages = result if isinstance(result, list) else [result]
    for page in pages:
        if not page:
            continue
        for item in page:
            if not item:
                continue
            box = item[0] if len(item) > 0 else None
            payload = item[1] if len(item) > 1 else item
            if isinstance(payload, (list, tuple)):
                text = str(payload[0] if payload else "").strip()
                score = float(payload[1]) if len(payload) > 1 else 1.0
            else:
                text = str(payload or "").strip()
                score = 1.0
            if text:
                rows.append((_box_top(box), text, score))
    return rows


def run_one(img: Image.Image) -> list[tuple[float, str, float]]:
    import numpy as np

    ocr = get_ocr()
    arr = np.array(img)
    if _ocr_api == "predict" and hasattr(ocr, "predict"):
        return collect_from_predict(ocr.predict(arr))
    if hasattr(ocr, "ocr"):
        try:
            return collect_from_ocr(ocr.ocr(arr, cls=True))
        except TypeError:
            return collect_from_ocr(ocr.ocr(arr))
    if hasattr(ocr, "predict"):
        return collect_from_predict(ocr.predict(arr))
    raise RuntimeError("unsupported PaddleOCR API")


def _looks_like_name(text: str) -> bool:
    compact = re.sub(r"\s+", "", text)
    cjk = re.sub(r"[^\u4e00-\u9fff]", "", compact)
    return len(cjk) >= 2


def _stack_bands(bands: list[Image.Image]) -> Image.Image:
    if len(bands) == 1:
        return bands[0]
    width = max(band.width for band in bands)
    gap = 8
    height = sum(band.height for band in bands) + gap * (len(bands) - 1)
    out = Image.new("RGB", (width, height), (11, 15, 19))
    y = 0
    for band in bands:
        out.paste(band, (0, y))
        y += band.height + gap
    return out


def run_paddle_for_text(img: Image.Image) -> list[tuple[float, str, float]]:
    rows = run_one(img)
    if any(_looks_like_name(text) for _y, text, _score in rows):
        return rows
    for variant in prepare_variants(img)[1:]:
        extra = run_one(variant)
        rows.extend(extra)
        if any(_looks_like_name(text) for _y, text, _score in extra):
            break
    return rows


def merge_rows(rows: list[tuple[float, str, float]]) -> list[str]:
    rows.sort(key=lambda row: (row[0], -row[2]))
    seen: set[str] = set()
    lines: list[str] = []
    for _y, text, _score in rows:
        key = re.sub(r"\s+", "", text)
        if not key or key in seen:
            continue
        seen.add(key)
        lines.append(text)
    return lines


def _norm_line(text: str) -> str:
    return re.sub(r"\s+", "", text)


def _paddle_redundant(text: str, ornate: list[str]) -> bool:
    key = _norm_line(text)
    if not key:
        return True
    for name in ornate:
        other = _norm_line(name)
        if not other:
            continue
        if key == other or key in other or other in key:
            return True
        if len(key) >= 4 and len(other) >= 4:
            shared = sum(1 for ch in key if ch in other)
            if shared / max(len(key), len(other)) >= 0.5:
                return True
    return False


def recognize_images(images: list[str]) -> dict[str, Any]:
    from ornate_names import recognize_ornate_image, split_rows

    ornate: list[str] = []
    rows: list[tuple[float, str, float]] = []
    for raw in images[:MAX_IMAGES]:
        img = decode_image(raw)
        bands = split_rows(img) or [img]
        leftover: list[Image.Image] = []
        if len(bands) == 1:
            found = recognize_ornate_image(img)
            if found:
                ornate.extend(name for name, _score in found)
                continue
            leftover.append(img)
        else:
            for band in bands:
                found = recognize_ornate_image(band)
                if found:
                    ornate.extend(name for name, _score in found)
                else:
                    leftover.append(band)
        if leftover:
            rows.extend(run_paddle_for_text(_stack_bands(leftover)))
    paddle_lines = [
        line for line in merge_rows(rows) if not _paddle_redundant(line, ornate)
    ]
    seen: set[str] = set()
    lines: list[str] = []
    for text in ornate + paddle_lines:
        key = _norm_line(text)
        if not key or key in seen:
            continue
        seen.add(key)
        lines.append(text)
    return {
        "ok": True,
        "text": "\n".join(lines),
        "lines": lines,
        "engine": "paddleocr+ornate" if ornate else "paddleocr",
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[guild-ocr] {self.address_string()} {fmt % args}", flush=True)

    def _send(self, code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path in {"/health", "/ocr/health"}:
            self._send(
                200,
                {
                    "ok": True,
                    "service": "guild-ocr",
                    "engine": "paddleocr",
                    "ready": _models_ready,
                    "error": _models_error or None,
                },
            )
            return
        self._send(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path not in {"/ocr/recognize", "/ocr/power", "/ocr/name"}:
            self._send(404, {"ok": False, "error": "not found"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length > 16_000_000:
            self._send(413, {"ok": False, "error": "payload too large"})
            return
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            self._send(400, {"ok": False, "error": "invalid json"})
            return
        images = list(body.get("images") or [])
        if body.get("image"):
            images.insert(0, body["image"])
        if body.get("imageData"):
            images.insert(0, body["imageData"])
        images = [str(v) for v in images if v]
        if not images:
            self._send(400, {"ok": False, "error": "missing image"})
            return
        if _models_error:
            self._send(503, {"ok": False, "error": f"识别模型加载失败：{_models_error}"})
            return
        if not _models_ready:
            self._send(503, {"ok": False, "error": "识别模型加载中，请稍等再试"})
            return
        started = time.time()
        try:
            result = recognize_images(images)
            result["ms"] = int((time.time() - started) * 1000)
            result["task"] = str(body.get("task") or "general")
            self._send(200, result)
        except Exception as exc:
            self._send(500, {"ok": False, "error": f"ocr failed: {exc}"})


def _load_models() -> None:
    global _models_ready, _models_error
    with _load_lock:
        if _models_ready or _models_error:
            return
        print("[guild-ocr] loading PaddleOCR models…", flush=True)
        try:
            get_ocr()
            run_one(Image.new("RGB", (96, 32), (20, 24, 28)))
            _models_ready = True
            print("[guild-ocr] models ready", flush=True)
        except Exception as exc:
            _models_error = str(exc)
            print(f"[guild-ocr] model load failed: {exc}", flush=True)


def main() -> None:
    threading.Thread(target=_load_models, name="ocr-load", daemon=True).start()
    print(f"[guild-ocr] listening on http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
