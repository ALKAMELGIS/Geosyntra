import type { Map as MapboxMap } from 'mapbox-gl';
import type { SiSentinelHubRasterRunLite } from '../components/SiSentinelHubRasterLayers';
import {
  isSiMap3dTerrainCameraMoving,
  setSiMap3dTerrainCameraMoving,
} from './siMap3dTerrainCameraMoving';
import { isSiMapDataLayerMutationFrozen } from './siMapRasterPipelineGuard';
import { flushDeferredSiMapWmsRasterSourceTiles } from './siMapWmsRasterLayerStack';

export { isSiMap3dTerrainCameraMoving };

/**
 * Mapbox / deck.gl equivalents of Cesium ESRI terrain camera rules:
 * - globe.maximumScreenSpaceError ≈ deck.gl maxScreenSpaceError (8 idle / 12 moving)
 * - preloadAncestors / preloadSiblings ≈ parent-tile reuse + move-end prefetch
 * - requestRenderMode ≈ repaint only on move end (no triggerRepaint during motion)
 * - suspend heavy Sentinel / WMS tile URL updates while the camera moves
 */

/** Esri I3S / ArcGIS 3D — idle quality (Cesium `maximumScreenSpaceError = 8`). */
export const SI_ESRI_3D_TERRAIN_SSE_IDLE = 8;
/** Esri I3S — kept equal to idle so parent tiles stay visible while navigating. */
export const SI_ESRI_3D_TERRAIN_SSE_MOVING = SI_ESRI_3D_TERRAIN_SSE_IDLE;

/** Google photorealistic 3D tiles — idle. */
export const SI_GOOGLE_3D_TERRAIN_SSE_IDLE = 6;
/** Google photorealistic 3D tiles — kept equal to idle during navigation. */
export const SI_GOOGLE_3D_TERRAIN_SSE_MOVING = SI_GOOGLE_3D_TERRAIN_SSE_IDLE;

export type SiMap3dTerrainOverlayKind = 'esri' | 'google';

export type SiMap3dTerrainOverlayHandle = {
  kind: SiMap3dTerrainOverlayKind;
  applyScreenSpaceError: (sse: number) => void;
};

type BoundHandlers = {
  onStart: () => void;
  onEnd: () => void;
};

const overlaysByMap = new WeakMap<MapboxMap, Set<SiMap3dTerrainOverlayHandle>>();
const handlersByMap = new WeakMap<MapboxMap, BoundHandlers>();
const repaintHandlerByMap = new WeakMap<MapboxMap, () => void>();
const pendingWmsSyncByMap = new WeakMap<
  MapboxMap,
  { runs: SiSentinelHubRasterRunLite[] | null; legacyTileUrl?: string | null }
>();
let performanceBoundFor: MapboxMap | null = null;
let idleCallbackScheduled = false;
const cameraIdleListeners = new Set<() => void>();

function sseForKind(kind: SiMap3dTerrainOverlayKind, moving: boolean): number {
  if (kind === 'esri') {
    return moving ? SI_ESRI_3D_TERRAIN_SSE_MOVING : SI_ESRI_3D_TERRAIN_SSE_IDLE;
  }
  return moving ? SI_GOOGLE_3D_TERRAIN_SSE_MOVING : SI_GOOGLE_3D_TERRAIN_SSE_IDLE;
}

function applySseForMap(map: MapboxMap, moving: boolean): void {
  const overlays = overlaysByMap.get(map);
  if (!overlays?.size) return;
  for (const overlay of overlays) {
    try {
      overlay.applyScreenSpaceError(sseForKind(overlay.kind, moving));
    } catch {
      /* overlay mid-teardown */
    }
  }
}

/** Skip heavy GIS callbacks (Sentinel refresh, analysis) during camera motion. */
export function siMap3dTerrainRunWhenCameraIdle(fn: () => void): void {
  if (isSiMap3dTerrainCameraMoving()) return;
  fn();
}

/** Queue work to run once pan / zoom / rotate / tilt settles. */
export function siMap3dTerrainOnCameraIdle(fn: () => void): () => void {
  cameraIdleListeners.add(fn);
  return () => cameraIdleListeners.delete(fn);
}

function notifyCameraIdleListeners(): void {
  for (const fn of cameraIdleListeners) {
    try {
      fn();
    } catch {
      /* listener fault */
    }
  }
}

type PendingWmsSync = {
  runs: SiSentinelHubRasterRunLite[] | null;
  legacyTileUrl?: string | null;
  apply: (map: MapboxMap, runs: SiSentinelHubRasterRunLite[] | null, legacy?: string | null) => void;
};

let pendingWmsSync: PendingWmsSync | null = null;

/**
 * Defer Sentinel Hub WMS `setTiles` while the camera moves — flush on move end.
 * Pass the same `apply` used by {@link syncSiMapWmsRasterSourceTiles}.
 */
export function siMap3dTerrainDeferWmsRasterSync(
  map: MapboxMap,
  runs: SiSentinelHubRasterRunLite[] | null | undefined,
  legacyTileUrl: string | null | undefined,
  apply: PendingWmsSync['apply'],
): void {
  const payload: PendingWmsSync = {
    runs: runs ?? null,
    legacyTileUrl: legacyTileUrl ?? null,
    apply,
  };
  if (isSiMapDataLayerMutationFrozen()) {
    pendingWmsSync = payload;
    pendingWmsSyncByMap.set(map, { runs: payload.runs, legacyTileUrl: payload.legacyTileUrl });
    return;
  }
  apply(map, payload.runs, payload.legacyTileUrl ?? null);
}

