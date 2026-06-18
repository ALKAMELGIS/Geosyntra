import type { Map as MapboxMap } from 'mapbox-gl';
import { SI_TERRAIN_DEM_SOURCE_ID } from './siMapProjectionTerrain';
import { isSiMapCameraInteracting } from './siMapLayerCameraSyncGuard';
import {
  scheduleSiMapTerrainDemReadyResync,
  siMapTerrainDemCanBootMesh,
  siMapTerrainDemTilesReady,
  siMapTerrainMeshExaggerationForReadiness,
} from './siMapTerrainDemRuntime';

const lastTerrainExagByMap = new WeakMap<MapboxMap, number>();
const pendingTerrainExagByMap = new WeakMap<MapboxMap, number>();
const lastTerrainWriteMsByMap = new WeakMap<MapboxMap, number>();
const liveTerrainMeshByMap = new WeakMap<MapboxMap, boolean>();

/** Pitch (deg) to enable terrain mesh (hysteresis on). */
export const SI_TERRAIN_MESH_PITCH_ON = 2;
/** Pitch (deg) to disable terrain mesh after it was on (hysteresis off). */
export const SI_TERRAIN_MESH_PITCH_OFF = 0.75;

export type SiMapTerrainExaggerationWriteOpts = {
  /** Minimum change before writing (default 0.04). */
  minDelta?: number;
  /** Minimum ms between writes (default 80). */
  minIntervalMs?: number;
  force?: boolean;
  /** Hold mesh at 0 until viewport DEM tiles are fully loaded (2D→3D transition). */
  strictDemReady?: boolean;
  /** 3D Elevation dock — faster throttling while panning/zooming. */
  elevationDock?: boolean;
};

export function resetSiMapTerrainStabilityForTests(map?: MapboxMap): void {
  if (!map) return;
  lastTerrainExagByMap.delete(map);
  lastTerrainWriteMsByMap.delete(map);
  liveTerrainMeshByMap.delete(map);
  pendingTerrainExagByMap.delete(map);
}

/** Hysteresis — avoids terrain mesh flicker when pitch oscillates near threshold. */
export function siMapTerrainMeshShouldBeLive(map: MapboxMap, pitchDeg: number): boolean {
  const pitch = Math.max(0, Math.min(85, pitchDeg));
  const was = liveTerrainMeshByMap.get(map) ?? false;
  if (was) {
    if (pitch < SI_TERRAIN_MESH_PITCH_OFF) {
      liveTerrainMeshByMap.set(map, false);
      return false;
    }
    return true;
  }
  if (pitch >= SI_TERRAIN_MESH_PITCH_ON) {
    liveTerrainMeshByMap.set(map, true);
    return true;
  }
  return false;
}

export function markSiMapTerrainMeshLive(map: MapboxMap, live: boolean): void {
  liveTerrainMeshByMap.set(map, live);
}

/** Hysteresis for operational-layer 2D ↔ 3D symbology — matches terrain mesh thresholds. */
export function resolveSiMapLayerExtrusion3dActive(
  elevationDock3d: boolean,
  pitchDeg: number,
  wasActive: boolean,
): boolean {
  if (elevationDock3d) return true;
  const pitch = Math.max(0, Math.min(85, pitchDeg));
  if (wasActive) {
    if (pitch < SI_TERRAIN_MESH_PITCH_OFF) return false;
    return true;
  }
  if (pitch >= SI_TERRAIN_MESH_PITCH_ON) return true;
  return false;
}

function clearSiMapTerrainMesh(map: MapboxMap): void {
  try {
    if (map.getTerrain?.()) map.setTerrain(null);
  } catch {
    /* ignore */
  }
  lastTerrainExagByMap.delete(map);
}

/** Apply pending exaggeration once DEM can boot (ramps to full quality when tiles finish). */
export function flushSiMapTerrainPendingExaggeration(map: MapboxMap): boolean {
  const pending = pendingTerrainExagByMap.get(map);
  if (pending == null || pending <= 0) return false;
  if (!siMapTerrainDemCanBootMesh(map)) return false;
  return setSiMapTerrainExaggerationStable(map, pending, { force: true });
}

