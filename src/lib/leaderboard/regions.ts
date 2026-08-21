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
 * Initial probe around name click — intentionally modest so we don't pull in
 * nearby +N badges / portraits / skill icons. Auto-trim expands/shrinks
 * to the blue name glyphs afterward.
 */
export const NAME_CLICK_CROP = {
  w: 0.16,
  h: 0.055,
} as const;

/** Wider probe if the first trim finds too little blue ink. */
export const NAME_CLICK_CROP_WIDE = {
  w: 0.22,
  h: 0.07,
} as const;
