import type { Map as MapboxMap } from 'mapbox-gl';
import { isMapboxStyleReady } from './mapboxStyleReady';
import {
  bootstrapSiMapElevationTerrainImmediate,
  isSiMapElevationSceneDeepWarmed,
  warmSiMapElevationScene,
  warmSiMapElevationSceneDeep,
} from './siMapElevationTransition';
import {
  applySiMapTerrainMeshExaggeration,
  disableSiMapTerrainMeshStable,
  markSiMapTerrainMeshLive,
  siMapTerrainMeshShouldBeLive,
} from './siMapTerrainStability';
import {
  SI_ELEVATION_VIEW_PITCH,
  SI_TERRAIN_EXAGGERATION_MAX,
  SI_TERRAIN_EXAGGERATION_MIN,
  clampElevationPitch,
  configureSiMapCameraControlsForView,
  siElevationPitchScreenOffset,
  type SiMapTerrainSettings,
} from './siMapProjectionTerrain';
import {
  SI_MAP_FREE_CAMERA_PITCH_MAX,
  SI_MAP_FREE_CAMERA_PITCH_MIN,
} from './MapMouseBehavior';

function clampSiMapFreeCameraPitch(n: number): number {
  return Math.min(SI_MAP_FREE_CAMERA_PITCH_MAX, Math.max(SI_MAP_FREE_CAMERA_PITCH_MIN, n));
}

function clampTerrainExag(n: number): number {
  return Math.min(SI_TERRAIN_EXAGGERATION_MAX, Math.max(SI_TERRAIN_EXAGGERATION_MIN, n));
}

/** Pitch (deg) at which horizon / sky dome fog begins to appear. */
export const SI_GLOBE_FREE_CAMERA_SKY_PITCH = 2;
/** Pitch (deg) at which terrain mesh activates from mouse tilt (no 3D Elevation dock). */
export const SI_GLOBE_FREE_CAMERA_TERRAIN_PITCH = 1;

export function siMapGlobeFreeCameraSkyActive(pitchDeg: number): boolean {
  return clampSiMapFreeCameraPitch(pitchDeg) >= SI_GLOBE_FREE_CAMERA_SKY_PITCH;
}

export function siMapGlobeFreeCameraTerrainActive(pitchDeg: number): boolean {
  return clampSiMapFreeCameraPitch(pitchDeg) >= SI_GLOBE_FREE_CAMERA_TERRAIN_PITCH;
}

/**
 * Custom right-drag 3D orbit (bearing + pitch) — replaces Mapbox dragRotate while active.
 * Globe maps always use RMB orbit; flat 2D projection uses it when 3D dock or camera is pitched.
 */
export function siMapView3dOrbitModeActive(
  elevationDock3d: boolean,
  pitchDeg: number,
  opts?: { globeProjection?: boolean },
): boolean {
  if (opts?.globeProjection) return true;
  return elevationDock3d || siMapGlobeFreeCameraTerrainActive(pitchDeg);
}

/** Keep the focal point centered when pitching via custom RMB orbit. */
export function applySiMapGlobeFreeCameraPitchOffset(map: MapboxMap, pitchDeg: number): void {
  const pitch = clampSiMapFreeCameraPitch(pitchDeg);
  const offset = siElevationPitchScreenOffset(map, pitch);
  try {
    /** Offset only — re-setting pitch during dragRotate fights Mapbox and causes flicker. */
    map.jumpTo({ offset, duration: 0 });
  } catch {
    /* ignore */
  }
}

/** Live terrain exaggeration ramps with camera pitch (Google Earth–style). */
export function siMapGlobeTerrainExaggerationForPitch(
  pitchDeg: number,
  baseExaggeration: number,
): number {
  const pitch = clampSiMapFreeCameraPitch(pitchDeg);
  if (pitch < SI_GLOBE_FREE_CAMERA_TERRAIN_PITCH) return 0;
  const base = clampTerrainExag(baseExaggeration);
  const t = Math.min(1, pitch / 52);
  return base * Math.max(0.35, t);
}

/**
 * Google Earth–style 3D entry: DEM terrain, buildings/contours, and horizon sky in one frame
 * before the camera pitches (used by the 2D/3D toggle).
 */
export function primeSiMapGlobeEarth3DViewEntry(
  map: MapboxMap,
  terrain: SiMapTerrainSettings & { buildings?: boolean },
): void {
  primeSiMapGlobeElevationScene(map, terrain);
  try {
    applySiMapTerrainMeshExaggeration(map, 0, { force: true, strictDemReady: true });
  } catch {
    /* ignore */
  }
}

/** Preload DEM + overlay layers at flat mesh so first mouse-tilt shows elevation instantly. */
export function primeSiMapGlobeElevationScene(
  map: MapboxMap,
  terrain: SiMapTerrainSettings & { buildings?: boolean },
): void {
  if (!isMapboxStyleReady(map)) return;
  warmSiMapElevationScene(map);
  if (!isSiMapElevationSceneDeepWarmed(map)) {
    warmSiMapElevationSceneDeep(map, terrain);
  }
}

/** Apply pitch-scaled terrain mesh on the live globe (no 3D Elevation dock). Throttled — no per-frame repaint. */
export function applySiMapGlobeLiveTerrainFromPitch(
  map: MapboxMap,
  pitchDeg: number,
  terrain: SiMapTerrainSettings & { buildings?: boolean },
): boolean {
  const pitch = clampSiMapFreeCameraPitch(pitchDeg);

  if (!siMapTerrainMeshShouldBeLive(map, pitch)) {
    if (pitch < 0.5) {
      disableSiMapTerrainMeshStable(map);
    }
    return false;
  }

  if (!isMapboxStyleReady(map)) return false;
  if (!isSiMapElevationSceneDeepWarmed(map)) {
    bootstrapSiMapElevationTerrainImmediate(map, terrain);
  }
  const exag = siMapGlobeTerrainExaggerationForPitch(pitch, terrain.exaggeration);
  try {
    applySiMapTerrainMeshExaggeration(map, exag);
    markSiMapTerrainMeshLive(map, true);
  } catch {
    /* ignore */
  }
  return true;
}

/** Whether the map should keep terrain mesh enabled (dock or live globe tilt). */
export function siMapGlobeLiveTerrainShouldBeEnabled(
  pitchDeg: number,
  elevationDockActive: boolean,
): boolean {
  return elevationDockActive || siMapGlobeFreeCameraTerrainActive(pitchDeg);
}

/**
 * Implicit 3D terrain from mouse/camera tilt — no 3D Elevation dock toggle.
 * Idempotent; safe on moveend while pitch stays above threshold.
 */
export function maybeBootstrapSiMapTerrainFromGlobePitch(
  map: MapboxMap,
  pitchDeg: number,
  terrain: SiMapTerrainSettings & { buildings?: boolean },
): boolean {
  return applySiMapGlobeLiveTerrainFromPitch(map, pitchDeg, terrain);
}

export {
  configureSiMapCameraControlsForView as configureSiMapGlobeFreeCameraNavigation,
  SI_MAP_FREE_CAMERA_PITCH_MAX,
  SI_MAP_FREE_CAMERA_PITCH_MIN,
};
