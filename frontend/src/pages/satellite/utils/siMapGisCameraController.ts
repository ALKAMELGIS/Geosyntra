/**
 * Google Earth / ArcGIS Pro–style Mapbox GL camera controller.
 * Mapbox port of the CesiumGISController contract:
 *   LMB drag → pan · RMB drag → orbit (3D only, via useAgroCloudMapboxMouseHost)
 *   wheel → zoom · double-click → focus fly-to · toggle → smooth morph (see SI_MAP_GIS_MORPH_DURATION_MS)
 */
import type { Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';

/** Smooth 2D ↔ 3D camera morph (Cesium `morphTo2D/3D(1.5)` equivalent). */
export const SI_MAP_GIS_MORPH_DURATION_MS = 1500;
/** Double-click focus fly duration (Cesium `flyTo({ duration: 1.2 })`). */
export const SI_MAP_GIS_FLY_TO_DURATION_MS = 1200;
/** Zoom step applied on double-click focus. */
export const SI_MAP_GIS_DOUBLE_CLICK_ZOOM_IN = 1.35;

export type SiMapGisCameraControllerOptions = {
  getIs3d: () => boolean;
  isTransitioning?: () => boolean;
  isInteractionBlocked?: () => boolean;
};

export type SiMapGisCameraController = {
  dispose: () => void;
};

function resolveFlyTargetZoom(map: MapboxMap): number {
  const current = map.getZoom();
  const max = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : 22;
  return Math.min(max, current + SI_MAP_GIS_DOUBLE_CLICK_ZOOM_IN);
}

/** Apply the fixed GIS navigation baseline on a Mapbox map instance. */
export function configureSiMapGisNavigationBaseline(map: MapboxMap): void {
  try {
    map.dragPan?.enable?.();
    map.scrollZoom?.enable?.();
    map.dragRotate?.disable?.();
    map.doubleClickZoom?.disable?.();
  } catch {
    /* ignore */
  }
}

/**
 * Attach double-click fly-to + 2D nadir pitch lock.
 * Right-drag 3D orbit remains in `useAgroCloudMapboxMouseHost`.
 */
export function attachSiMapGisCameraController(
  map: MapboxMap,
  options: SiMapGisCameraControllerOptions,
): SiMapGisCameraController {
  configureSiMapGisNavigationBaseline(map);

  const onMove = () => {
    if (options.getIs3d()) return;
    if (options.isTransitioning?.()) return;
    let pitch = 0;
    try {
      pitch = map.getPitch();
    } catch {
      return;
    }
    if (pitch <= 0.05) return;
    try {
      map.jumpTo({ pitch: 0, duration: 0 });
    } catch {
      /* ignore */
    }
  };

  const onDblClick = (e: MapMouseEvent) => {
    if (options.isInteractionBlocked?.()) return;
    if (options.isTransitioning?.()) return;
    try {
      e.preventDefault();
    } catch {
      /* ignore */
    }
    const { lng, lat } = e.lngLat;
    const zoom = resolveFlyTargetZoom(map);
    const pitch = options.getIs3d() ? map.getPitch() : 0;
    try {
      map.flyTo({
        center: [lng, lat],
        zoom,
        pitch,
        bearing: map.getBearing(),
        duration: SI_MAP_GIS_FLY_TO_DURATION_MS,
        essential: true,
      });
    } catch {
      /* ignore */
    }
  };

  map.on('move', onMove);
  map.on('dblclick', onDblClick);

  return {
    dispose: () => {
      try {
        map.off('move', onMove);
        map.off('dblclick', onDblClick);
      } catch {
        /* ignore */
      }
    },
  };
}
