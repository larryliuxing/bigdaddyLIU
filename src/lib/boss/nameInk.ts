/**
 * Guild-boss list names are pale gray / warm cream on charcoal,
 * often around brightness 90–140. A mint selection box is brighter
 * and must not be treated as ink.
 */

export function isBossNameInk(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;
  const brightness = (r + g + b) / 3;
  // Mint/cyan HUD selection rectangle around the drag box
  if (g >= r + 32 && g >= 150 && b >= 100) return false;
  if (brightness < 78) return false;
  // Pale gray glyphs (潘柴特 on the 首领 list)
  if (sat <= 28 && brightness >= 88) return true;
  // Warm cream / gold stroke leftovers
  if (
    sat <= 100 &&
    r >= 78 &&
    g >= 72 &&
    brightness >= 85 &&
    b <= Math.max(r, g) + 12
  ) {
    return true;
  }
  return false;
}

export function bossNameInkCut(inkMean: number) {
  return Math.max(62, Math.min(118, inkMean - 28));
}
