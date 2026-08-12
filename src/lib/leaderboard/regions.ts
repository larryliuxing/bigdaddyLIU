/**
 * Proportional OCR regions for the game HUD screenshot template.
 * Coordinates are ratios of image width/height (resolution-independent).
 *
 * Layout (see /leaderboard-ocr-example.png):
 *  ① top-left blue character name
 *  ② top-left 能力值 / combat power
 *  ③ center-bottom combat power
 */
export type RatioRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export const LEADERBOARD_OCR_REGIONS = {
  /** ① 左上蓝色角色名 */
  name: { x: 0.035, y: 0.025, w: 0.30, h: 0.095 } satisfies RatioRect,
  /** slightly wider name fallback */
  nameWide: { x: 0.02, y: 0.015, w: 0.36, h: 0.12 } satisfies RatioRect,
  /** ② 左上能力值/战力 */
  powerTop: { x: 0.03, y: 0.10, w: 0.34, h: 0.11 } satisfies RatioRect,
  /** ③ 中下战力大数字 */
  powerBottom: { x: 0.18, y: 0.70, w: 0.44, h: 0.20 } satisfies RatioRect,
} as const;

export type OcrRegionKey = keyof typeof LEADERBOARD_OCR_REGIONS;
