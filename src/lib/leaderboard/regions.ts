/**
 * Proportional regions for combat-power OCR (top-left HUD only).
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
  top: RatioRect;
};

/** Few tight top-left strips — keep count low for OCR speed. */
export const POWER_LAYOUTS: PowerLayout[] = [
  {
    id: "hud-bar",
    label: "顶栏战力",
    top: { x: 0.0, y: 0.0, w: 0.34, h: 0.07 },
  },
  {
    id: "hud-tight",
    label: "顶栏紧凑",
    top: { x: 0.0, y: 0.005, w: 0.26, h: 0.055 },
  },
  {
    id: "char-panel",
    label: "角色面板",
    top: { x: 0.01, y: 0.03, w: 0.22, h: 0.08 },
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
