export type SiMapSwipeMode = 'vertical' | 'horizontal' | 'spyglass';

export type SiMapSwipeNorm = {
  /** 0–1 from left */
  x: number;
  /** 0–1 from top */
  y: number;
};

export const SI_MAP_SWIPE_DEFAULT_NORM: SiMapSwipeNorm = { x: 0.5, y: 0.5 };

export const SI_MAP_SWIPE_SPYGLASS_RADIUS_PX = 128;
