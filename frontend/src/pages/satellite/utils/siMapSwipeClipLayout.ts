export type SiMapSwipeOrientation = 'vertical' | 'horizontal';

export type SiMapSwipeClipRect = {
  clipLeft: number;
  clipTop: number;
  clipWidth: number;
  clipHeight: number;
  innerLeft: number;
  innerTop: number;
  innerWidth: number;
  innerHeight: number;
  /** CSS clip-path for spyglass; empty when linear. */
  clipPath: string;
};

/** Linear swipe clip (vertical / horizontal / dynamic split). */
export function computeSiMapSwipeClipLayout(
  bounds: { width: number; height: number },
  positionPct: number,
  orientation: SiMapSwipeOrientation,
): SiMapSwipeClipRect {
  const width = Math.max(0, bounds.width);
  const height = Math.max(0, bounds.height);
  const ratio = Math.max(0, Math.min(100, positionPct)) / 100;

  if (orientation === 'vertical') {
    const left = Math.max(0, Math.min(width, ratio * width));
    const visibleWidth = Math.max(0, width - left);
    return {
      clipLeft: left,
      clipTop: 0,
      clipWidth: visibleWidth,
      clipHeight: height,
      innerLeft: -left,
      innerTop: 0,
      innerWidth: width,
      innerHeight: height,
      clipPath: '',
    };
  }

  const top = Math.max(0, Math.min(height, ratio * height));
  const visibleHeight = Math.max(0, height - top);
  return {
    clipLeft: 0,
    clipTop: top,
    clipWidth: width,
    clipHeight: visibleHeight,
    innerLeft: 0,
    innerTop: -top,
    innerWidth: width,
    innerHeight: height,
    clipPath: '',
  };
}

/** Circular spyglass lens — trailing layer visible inside the circle. */
export function computeSiMapSpyglassClipLayout(
  bounds: { width: number; height: number },
  centerPct: { x: number; y: number },
  radiusPct: number,
): SiMapSwipeClipRect {
  const width = Math.max(0, bounds.width);
  const height = Math.max(0, bounds.height);
  const minDim = Math.max(1, Math.min(width, height));
  const cx = (Math.max(0, Math.min(100, centerPct.x)) / 100) * width;
  const cy = (Math.max(0, Math.min(100, centerPct.y)) / 100) * height;
  const r = Math.max(24, (Math.max(4, Math.min(48, radiusPct)) / 100) * minDim);
  const left = Math.max(0, cx - r);
  const top = Math.max(0, cy - r);
  const clipWidth = Math.min(width - left, r * 2);
  const clipHeight = Math.min(height - top, r * 2);
  return {
    clipLeft: left,
    clipTop: top,
    clipWidth,
    clipHeight,
    innerLeft: -left,
    innerTop: -top,
    innerWidth: width,
    innerHeight: height,
    clipPath: `circle(${r}px at ${cx - left}px ${cy - top}px)`,
  };
}

/** Full comparison — show trailing (B) or leading (A) only. */
export function computeSiMapFullCompareClipLayout(
  bounds: { width: number; height: number },
  side: 'a' | 'b',
): SiMapSwipeClipRect {
  const width = Math.max(0, bounds.width);
  const height = Math.max(0, bounds.height);
  if (side === 'b') {
    return {
      clipLeft: 0,
      clipTop: 0,
      clipWidth: width,
      clipHeight: height,
      innerLeft: 0,
      innerTop: 0,
      innerWidth: width,
      innerHeight: height,
      clipPath: '',
    };
  }
  return {
    clipLeft: 0,
    clipTop: 0,
    clipWidth: 0,
    clipHeight: 0,
    innerLeft: 0,
    innerTop: 0,
    innerWidth: width,
    innerHeight: height,
    clipPath: '',
  };
}
