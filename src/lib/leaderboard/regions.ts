/**
 * Multi-layout proportional regions for combat-power OCR.
 * Name is selected by the user clicking the blue name on the screenshot
 * (any screen layout), so name is not hard-coded here.
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

/**
 * Candidate pairs for (左上/头像旁战力, 中下/角色脚下战力).
 * The recognizer picks the first layout where both numbers exist and match.
 */
export const POWER_LAYOUTS: PowerLayout[] = [
  {
    id: "hud",
    label: "主界面 HUD",
    top: { x: 0.02, y: 0.05, w: 0.26, h: 0.11 },
    bottom: { x: 0.22, y: 0.68, w: 0.42, h: 0.18 },
  },
  {
    id: "char-panel",
    label: "角色装备面板",
    top: { x: 0.01, y: 0.03, w: 0.22, h: 0.13 },
    bottom: { x: 0.28, y: 0.50, w: 0.44, h: 0.18 },
  },
  {
    id: "ability-open",
    label: "能力值面板打开",
    top: { x: 0.01, y: 0.08, w: 0.20, h: 0.10 },
    bottom: { x: 0.30, y: 0.58, w: 0.40, h: 0.14 },
  },
  {
    id: "wide",
    label: "宽松兜底",
    top: { x: 0.01, y: 0.02, w: 0.30, h: 0.16 },
    bottom: { x: 0.15, y: 0.55, w: 0.55, h: 0.28 },
  },
];

/** Crop size around a user click on the blue name (ratios of full image). */
export const NAME_CLICK_CROP = {
  w: 0.24,
  h: 0.09,
} as const;
