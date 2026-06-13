import type { Map as MapboxMap } from 'mapbox-gl';
import {
  SI_ELEVATION_VIEW_PITCH,
  clampElevationPitch,
  readSiMapCamera,
  readSiMapboxProjectionName,
  siElevationPitchScreenOffset,
  type SiMapCameraSnapshot,
  type SiMapTerrainSettings,
} from './siMapProjectionTerrain';

/** Context-menu 2D ↔ 3D ease duration (Google Earth–style). */
export const SI_MAP_CONTEXT_MENU_3D_TOGGLE_DURATION_MS = 800;

export type SiMapContextMenuLngLat = { lng: number; lat: number };

/**
 * Unified pivot camera for context-menu toggle — keeps zoom, pivots at click point, no home reset.
 */
export function buildSiMapElevationToggleCameraAtCenter(
  map: MapboxMap,
  center: SiMapContextMenuLngLat,
  enable3d: boolean,
  terrain: SiMapTerrainSettings,
): SiMapCameraSnapshot {
  const live = readSiMapCamera(map);
  if (enable3d) {
    const targetPitch = clampElevationPitch(terrain.elevationPitch ?? SI_ELEVATION_VIEW_PITCH);
    return {
      longitude: center.lng,
      latitude: center.lat,
      zoom: live.zoom,
      bearing: live.bearing,
      pitch: targetPitch,
    };
  }
  return {
    longitude: center.lng,
    latitude: center.lat,
    zoom: live.zoom,
    bearing: 0,
    pitch: 0,
  };
}

/** Resolve next elevation dock mode for context-menu toggle. */
export function resolveSiMapContextMenuToggle3D(currently3d: boolean): boolean {
  return !currently3d;
}

/** True when an active right-drag orbit should block context-menu toggle (user dragged). */
export function shouldBlockSiMapContextMenuToggle3D(opts: {
  orbitDragActive: boolean;
  orbitDragMoved: boolean;
}): boolean {
  if (!opts.orbitDragActive) return false;
  return opts.orbitDragMoved;
}

/** Enter 3D at click point — preserve zoom + bearing, no home reset. */
export function applySiMapContextMenuEnable3D(
  map: MapboxMap,
  center: SiMapContextMenuLngLat,
  terrain: SiMapTerrainSettings,
  opts?: { durationMs?: number },
): SiMapCameraSnapshot {
  const camera = buildSiMapElevationToggleCameraAtCenter(map, center, true, terrain);
  const duration = opts?.durationMs ?? SI_MAP_CONTEXT_MENU_3D_TOGGLE_DURATION_MS;
  const offset = siElevationPitchScreenOffset(map, camera.pitch);
  try {
    if (readSiMapboxProjectionName(map) !== 'globe') {
      map.setProjection({ name: 'globe' });
    }
  } catch {
    /* ignore */
  }
  try {
    map.easeTo({
      center: [camera.longitude, camera.latitude],
      zoom: camera.zoom,
      bearing: camera.bearing,
      pitch: camera.pitch,
      offset,
      duration,
      essential: true,
    });
  } catch {
    /* ignore */
  }
  return camera;
}

/** Return to 2D nadir at click point — preserve zoom, flatten pitch/bearing. */
export function applySiMapContextMenuEnable2D(
  map: MapboxMap,
  center: SiMapContextMenuLngLat,
  opts?: { durationMs?: number; useMercator?: boolean },
): SiMapCameraSnapshot {
  const camera = buildSiMapElevationToggleCameraAtCenter(map, center, false, {
    elevationPitch: SI_ELEVATION_VIEW_PITCH,
  });
  const duration = opts?.durationMs ?? SI_MAP_CONTEXT_MENU_3D_TOGGLE_DURATION_MS;
  if (opts?.useMercator) {
    try {
      if (readSiMapboxProjectionName(map) !== 'mercator') {
        map.setProjection({ name: 'mercator' });
      }
    } catch {
      /* ignore */
    }
  }
  try {
    map.easeTo({
      center: [camera.longitude, camera.latitude],
      zoom: camera.zoom,
      bearing: camera.bearing,
      pitch: camera.pitch,
      offset: [0, 0],
      duration,
      essential: true,
    });
  } catch {
    /* ignore */
  }
  return camera;
}

/** Unified context-menu 2D ↔ 3D toggle at map click — returns the next 3D-active state. */
export function toggleSiMap3DModeAtCenter(
  map: MapboxMap,
  center: SiMapContextMenuLngLat,
  currently3d: boolean,
  terrain: SiMapTerrainSettings,
  opts?: { durationMs?: number; useMercatorFor2d?: boolean },
): boolean {
  const next3d = resolveSiMapContextMenuToggle3D(currently3d);
  const durationMs = opts?.durationMs;
  if (next3d) {
    applySiMapContextMenuEnable3D(map, center, terrain, { durationMs });
  } else {
    applySiMapContextMenuEnable2D(map, center, {
      durationMs,
      useMercator: opts?.useMercatorFor2d,
    });
  }
  return next3d;
}
