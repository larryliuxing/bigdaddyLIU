/**
 * Click-probe sizes for leaderboard OCR.
 * Power and name are both user-clicked; no fixed HUD layout auto-scan.
 */

export type RatioRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Crop around the combat-power number the user clicks. */
export const POWER_CLICK_CROP = {
  w: 0.2,
  h: 0.065,
} as const;

export const POWER_CLICK_CROP_WIDE = {
  w: 0.28,
  h: 0.09,
} as const;

/**
 * Name probe is 2× the combat-power crop so 2–4 CJK glyphs and a middle
 * 「丶」fit. Auto-trim still tightens to the blue glyph cluster before OCR.
 */
export const NAME_CLICK_CROP = {
  w: POWER_CLICK_CROP.w * 2,
  h: POWER_CLICK_CROP.h * 2,
} as const;

/** Wider probe if the first trim finds too little blue ink. */
export const NAME_CLICK_CROP_WIDE = {
  w: POWER_CLICK_CROP_WIDE.w * 2,
  h: POWER_CLICK_CROP_WIDE.h * 2,
} as const;
