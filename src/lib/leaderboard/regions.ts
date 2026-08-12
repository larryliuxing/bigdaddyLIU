/**
 * Multi-layout proportional regions for combat-power OCR.
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
  bottom: RatioRect;
};

export const POWER_LAYOUTS: PowerLayout[] = [
  {
    id: "char-center",
    label: "角色面板（名字在头顶）",
    top: { x: 0.01, y: 0.08, w: 0.18, h: 0.10 },
    bottom: { x: 0.30, y: 0.62, w: 0.40, h: 0.14 },
  },
  {
    id: "char-panel-tight",
    label: "角色面板紧凑",
    top: { x: 0.01, y: 0.05, w: 0.16, h: 0.08 },
    bottom: { x: 0.32, y: 0.68, w: 0.36, h: 0.12 },
  },
  {
    id: "ability-open",
    label: "能力值面板打开时",
    top: { x: 0.01, y: 0.10, w: 0.20, h: 0.10 },
    bottom: { x: 0.28, y: 0.60, w: 0.44, h: 0.16 },
  },
  {
    id: "hud",
    label: "主界面 HUD",
    top: { x: 0.02, y: 0.05, w: 0.26, h: 0.11 },
    bottom: { x: 0.22, y: 0.70, w: 0.42, h: 0.18 },
  },
  {
    id: "wide",
    label: "宽松兜底",
    top: { x: 0.01, y: 0.02, w: 0.28, h: 0.16 },
    bottom: { x: 0.18, y: 0.55, w: 0.55, h: 0.28 },
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
