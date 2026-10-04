#!/usr/bin/env python3
"""Recognize the game's ornate gold-radical name font by glyph templates."""
from __future__ import annotations

from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image, ImageOps

TEMPLATE_DIR = Path(__file__).resolve().parent / "font_templates"
MIN_SCORE = 0.62

# Human-read labels for the user's sample rows (left-to-right, icon excluded).
SEED_LABELS = {
    "row-1.png": list("鐘鏡嶠籠鏡"),
    "row-2.png": list("鐘鏡驄籠嶠"),
    "row-3.png": list("鐘鏡嶠籠驄"),
    "row-4.png": list("鐘鏡嶠籠鏡"),
    "row-5.png": list("鐘鏡驄籠鏡"),
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
        return int(width * 0.26)
    # icon is the first blob; names sit after the gap / divider
    if len(runs) >= 2:
        return max(0, runs[1][0] - 1)
    # fallback: skip a typical icon column
    return max(runs[0][0], int(width * 0.26))


def split_glyphs(row: Image.Image, expected: int = 5) -> list[Image.Image]:
    gray = np.array(row.convert("L"))
    invert = gray.mean() > 140
    ink = _ink_mask(gray, invert=invert)
    left = _left_text_x(ink)
    text = ink[:, left:]
    height, width = text.shape
    col = text.sum(axis=0)
    threshold = max(2, height * 0.18)
    bands: list[tuple[int, int]] = []
    start = None
    for x, v in enumerate(col):
        if v >= threshold and start is None:
            start = x
        elif v < threshold and start is not None:
            if x - start >= 4:
                bands.append((start, x))
            start = None
    if start is not None and width - start >= 4:
        bands.append((start, width))
    # merge tiny fragments that belong to one glyph
    merged: list[tuple[int, int]] = []
    for a, b in bands:
        if merged and a - merged[-1][1] <= 3:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    if len(merged) != expected and width >= expected * 8:
        step = width / expected
        merged = [(int(i * step), int((i + 1) * step)) for i in range(expected)]
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
        glyphs = split_glyphs(row)
        if len(glyphs) < 2:
            continue
        name, score = match_glyphs(glyphs, templates)
        if name and score >= MIN_SCORE:
            found.append((name, score))
    return found