/** Apply WMS tiles immediately (timeline date / end-date changes must not wait for moveend). */
export function siMap3dTerrainForceWmsRasterSync(
  map: MapboxMap,
  runs: SiSentinelHubRasterRunLite[] | null | undefined,
  legacyTileUrl: string | null | undefined,
  apply: PendingWmsSync['apply'],
): void {
  pendingWmsSync = null;
  pendingWmsSyncByMap.delete(map);
  apply(map, runs ?? null, legacyTileUrl ?? null);
}

function flushPendingWmsSync(map: MapboxMap): void {
  const pending = pendingWmsSync;
  if (!pending?.apply) return;
  pendingWmsSync = null;
  pendingWmsSyncByMap.delete(map);
  pending.apply(map, pending.runs, pending.legacyTileUrl ?? null);
}

/**
 * Register a deck.gl 3D overlay for dynamic SSE tuning.
 * Returns unregister — call on overlay detach.
 */
export function registerSiMap3dTerrainOverlay(
  map: MapboxMap,
  handle: SiMap3dTerrainOverlayHandle,
): () => void {
  let set = overlaysByMap.get(map);
  if (!set) {
    set = new Set();
    overlaysByMap.set(map, set);
  }
  set.add(handle);
  handle.applyScreenSpaceError(sseForKind(handle.kind, isSiMap3dTerrainCameraMoving()));
  return () => {
    set?.delete(handle);
    if (set?.size === 0) overlaysByMap.delete(map);
  };
}

function startContinuousMapRepaint(map: MapboxMap): void {
  if (repaintHandlerByMap.has(map)) return;
  const onRender = () => {
    if (!isSiMap3dTerrainCameraMoving()) return;
    try {
      map.triggerRepaint?.();
    } catch {
      /* map destroyed */
    }
  };
  repaintHandlerByMap.set(map, onRender);
  map.on('render', onRender);
}

function stopContinuousMapRepaint(map: MapboxMap): void {
  const onRender = repaintHandlerByMap.get(map);
  if (!onRender) return;
  try {
    map.off('render', onRender);
  } catch {
    /* map destroyed */
  }
  repaintHandlerByMap.delete(map);
}

function onCameraMoveStart(map: MapboxMap): void {
  if (isSiMap3dTerrainCameraMoving()) return;
  setSiMap3dTerrainCameraMoving(true);
  startContinuousMapRepaint(map);
}

function onCameraMoveEnd(map: MapboxMap): void {
  if (!isSiMap3dTerrainCameraMoving()) return;
  setSiMap3dTerrainCameraMoving(false);
  stopContinuousMapRepaint(map);
  flushPendingWmsSync(map);
  flushDeferredSiMapWmsRasterSourceTiles(map);
  if (idleCallbackScheduled) return;
  idleCallbackScheduled = true;
  window.requestAnimationFrame(() => {
    idleCallbackScheduled = false;
    notifyCameraIdleListeners();
    try {
      map.triggerRepaint?.();
    } catch {
      /* map destroyed */
    }
  });
}

/** Keep explicit repaints enabled during camera motion so deck.gl / WMS stay visible. */
export function siMap3dTerrainShouldTriggerRepaint(): boolean {
  return true;
}

/** Bind movestart/moveend SSE switching — idempotent per map instance. */
export function bindSiMap3dTerrainCameraPerformance(map: MapboxMap | null | undefined): void {
  if (!map?.on || performanceBoundFor === map) return;
  uninstallSiMap3dTerrainCameraPerformance(performanceBoundFor ?? undefined);

  const bound: BoundHandlers = {
    onStart: () => onCameraMoveStart(map),
    onEnd: () => onCameraMoveEnd(map),
  };
  handlersByMap.set(map, bound);

  map.on('movestart', bound.onStart);
  map.on('zoomstart', bound.onStart);
  map.on('rotatestart', bound.onStart);
  map.on('pitchstart', bound.onStart);
  map.on('dragstart', bound.onStart);
  map.on('moveend', bound.onEnd);
  map.on('zoomend', bound.onEnd);
  map.on('rotateend', bound.onEnd);
  map.on('pitchend', bound.onEnd);
  map.on('dragend', bound.onEnd);

  performanceBoundFor = map;
}

export function uninstallSiMap3dTerrainCameraPerformance(map?: MapboxMap | null): void {
  const target = map ?? performanceBoundFor;
  if (!target?.off) {
    performanceBoundFor = null;
    setSiMap3dTerrainCameraMoving(false);
    return;
  }
  const bound = handlersByMap.get(target);
  if (bound) {
    try {
      target.off('movestart', bound.onStart);
      target.off('zoomstart', bound.onStart);
      target.off('rotatestart', bound.onStart);
      target.off('pitchstart', bound.onStart);
      target.off('dragstart', bound.onStart);
      target.off('moveend', bound.onEnd);
      target.off('zoomend', bound.onEnd);
      target.off('rotateend', bound.onEnd);
      target.off('pitchend', bound.onEnd);
      target.off('dragend', bound.onEnd);
    } catch {
      /* map destroyed */
    }
    handlersByMap.delete(target);
  }
  overlaysByMap.delete(target);
  stopContinuousMapRepaint(target);
  if (performanceBoundFor === target) {
    performanceBoundFor = null;
    setSiMap3dTerrainCameraMoving(false);
  }
}

export function resetSiMap3dTerrainCameraPerformanceForTests(): void {
  setSiMap3dTerrainCameraMoving(false);
  performanceBoundFor = null;
  pendingWmsSync = null;
  idleCallbackScheduled = false;
  cameraIdleListeners.clear();
}
