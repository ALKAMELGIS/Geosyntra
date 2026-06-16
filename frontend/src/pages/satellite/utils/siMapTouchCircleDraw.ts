import { circleFromEdgeFeature } from '../drawingUtils';

/** Long-press duration before touch circle sketch starts (ms). */
export const SI_TOUCH_CIRCLE_LONG_PRESS_MS = 380;

/** Cancel long-press if the finger moves farther than this (px) before hold completes. */
export const SI_TOUCH_CIRCLE_CANCEL_MOVE_PX = 14;

/** Minimum edge offset (degrees) to accept a touch circle commit. */
export const SI_TOUCH_CIRCLE_MIN_EDGE_DEG = 1e-7;

export type SiTouchCircleLongPressPending = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  center: [number, number];
};

export function isTouchPointerEvent(
  ev: MouseEvent | TouchEvent | PointerEvent | undefined,
): boolean {
  if (!ev) return false;
  if ('pointerType' in ev && ev.pointerType === 'touch') return true;
  if ('touches' in ev && ev.type.startsWith('touch')) return true;
  return false;
}

export function shouldCancelTouchCircleLongPress(
  pending: SiTouchCircleLongPressPending,
  clientX: number,
  clientY: number,
): boolean {
  const dx = clientX - pending.startClientX;
  const dy = clientY - pending.startClientY;
  return Math.hypot(dx, dy) > SI_TOUCH_CIRCLE_CANCEL_MOVE_PX;
}

/** Build AOI polygon feature with explicit circle center + radius metadata. */
export function buildTouchCircleAoiFeature(
  centerLng: number,
  centerLat: number,
  edgeLng: number,
  edgeLat: number,
  radiusM: number,
): GeoJSON.Feature {
  const feature = circleFromEdgeFeature(centerLng, centerLat, edgeLng, edgeLat, 128, 'Drawn circle');
  return {
    ...feature,
    properties: {
      ...(feature.properties ?? {}),
      aoiShape: 'circle',
      centerLng,
      centerLat,
      radiusM,
    },
  };
}
