#!/usr/bin/env python3
"""A roster of ornate names plus two ordinary lines must classify quickly.

Paddle is only for the ordinary lines. The template pass itself has to
finish well inside the HTTP timeout, or the site reports 识别超时 and
drops the ornate names that were already known.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from ornate_names import (  # noqa: E402
    MIN_SCORE,
    NAME_6,
    NAME_7,
    NAME_11,
    ORNATE_FONT_SCORE,
    best_ornate_match,
    load_templates,
    split_rows,
)
from server import _stack_bands, crop_name_ink, leftover_paddle_attempts  # noqa: E402

SAMPLE = ROOT / "samples" / "name-list-roster-mix.png"


def main() -> None:
    if not SAMPLE.is_file():
        raise SystemExit(f"missing {SAMPLE}")
    img = Image.open(SAMPLE).convert("RGB")
    templates = load_templates()
    started = time.perf_counter()
    bands = split_rows(img) or [img]
    kept: list[str] = []
    leftover: list[Image.Image] = []
    for band in bands:
        name, score = best_ornate_match(band, templates)
        if name and score >= MIN_SCORE:
            kept.append(name)
            continue
        if score >= ORNATE_FONT_SCORE:
            raise SystemExit(f"row dropped without paddle: {name!r} {score:.3f}")
        leftover.append(band)
    elapsed = time.perf_counter() - started
    if len(bands) != 6:
        raise SystemExit(f"expected 6 rows, got {len(bands)}")
    if len(kept) != 4 or len(leftover) != 2:
        raise SystemExit(f"kept {kept} leftover {len(leftover)}")
    # Row 0 is 鑨爖巄巃礲豅. Its 火 and 山 radicals used to be clipped into
    # 贝 and 金 (鑨贚鑨巃礲豅). Row 4 must stay the unlisted 金/火 string.
    expected = [
        NAME_6,
        NAME_7,
        NAME_11,
        "\u9468\u9468\u5fbf\u9468\u7216\u7216",
    ]
    if kept != expected:
        raise SystemExit(f"kept names changed: {kept}")
    if elapsed > 1.0:
        raise SystemExit(f"template pass too slow: {elapsed:.3f}s")
    stacked = _stack_bands([crop_name_ink(band) for band in leftover])
    attempts = leftover_paddle_attempts(stacked)
    if not attempts:
        raise SystemExit("ordinary rows produced no paddle image")
    for attempt in attempts:
        if max(attempt.size) > 640:
            raise SystemExit(f"ordinary rows sent to paddle too large: {attempt.size}")
    print(
        "OK roster mix",
        f"{elapsed:.3f}s",
        "kept",
        len(kept),
        "paddle",
        [a.size for a in attempts],
    )


if __name__ == "__main__":
    main()
