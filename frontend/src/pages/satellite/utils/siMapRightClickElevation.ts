/** Pixels of pointer movement before a right press becomes drag (orbit / tilt) instead of toggle. */
export const SI_MAP_RIGHT_CLICK_DRAG_THRESHOLD_PX = 12;
/** Higher bar in 3D before a held right press becomes drag-orbit (vs click-to-arm look-around). */
export const SI_MAP_RIGHT_CLICK_3D_ORBIT_DRAG_THRESHOLD_PX = 20;

export function siMapIsRightPointerRelease(ev: { button?: number; which?: number }): boolean {
  return ev.button === 2 || ev.which === 3;
}

export type SiMapElevationRightClickPending = {
  startX: number;
  startY: number;
  /** Elevation view active when the press began — toggle target is the inverse. */
  elevation3d: boolean;
};

function siMapElevationRightClickDrawBlocked(opts: {
  mapDrawTool: string;
  polygonRingLength: number;
  hasPolylineStart: boolean;
  hasCircleRefineDraft: boolean;
  hasRectCirclePreview: boolean;
}): boolean {
  if (opts.mapDrawTool === 'polygon' && opts.polygonRingLength > 0) return true;
  if (opts.mapDrawTool === 'rectangle' && opts.hasRectCirclePreview) return true;
  if (
    opts.mapDrawTool === 'circle' &&
    (opts.hasCircleRefineDraft || opts.hasRectCirclePreview)
  ) {
    return true;
  }
  if (opts.mapDrawTool === 'polyline' && opts.hasPolylineStart) return true;
  if (opts.mapDrawTool === 'lasso' || opts.mapDrawTool === 'freehand' || opts.mapDrawTool === 'text') {
    return true;
  }
  return false;
}

/**
 * Right-click (no Shift): in 2D press begins tilt/navigation immediately; release commits 3D.
 * In 3D, click without drag returns to 2D; drag orbits bearing/pitch.
 */
export function siMapShouldStartElevationRightClickToggle(opts: {
  button: number;
  shiftKey?: boolean;
  mapDrawTool: string;
  polygonRingLength: number;
  hasPolylineStart: boolean;
  hasCircleRefineDraft: boolean;
  hasRectCirclePreview: boolean;
}): boolean {
  if (opts.button !== 2) return false;
  if (opts.shiftKey) return false;
  return !siMapElevationRightClickDrawBlocked(opts);
}

export function siMapRightClickExceededDragThreshold(
  dx: number,
  dy: number,
  thresholdPx = SI_MAP_RIGHT_CLICK_DRAG_THRESHOLD_PX,
): boolean {
  return Math.abs(dx) + Math.abs(dy) > thresholdPx;
}