/**
 * Queue terrain mesh exaggeration — hides the mesh until DEM tiles are ready.
 * Returns true when Mapbox terrain was updated immediately.
 */
export function applySiMapTerrainMeshExaggeration(
  map: MapboxMap,
  exaggeration: number,
  opts?: SiMapTerrainExaggerationWriteOpts,
): boolean {
  const exag = Number.isFinite(exaggeration) ? Math.max(0, exaggeration) : 0;
  if (exag <= 0) {
    pendingTerrainExagByMap.delete(map);
    clearSiMapTerrainMesh(map);
    return false;
  }

  pendingTerrainExagByMap.set(map, exag);

  if (!siMapTerrainDemCanBootMesh(map)) {
    if (!map.getTerrain?.()) clearSiMapTerrainMesh(map);
    scheduleSiMapTerrainDemReadyResync(map, () => {
      flushSiMapTerrainPendingExaggeration(map);
    });
    return false;
  }

  return setSiMapTerrainExaggerationStable(map, exag, opts);
}

/**
 * Throttled terrain exaggeration write — reduces mesh rebuild jitter during pan/zoom/tilt.
 * Returns true when Mapbox terrain was updated.
 */
export function setSiMapTerrainExaggerationStable(
  map: MapboxMap,
  exaggeration: number,
  opts?: SiMapTerrainExaggerationWriteOpts,
): boolean {
  const exag = Number.isFinite(exaggeration) ? exaggeration : 0;
  if (exag <= 0) {
    pendingTerrainExagByMap.delete(map);
    clearSiMapTerrainMesh(map);
    return false;
  }

  if (!siMapTerrainDemCanBootMesh(map)) {
    pendingTerrainExagByMap.set(map, exag);
    if (!map.getTerrain?.()) clearSiMapTerrainMesh(map);
    scheduleSiMapTerrainDemReadyResync(map, () => {
      flushSiMapTerrainPendingExaggeration(map);
    });
    return false;
  }

  const appliedExag =
    opts?.force && opts?.strictDemReady !== true
      ? exag
      : siMapTerrainMeshExaggerationForReadiness(
          map,
          exag,
          opts?.strictDemReady ? 'strict' : 'progressive',
        );
  if (appliedExag <= 0) {
    pendingTerrainExagByMap.delete(map);
    clearSiMapTerrainMesh(map);
    return false;
  }

  const interacting = isSiMapCameraInteracting();
  const dockFast = opts?.elevationDock === true;
  const minDelta =
    opts?.minDelta ??
    (dockFast && interacting ? 0.03 : interacting ? 0.08 : 0.04);
  const minIntervalMs =
    opts?.minIntervalMs ??
    (dockFast && interacting ? 32 : interacting ? 280 : 72);
  const last = lastTerrainExagByMap.get(map);
  if (!opts?.force && last != null && Math.abs(last - appliedExag) < minDelta) return false;

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const lastMs = lastTerrainWriteMsByMap.get(map) ?? 0;
  if (!opts?.force && now - lastMs < minIntervalMs) return false;

  try {
    if (!map.getSource(SI_TERRAIN_DEM_SOURCE_ID)) return false;
    map.setTerrain({ source: SI_TERRAIN_DEM_SOURCE_ID, exaggeration: appliedExag });
    lastTerrainExagByMap.set(map, appliedExag);
    pendingTerrainExagByMap.set(map, exag);
    lastTerrainWriteMsByMap.set(map, now);
    if (!siMapTerrainDemTilesReady(map)) {
      scheduleSiMapTerrainDemReadyResync(map, () => {
        flushSiMapTerrainPendingExaggeration(map);
      });
    }
    return true;
  } catch {
    return false;
  }
}

export function readSiMapTerrainExaggerationStable(map: MapboxMap): number | null {
  return lastTerrainExagByMap.get(map) ?? null;
}

export function disableSiMapTerrainMeshStable(map: MapboxMap): void {
  pendingTerrainExagByMap.delete(map);
  clearSiMapTerrainMesh(map);
  liveTerrainMeshByMap.set(map, false);
}
