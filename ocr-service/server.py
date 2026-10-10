#!/usr/bin/env python3
"""Local PaddleOCR service for every guild screenshot recognition path.

CPU threads are capped at 1 so a name or item scan cannot pin every core
and freeze the Next.js process. Crops, templates, and score cutoffs are
unchanged — thread count does not alter the recognized text.
"""
from __future__ import annotations

import os

# Must be set before numpy / paddle load their BLAS pools.
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")
# oneDNN retunes on every new crop size and holds the process long enough
# for the site to report 识别超时. Same model, no kernel autotune.
os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("FLAGS_enable_mkldnn", "0")

import base64
import io
import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from PIL import Image, ImageEnhance, ImageOps

HOST = os.environ.get("GUILD_OCR_HOST", "127.0.0.1")
PORT = int(os.environ.get("GUILD_OCR_PORT", "8765"))
MAX_IMAGE_BYTES = 6_000_000
MAX_IMAGES = 4
PADDLE_TIMEOUT_SEC = 12.0
# Ordinary roster lines share this budget with the one CPU thread.
# Shorter than the Node request timeout so a slow read still returns
# the ornate names already matched.
LEFTOVER_PADDLE_TIMEOUT_SEC = 8.0
RECOGNIZE_DEADLINE_SEC = 14.0

DATA_URL_RE = re.compile(
    r"^data:image/(png|jpeg|jpg|webp);base64,(.+)$",
    re.IGNORECASE | re.DOTALL,
)

_ocr: Any = None
_ocr_api = ""
_models_ready = False
_models_error = ""
_load_lock = threading.Lock()
_paddle_lock = threading.Lock()
_recognize_lock = threading.Lock()
_paddle_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="paddle")
PADDLE_MAX_EDGE = 640
BUSY_ERROR = "上一次识别还在进行，请稍后再试"


def _limit_cpu_threads() -> None:
    """One intra-op thread. Same pixels in, same text out."""
    try:
        import paddle

        setter = getattr(paddle, "set_num_threads", None)
        if setter:
            setter(1)
    except Exception as exc:
        print(f"[guild-ocr] could not cap paddle threads: {exc}", flush=True)


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
            # 4096 with the pipeline's default limit_type "min" enlarged a
            # 76px-tall ordinary name line until one CPU thread exceeded
            # the HTTP timeout. Detection only needs the long side; the
            # recognizer still crops the original pixels. Ornate names
            # never reach this model — they stay on the glyph templates.
            text_det_limit_side_len=960,
            text_det_limit_type="max",
        )
        _ocr_api = "predict"
        _limit_cpu_threads()
        return _ocr
    except TypeError:
        pass

    # PaddleOCR 2.x
    try:
        _ocr = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)
    except TypeError:
        _ocr = PaddleOCR(use_angle_cls=True, lang="ch")
    _ocr_api = "ocr"
    _limit_cpu_threads()
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


def run_one(
    img: Image.Image,
    timeout_sec: float = PADDLE_TIMEOUT_SEC,
) -> tuple[list[tuple[float, str, float]], bool]:
    import numpy as np

    def _call() -> list[tuple[float, str, float]]:
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

    # Wait out a just-finished call so this image is still read.
    # Never start a second inference beside one that is already running.
    if not _paddle_lock.acquire(timeout=min(3.0, timeout_sec)):
        print("[guild-ocr] skip paddle, still busy", flush=True)
        return [], True

    future = _paddle_pool.submit(_call)
    try:
        result = future.result(timeout=timeout_sec)
    except FuturesTimeout:
        print("[guild-ocr] paddle timed out", flush=True)

        def _reap() -> None:
            try:
                future.result(timeout=120)
            except Exception as exc:
                print(f"[guild-ocr] paddle reap: {exc}", flush=True)
            _paddle_lock.release()

        threading.Thread(target=_reap, daemon=True, name="paddle-reap").start()
        return [], True
    except Exception as exc:
        print(f"[guild-ocr] paddle failed: {exc}", flush=True)
        _paddle_lock.release()
        return [], False

    _paddle_lock.release()
    return result, False


def _looks_like_name(text: str) -> bool:
    compact = re.sub(r"\s+", "", text)
    cjk = re.sub(r"[^\u4e00-\u9fff]", "", compact)
    if len(cjk) >= 2:
        return True
    latin = re.sub(r"[^A-Za-z0-9]", "", compact)
    return bool(re.fullmatch(r"[A-Za-z][A-Za-z0-9]{1,15}", latin))


