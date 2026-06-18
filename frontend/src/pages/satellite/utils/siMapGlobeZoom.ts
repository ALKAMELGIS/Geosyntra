import type { Map as MapboxMap } from 'mapbox-gl';

/** Wheel sensitivity — aligned with Mapbox default scroll zoom rate. */
export const SI_GLOBE_ZOOM_WHEEL_GAIN = 1 / 450;
export const SI_GLOBE_ZOOM_MIN = 0.5;
export const SI_GLOBE_ZOOM_MAX = 22;

export type SiMapGlobeScreenPoint = { x: number; y: number };

/** Clamp and apply zoom-only delta — preserves center / pitch / bearing / offset (no pan). */
export function siMapGlobeZoomByDelta(map: MapboxMap, delta: number, durationMs = 280): number {
  const targetZoom = Math.min(
    SI_GLOBE_ZOOM_MAX,
    Math.max(SI_GLOBE_ZOOM_MIN, map.getZoom() + delta),
  );
  try {
    map.easeTo({
      zoom: targetZoom,
      duration: durationMs,
      essential: true,
    });
  } catch {
    /* ignore */
  }
  return targetZoom;
}

/**
 * 3D Elevation wheel: change zoom level only — never pan or shift center.
 * Replaces Mapbox scroll-zoom (which fights pitched camera + screen offset).
 */
export function attachSiMapGlobeElevationZoomWheel(
  map: MapboxMap,
  canvas: HTMLCanvasElement,
  shouldHandle: () => boolean,
): () => void {
  const onWheel = (e: WheelEvent) => {
    if (!shouldHandle()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const current = map.getZoom();
    const target = Math.min(
      SI_GLOBE_ZOOM_MAX,
      Math.max(SI_GLOBE_ZOOM_MIN, current - e.deltaY * SI_GLOBE_ZOOM_WHEEL_GAIN),
    );
    if (Math.abs(target - current) < 1e-6) return;
    try {
      map.easeTo({ zoom: target, duration: 0, essential: true });
    } catch {
      /* ignore */
    }
  };
  canvas.addEventListener('wheel', onWheel, { passive: false, capture: true });
  return () => canvas.removeEventListener('wheel', onWheel, true);
}

/**
 * MapGL should not push viewState while Mapbox owns the live camera (globe dragRotate,
 * 3D elevation dock, orbit drag, or transitions).
 */
export function siMapGlViewStateIsControlled(
  elevationViewActive: boolean,
  elevationTransitioning: boolean,
  cameraOrbitDragging: boolean,
  globeProjection = false,
): boolean {
  if (globeProjection) return false;
  return !elevationViewActive || elevationTransitioning || cameraOrbitDragging;
}
