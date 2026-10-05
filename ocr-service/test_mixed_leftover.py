#!/usr/bin/env python3
"""Mixed ornate + ordinary name lists must not upscale leftover rows into Paddle."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from ornate_names import (  # noqa: E402
    ORNATE_FONT_SCORE,
    best_ornate_match,
    load_templates,
    recognize_ornate_image,
    split_rows,
)
from server import leftover_paddle_attempts, _stack_bands  # noqa: E402

SAMPLE = ROOT / "samples" / "mixed-ordinary-list.png"


def main() -> None:
    if not SAMPLE.is_file():
        raise SystemExit(f"missing {SAMPLE}")
    img = Image.open(SAMPLE).convert("RGB")
    templates = load_templates()
    leftover: list[Image.Image] = []
    ornate: list[str] = []
    for band in split_rows(img) or [img]:
        found = recognize_ornate_image(band, templates)
        if found:
            ornate.extend(name for name, _score in found)
            continue
        _name, score = best_ornate_match(band, templates)
        if score >= ORNATE_FONT_SCORE:
            continue
        leftover.append(band)

    if len(ornate) < 3:
        raise SystemExit(f"expected ornate rows, got {ornate}")
    if len(leftover) < 2:
        raise SystemExit(f"expected leftover ordinary rows, got {len(leftover)}")

    stacked = _stack_bands(leftover)
    attempts = leftover_paddle_attempts(stacked)
    if not attempts:
        raise SystemExit("no leftover paddle attempts")
    orig_long = max(stacked.size)
    for attempt in attempts:
        longest = max(attempt.size)
        if longest > orig_long:
            raise SystemExit(
                f"leftover paddle upscaled {stacked.size} -> {attempt.size}"
            )
        if longest > 640:
            raise SystemExit(f"leftover paddle too large {attempt.size}")

    print("ornate", ornate)
    print("leftover bands", [b.size for b in leftover])
    print("attempts", [a.size for a in attempts], "ok no upscale")
    print("OK mixed leftover layout")


if __name__ == "__main__":
    main()
