/**
 * Mid-lower 「战斗力」+ number band (under the character).
 * Name uses a small click probe, then auto-trims to blue glyphs.
 */

export type RatioRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PowerLayout = {
  id: string;
  label: string;
  /** Full 「战斗力 … 数字」strip */
  top: RatioRect;
};

/**
 * Center-bottom combat-power line under the character model.
 * Avoid the left 能力值 panel and top HUD so we don't pick junk digits.
 */
export const POWER_LAYOUTS: PowerLayout[] = [
  {
    id: "mid-main",
    label: "角色下方战斗力",
    top: { x: 0.28, y: 0.55, w: 0.44, h: 0.12 },
  },
  {
    id: "mid-tight",
    label: "战斗力紧凑",
    top: { x: 0.32, y: 0.58, w: 0.36, h: 0.09 },
  },
  {
    id: "mid-low",
    label: "战斗力偏下",
    top: { x: 0.26, y: 0.6, w: 0.48, h: 0.12 },
  },
];

/**
 * Initial probe around click — intentionally modest so we don't pull in
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
