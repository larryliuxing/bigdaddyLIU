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
# High enough that ordinary CJK (≈0.33–0.38) still falls through to Paddle.
ORNATE_FONT_SCORE = 0.48

_TEMPLATE_CACHE: dict[str, np.ndarray] | None = None

# User-confirmed names (6 glyphs each).
# Do not use the lookalikes U+9458 / U+5D84 / U+5D83.
NAME_1 = "\u9468\u9f93\u5dc4\u9f93\u5dc3\u9468"
NAME_2 = "\u9468\u8c45\u8d1a\u9468\u8d1a\u5dc4"
NAME_3 = "\u9468\u9468\u7216\u9f93\u9468\u9468"
NAME_4 = "\u9468\u8d1a\u8d1a\u8c45\u7216\u5dc3"
NAME_5 = "\u9468\u9468\u9f93\u9468\u9468\u9468"
NAME_6 = "\u9468\u7216\u5dc4\u5dc3\u7932\u8c45"
NAME_7 = "\u9468\u9f93\u5fbf\u8d1a\u8d1a\u9468"
NAME_8 = "\u5131\u5131\u5131\u6f0b\u6f0b\u6f0b"
NAME_LUOLONG = NAME_1

# Human-read labels for sample crops (left-to-right).
SEED_LABELS = {
    "name-luolong-1.png": list(NAME_1),
    "name-2.png": list(NAME_2),
    "name-3.png": list(NAME_3),
    "name-4.png": list(NAME_4),
    "name-4b.png": list(NAME_4),
    "name-4c.png": list(NAME_4),
    "name-5.png": list(NAME_5),
    "name-6.png": list(NAME_6),
    "name-7.png": list(NAME_7),
    "name-7b.png": list(NAME_7),
    "name-8.png": list(NAME_8),
    "name-8b.png": list(NAME_8),
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
    if len(runs) >= 2:
        first_w = runs[0][1] - runs[0][0]
        typical = (runs[-1][1] - runs[0][0]) / 6
        # Skip a thin leftover radical/speck, not a full 6-glyph cell (≈ typical).
        if first_w <= 12 and first_w < typical * 0.55:
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


def _refine_bands(col: np.ndarray, bands: list[tuple[int, int]], search: int = 5) -> list[tuple[int, int]]:
    if len(bands) < 2:
        return bands
    cuts = [bands[0][0]]
    for i in range(1, len(bands)):
        guess = bands[i][0]
        lo = max(cuts[-1] + 4, guess - search)
        hi = min(bands[i][1] - 4, guess + search)
        if hi <= lo:
            cuts.append(guess)
            continue
        window = col[lo:hi]
        cuts.append(lo + int(np.argmin(window)))
    cuts.append(bands[-1][1])
    return [(cuts[i], cuts[i + 1]) for i in range(len(cuts) - 1)]


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
    if span and (span[1] - span[0]) >= expected * 8:
        merged = _refine_bands(col, _equal_bands(span[0], span[1], expected))
    elif width >= expected * 8:
        merged = _refine_bands(col, _equal_bands(0, width, expected))
    else:
        merged = [(0, width)]
    glyphs = []
    for a, b in merged:
        crop = row.crop((left + max(0, a - 1), 0, left + min(width, b + 1), row.height))
        glyphs.append(crop)
    return glyphs


def _tight_ink(glyph: Image.Image) -> np.ndarray:
    gray = glyph.convert("L")
    if np.array(gray).mean() > 140:
        gray = ImageOps.invert(gray)
    arr = np.array(gray, dtype=np.float32)
    mask = arr > 40
    if mask.any():
        ys, xs = np.where(mask)
        arr = arr[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    return arr


def _unit(arr: np.ndarray, size: int = 48) -> np.ndarray:
    img = Image.fromarray(arr.astype(np.uint8)).resize((size, size), Image.Resampling.LANCZOS)
    out = np.array(img, dtype=np.float32)
    out -= out.mean()
    norm = np.linalg.norm(out)
    if norm > 1e-6:
        out /= norm
    return out


def _normalize(glyph: Image.Image, size: int = 48) -> np.ndarray:
    return _unit(_tight_ink(glyph), size)


def _left_ink(glyph: Image.Image) -> np.ndarray:
    arr = _tight_ink(glyph)
    width = arr.shape[1]
    cut = max(4, int(round(width * 0.42)))
    return arr[:, :cut]


def _feature(glyph: Image.Image) -> np.ndarray:
    # Full glyph plus the left radical. These names share a dragon body
    # and differ by 金 / 贝 / 豕 / 火 / 山.
    full = _unit(_tight_ink(glyph)).ravel()
    left = _unit(_left_ink(glyph)).ravel()
    feat = np.concatenate([full, left, left])
    norm = np.linalg.norm(feat)
    if norm > 1e-6:
        feat = feat / norm
    return feat


def _shifted_glyphs(glyph: Image.Image) -> list[Image.Image]:
    width, height = glyph.size
    out = [glyph]
    for dx in (-3, -2, -1, 1, 2, 3):
        if dx > 0 and dx < width - 4:
            out.append(glyph.crop((dx, 0, width, height)))
        if dx < 0 and width + dx > 4:
            out.append(glyph.crop((0, 0, width + dx, height)))
    return out


def collect_seed_pairs(exclude: set[str] | None = None) -> list[tuple[str, Image.Image]]:
    skip = exclude or set()
    pairs: list[tuple[str, Image.Image]] = []
    for filename, chars in SEED_LABELS.items():
        if filename in skip:
            continue
        path = SAMPLE_DIR / filename
        if not path.is_file():
            raise FileNotFoundError(path)
        img = Image.open(path).convert("RGB")
        glyphs = split_glyphs((split_rows(img) or [img])[0], expected=len(chars))
        if len(glyphs) != len(chars):
            raise ValueError(f"{filename}: glyph count mismatch")
        pairs.extend(zip(chars, glyphs))
    return pairs


def templates_from_pairs(pairs: Iterable[tuple[str, Image.Image]]) -> dict[str, np.ndarray]:
    buckets: dict[str, list[np.ndarray]] = {}
    for label, glyph in pairs:
        buckets.setdefault(label, []).append(_feature(glyph))
    return {label: np.stack(items, axis=0) for label, items in buckets.items()}


def save_templates(pairs: Iterable[tuple[str, Image.Image]]) -> None:
    global _TEMPLATE_CACHE
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    for old in TEMPLATE_DIR.glob("*.npy"):
        old.unlink()
    for label, bank in templates_from_pairs(pairs).items():
        np.save(TEMPLATE_DIR / f"{label}.npy", bank)
    _TEMPLATE_CACHE = None


def load_templates() -> dict[str, np.ndarray]:
    global _TEMPLATE_CACHE
    if _TEMPLATE_CACHE is not None:
        return _TEMPLATE_CACHE
    if not TEMPLATE_DIR.exists():
        return {}
    out = {}
    for path in TEMPLATE_DIR.glob("*.npy"):
        out[path.stem] = np.load(path)
    _TEMPLATE_CACHE = out
    return out


def _score_vec(vec: np.ndarray, templates: dict[str, np.ndarray]) -> tuple[str, float]:
    best_label = ""
    best = -1.0
    query = vec.ravel()
    for label, tmpl in templates.items():
        bank = tmpl if tmpl.ndim == 2 else tmpl.reshape(tmpl.shape[0], -1)
        score = float(np.max(bank @ query))
        if score > best:
            best = score
            best_label = label
    return best_label, best


def match_glyphs(
    glyphs: list[Image.Image],
    templates: dict[str, np.ndarray],
) -> tuple[str, float, list[float]]:
    if not templates or not glyphs:
        return "", 0.0, []
    chars: list[str] = []
    scores: list[float] = []
    for glyph in glyphs:
        best_label = ""
        best = -1.0
        for variant in _shifted_glyphs(glyph):
            label, score = _score_vec(_feature(variant), templates)
            if score > best:
                best = score
                best_label = label
        chars.append(best_label)
        scores.append(best)
    if not scores:
        return "", 0.0, []
    return "".join(chars), float(sum(scores) / len(scores)), scores


def _split_candidates(row: Image.Image) -> list[list[Image.Image]]:
    gray = np.array(row.convert("L"))
    invert = gray.mean() > 140
    ink = _ink_mask(gray, invert=invert)
    left = _left_text_x(ink)
    text = ink[:, left:]
    _height, width = text.shape
    col = text.sum(axis=0)
    span = _ink_span(col, min_val=2.0) or _ink_span(col, min_val=1.0) or (0, width)
    out: list[list[Image.Image]] = []
    count = 6
    if (span[1] - span[0]) < count * 8:
        return out
    for off in range(-3, 4):
        start = max(0, span[0] + off)
        end = min(width, span[1] + off)
        if end - start < count * 8:
            continue
        bands = _refine_bands(col, _equal_bands(start, end, count))
        glyphs = []
        for a, b in bands:
            crop = row.crop(
                (
                    left + max(0, a - 3),
                    0,
                    left + min(width, b + 3),
                    row.height,
                )
            )
            glyphs.append(crop)
        out.append(glyphs)
    return out


def _prepare_ornate(img: Image.Image) -> Image.Image:
    gray = img.convert("L")
    if np.array(gray).mean() > 140:
        return ImageOps.invert(gray).convert("RGB")
    return img


def best_ornate_match(
    row: Image.Image,
    templates: dict[str, np.ndarray] | None = None,
) -> tuple[str, float]:
    if templates is None:
        templates = load_templates()
    if not templates:
        return "", 0.0
    best_name = ""
    best_key = (-1.0, -1.0)
    glyphs = split_glyphs(row, expected=6)
    if len(glyphs) == 6:
        name, score, parts = match_glyphs(glyphs, templates)
        best_key = (score, min(parts) if parts else -1.0)
        best_name = name
        # Default 6-split is already ornate, or clearly ordinary CJK.
        # Skip the ±3px offset search — that is what made 鑨贚贚豅爖巃
        # (and leftover rows next to it) feel expensive on mixed lists.
        if score >= MIN_SCORE or score < ORNATE_FONT_SCORE - 0.04:
            return best_name, float(score)
    for glyphs in _split_candidates(row):
        if len(glyphs) != 6:
            continue
        name, score, parts = match_glyphs(glyphs, templates)
        key = (score, min(parts) if parts else -1.0)
        if key > best_key:
            best_key = key
            best_name = name
    return best_name, float(max(0.0, best_key[0]))


def looks_like_ornate_font(
    row: Image.Image,
    templates: dict[str, np.ndarray] | None = None,
) -> bool:
    _name, score = best_ornate_match(row, templates)
    return score >= ORNATE_FONT_SCORE


def recognize_ornate_image(
    img: Image.Image,
    templates: dict[str, np.ndarray] | None = None,
) -> list[tuple[str, float]]:
    if templates is None:
        templates = load_templates()
    if not templates:
        return []
    img = _prepare_ornate(img)
    rows = split_rows(img)
    if not rows:
        rows = [img]
    found: list[tuple[str, float]] = []
    for row in rows:
        name, score = best_ornate_match(row, templates)
        if name and score >= MIN_SCORE:
            found.append((name, score))
    return found
