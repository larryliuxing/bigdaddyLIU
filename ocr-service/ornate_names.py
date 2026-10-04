#!/usr/bin/env python3
"""Recognize the game's ornate gold-radical name font by glyph templates."""
from __future__ import annotations

from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image, ImageOps

TEMPLATE_DIR = Path(__file__).resolve().parent / "font_templates"
SAMPLE_DIR = Path(__file__).resolve().parent / "samples"
MIN_SCORE = 0.62

# User-confirmed name (6 glyphs). 3rd=U+5DC4 巄, 5th=U+5DC3 巃.
# Do not use the lookalikes U+9458 鑘 / U+5D84 嶄 / U+5D83 嶃.
NAME_LUOLONG = "\u9468\u9f93\u5dc4\u9f93\u5dc3\u9468"

# Human-read labels for sample crops (left-to-right).
SEED_LABELS = {
    "name-luolong-1.png": list(NAME_LUOLONG),
}


def _ink_mask(gray: np.ndarray, invert: bool) -> np.ndarray:
    if invert:
        gray = 255 - gray
    thresh = max(40, int(np.percentile(gray, 70)))
    return gray >= thresh


def split_rows(img: Image.Image) -> list[Image.Image]:
    gray = np.array(img.convert("L"))
    height, width = gray.shape
    ink = _ink_mask(gray, invert=False)
    # dark HUD: text is bright
    if ink.mean() < 0.04:
        ink = _ink_mask(gray, invert=True)
    row_hits = ink.sum(axis=1) > max(3, width * 0.015)
    bands: list[tuple[int, int]] = []
    start = None
    for y, on in enumerate(row_hits):
        if on and start is None:
            start = y
        elif not on and start is not None:
            if y - start >= 8:
                bands.append((start, y))
            start = None
    if start is not None and height - start >= 8:
        bands.append((start, height))
    rows = []
    for a, b in bands:
        pad = 3
        rows.append(img.crop((0, max(0, a - pad), width, min(height, b + pad))))
    return rows


def _left_text_x(ink: np.ndarray) -> int:
    height, width = ink.shape
    col = ink.sum(axis=0)
    threshold = max(2, height * 0.18)
    runs: list[tuple[int, int]] = []
    start = None
    for x, v in enumerate(col):
        if v >= threshold and start is None:
            start = x
        elif v < threshold and start is not None:
            if x - start >= 4:
                runs.append((start, x))
            start = None
    if start is not None and width - start >= 4:
        runs.append((start, width))
    if not runs:
        return 0
    # Game rows may start with a small weapon icon, then the name.
    if len(runs) >= 2:
        first_w = runs[0][1] - runs[0][0]
        rest_w = runs[-1][1] - runs[1][0]
        if first_w <= 22 and first_w < rest_w * 0.28:
            return max(0, runs[1][0] - 1)
    return max(0, runs[0][0])


def _ink_span(col: np.ndarray, min_val: float = 1.0) -> tuple[int, int] | None:
    hits = np.where(col >= min_val)[0]
    if hits.size == 0:
        return None
    return int(hits[0]), int(hits[-1]) + 1


def _equal_bands(start: int, end: int, count: int) -> list[tuple[int, int]]:
    span = max(0, end - start)
    return [
        (start + int(i * span / count), start + int((i + 1) * span / count))
        for i in range(count)
    ]


def split_glyphs(row: Image.Image, expected: int | None = None) -> list[Image.Image]:
    gray = np.array(row.convert("L"))
    invert = gray.mean() > 140
    ink = _ink_mask(gray, invert=invert)
    left = _left_text_x(ink)
    text = ink[:, left:]
    height, width = text.shape
    col = text.sum(axis=0)
    span = _ink_span(col, min_val=2.0) or _ink_span(col, min_val=1.0)
    if expected is None:
        if span:
            typical = max(28, height - 2)
            guess = int(round((span[1] - span[0]) / typical))
            expected = 6 if guess >= 6 else 5 if guess >= 5 else max(2, guess)
        else:
            expected = 6
    # This gold-radical font is near-monospaced. Split the ink box, not
    # the padded row — trailing dark space used to become an empty 6th glyph.
    if span and (span[1] - span[0]) >= expected * 8:
        merged = _equal_bands(span[0], span[1], expected)
    elif width >= expected * 8:
        merged = _equal_bands(0, width, expected)
    else:
        merged = [(0, width)]
    glyphs = []
    for a, b in merged:
        crop = row.crop((left + max(0, a - 1), 0, left + min(width, b + 1), row.height))
        glyphs.append(crop)
    return glyphs


def _normalize(glyph: Image.Image, size: int = 48) -> np.ndarray:
    gray = glyph.convert("L")
    if np.array(gray).mean() > 140:
        gray = ImageOps.invert(gray)
    arr = np.array(gray, dtype=np.float32)
    # tight crop to ink
    mask = arr > 40
    if mask.any():
        ys, xs = np.where(mask)
        arr = arr[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    img = Image.fromarray(arr.astype(np.uint8)).resize((size, size), Image.Resampling.LANCZOS)
    out = np.array(img, dtype=np.float32)
    out -= out.mean()
    norm = np.linalg.norm(out)
    if norm > 1e-6:
        out /= norm
    return out


def save_templates(pairs: Iterable[tuple[str, Image.Image]]) -> None:
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    for old in TEMPLATE_DIR.glob("*.npy"):
        old.unlink()
    buckets: dict[str, list[np.ndarray]] = {}
    for label, glyph in pairs:
        buckets.setdefault(label, []).append(_normalize(glyph))
    for label, items in buckets.items():
        np.save(TEMPLATE_DIR / f"{label}.npy", np.stack(items, axis=0))


def load_templates() -> dict[str, np.ndarray]:
    if not TEMPLATE_DIR.exists():
        return {}
    out = {}
    for path in TEMPLATE_DIR.glob("*.npy"):
        out[path.stem] = np.load(path)
    return out


def match_glyphs(
    glyphs: list[Image.Image],
    templates: dict[str, np.ndarray],
) -> tuple[str, float]:
    if not templates or not glyphs:
        return "", 0.0
    chars: list[str] = []
    scores: list[float] = []
    for glyph in glyphs:
        vec = _normalize(glyph).ravel()
        best_label = ""
        best = -1.0
        for label, tmpl in templates.items():
            bank = tmpl if tmpl.ndim == 3 else tmpl[None, ...]
            for item in bank:
                score = float(np.dot(vec, item.ravel()))
                if score > best:
                    best = score
                    best_label = label
        chars.append(best_label)
        scores.append(best)
    if not scores:
        return "", 0.0
    return "".join(chars), float(sum(scores) / len(scores))


def recognize_ornate_image(img: Image.Image) -> list[tuple[str, float]]:
    templates = load_templates()
    if not templates:
        return []
    gray = img.convert("L")
    if np.array(gray).mean() > 140:
        img = ImageOps.invert(gray).convert("RGB")
    rows = split_rows(img)
    if not rows:
        rows = [img]
    found: list[tuple[str, float]] = []
    for row in rows:
        best_name = ""
        best_score = 0.0
        for count in (6, 5):
            glyphs = split_glyphs(row, expected=count)
            if len(glyphs) < 2:
                continue
            name, score = match_glyphs(glyphs, templates)
            if score > best_score:
                best_name, best_score = name, score
        if best_name and best_score >= MIN_SCORE:
            found.append((best_name, best_score))
    return found
