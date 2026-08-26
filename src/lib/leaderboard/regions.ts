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
 * Initial probe around name click. Wide enough to cover 2–4 CJK glyphs
 * even if the tap is a bit off-center; auto-trim still drops nearby UI.
 */
export const NAME_CLICK_CROP = {
  w: 0.28,
  h: 0.1,
} as const;

/** Wider probe when the name is long or the first trim finds little blue ink. */
export const NAME_CLICK_CROP_WIDE = {
  w: 0.4,
  h: 0.14,
} as const;

/** Extra-wide fallback for small HUD names on busy screenshots. */
export const NAME_CLICK_CROP_XL = {
  w: 0.5,
  h: 0.18,
} as const;