def crop_name_ink(img: Image.Image) -> Image.Image:
    """Trim empty dark padding so leftover Paddle stays on the glyphs."""
    import numpy as np

    gray = np.array(img.convert("L"))
    ink = gray >= 70
    if float(ink.mean()) < 0.004:
        return img
    ys, xs = np.where(ink)
    pad = 6
    box = (
        max(0, int(xs.min()) - pad),
        max(0, int(ys.min()) - pad),
        min(img.width, int(xs.max()) + 1 + pad),
        min(img.height, int(ys.max()) + 1 + pad),
    )
    cropped = img.crop(box)
    if cropped.width < 8 or cropped.height < 8:
        return img
    return cropped


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


def downscale_for_paddle(img: Image.Image) -> Image.Image:
    width, height = img.size
    longest = max(width, height)
    if longest <= PADDLE_MAX_EDGE:
        return img
    scale = PADDLE_MAX_EDGE / longest
    return img.resize(
        (max(1, int(width * scale)), max(1, int(height * scale))),
        Image.Resampling.BILINEAR,
    )


def leftover_paddle_attempts(img: Image.Image) -> list[Image.Image]:
    """Ordinary leftover rows are tiny and dark. Invert once; never upscale."""
    import numpy as np

    fitted = downscale_for_paddle(crop_name_ink(img))
    gray = fitted.convert("L")
    mean = float(np.array(gray).mean())
    if mean >= 120:
        return [fitted]
    inverted = ImageOps.invert(gray)
    sharp = ImageEnhance.Contrast(inverted).enhance(2.2)
    return [sharp.convert("RGB")]


def run_paddle_for_text(img: Image.Image) -> list[tuple[float, str, float]]:
    rows: list[tuple[float, str, float]] = []
    for attempt in leftover_paddle_attempts(img):
        extra, timed_out = run_one(attempt, timeout_sec=LEFTOVER_PADDLE_TIMEOUT_SEC)
        rows.extend(extra)
        if timed_out:
            break
        if extra:
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
    from ornate_names import (
        MIN_SCORE,
        ORNATE_FONT_SCORE,
        best_ornate_match,
        load_templates,
        split_rows,
    )

    templates = load_templates()
    ornate: list[str] = []
    rows: list[tuple[float, str, float]] = []
    deadline = time.time() + RECOGNIZE_DEADLINE_SEC
    for raw in images[:MAX_IMAGES]:
        img = decode_image(raw)
        bands = split_rows(img) or [img]
        leftover: list[Image.Image] = []
        for band in bands:
            # One template pass per row. recognize_ornate_image would
            # split + match, then leftover rows used to match again.
            name, score = best_ornate_match(band, templates)
            if name and score >= MIN_SCORE:
                ornate.append(name)
                continue
            if score >= ORNATE_FONT_SCORE:
                continue
            leftover.append(band)
        if leftover and time.time() < deadline:
            cropped = [crop_name_ink(band) for band in leftover]
            rows.extend(run_paddle_for_text(_stack_bands(cropped)))
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


def recognize_item_name_images(images: list[str]) -> dict[str, Any]:
    """Auction tooltip titles are already cropped. Skip ornate roster matching."""
    rows: list[tuple[float, str, float]] = []
    deadline = time.time() + RECOGNIZE_DEADLINE_SEC
    for raw in images[:1]:
        if time.time() >= deadline:
            break
        img = decode_image(raw)
        extra, timed_out = run_one(downscale_for_paddle(img))
        rows.extend(extra)
        if timed_out:
            break
    lines = merge_rows(rows)
    return {
        "ok": True,
        "text": "\n".join(lines),
        "lines": lines,
        "engine": "paddleocr",
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
        if length > 3_000_000:
            self._send(413, {"ok": False, "error": "payload too large"})
            return
        if _models_error:
            self.rfile.read(length)
            self._send(503, {"ok": False, "error": f"识别模型加载失败：{_models_error}"})
            return
        if not _models_ready:
            self.rfile.read(length)
            self._send(503, {"ok": False, "error": "识别模型加载中，请稍等再试"})
            return
        # One scan at a time. Reject before decoding so a second click
        # does not stack JSON and ornate matching on top of Paddle.
        if not _recognize_lock.acquire(blocking=False):
            self.rfile.read(length)
            self._send(503, {"ok": False, "error": BUSY_ERROR})
            return
        started = time.time()
        try:
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
            task = str(body.get("task") or "general")
            if task == "auction_item_name":
                result = recognize_item_name_images(images)
            else:
                result = recognize_images(images)
            result["ms"] = int((time.time() - started) * 1000)
            result["task"] = task
            self._send(200, result)
        except Exception as exc:
            self._send(500, {"ok": False, "error": f"ocr failed: {exc}"})
        finally:
            _recognize_lock.release()


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
