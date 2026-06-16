import type { Map as MapboxMap } from 'mapbox-gl';
import { isSiCustomLayerMapRefreshInFlight, type SiCustomLayerRegistryFields } from './siMapCustomLayerRegistry';
import { isSiMapViewTransitionActive } from './siMapLayerTransitionGuard';
import { isSiMap3dTerrainCameraMoving } from './siMap3dTerrainCameraPerformance';

let cameraInteracting = false;
let guardInstalledFor: MapboxMap | null = null;
let motionPersistHook: ((map: MapboxMap) => void) | null = null;
let motionPersistRenderHandler: (() => void) | null = null;

/** True while the user pans, zooms, rotates, or pitches the map. */
export function isSiMapCameraInteracting(): boolean {
  return cameraInteracting || isSiMap3dTerrainCameraMoving();
}

/**
 * React viewState commits during pan/zoom force a full tree reconcile and can remount
 * Mapbox `<Source>` children — keep camera in the ref until moveend instead.
 */
export function shouldCommitReactViewStateDuringCameraMotion(): boolean {
  return !isSiMapCameraInteracting();
}

export function hasAnyCustomLayerRefreshInFlight(layers: SiCustomLayerRegistryFields[]): boolean {
  return layers.some(isSiCustomLayerMapRefreshInFlight);
}

/**
 * Structural layer work (reconcile, removeLayer, addSource) must wait until the camera is idle,
 * background refresh completes, or the 2D↔3D transition ends.
 */
export function shouldDeferSiCustomLayerStructuralSync(layers: SiCustomLayerRegistryFields[]): boolean {
  return (
    cameraInteracting ||
    hasAnyCustomLayerRefreshInFlight(layers) ||
    isSiMapViewTransitionActive()
  );
}

/** @deprecated Prefer {@link shouldDeferSiCustomLayerStructuralSync} — same semantics. */
export function shouldPauseSiCustomLayerMapSync(layers: SiCustomLayerRegistryFields[]): boolean {
  return shouldDeferSiCustomLayerStructuralSync(layers);
}

/** Paint-only persistence hook — keeps AOI / vector / alert layers visible during navigation. */
export function setSiMapCameraMotionPersistHook(hook: ((map: MapboxMap) => void) | null): void {
  motionPersistHook = hook;
}

function ensureMotionPersistRenderLoop(map: MapboxMap): void {
  if (motionPersistRenderHandler) return;
  motionPersistRenderHandler = () => {
    if (!motionPersistHook) return;
    if (!isSiMapCameraInteracting() && !isSiMapViewTransitionActive()) return;
    try {
      motionPersistHook(map);
    } catch {
      /* hook fault */
    }
  };
  map.on('render', motionPersistRenderHandler);
}

/** Paint burst at view-transition start (instant 2D↔3D toggles may skip movestart). */
export function kickSiMapCameraMotionPersist(map: MapboxMap | null | undefined): void {
  if (!map || !motionPersistHook) return;
  ensureMotionPersistRenderLoop(map);
  try {
    motionPersistHook(map);
  } catch {
    /* hook fault */
  }
}

function stopMotionPersistRenderLoop(map: MapboxMap): void {
  if (!motionPersistRenderHandler) return;
  try {
    map.off('render', motionPersistRenderHandler);
  } catch {
    /* map destroyed */
  }
  motionPersistRenderHandler = null;
}

/** Install once per map — tracks camera interaction without touching layer data. */
export function installSiMapLayerCameraSyncGuard(map: MapboxMap | null | undefined): void {
  if (!map?.on || guardInstalledFor === map) return;
  if (guardInstalledFor) {
    try {
      guardInstalledFor.off('movestart', onCameraStart);
      guardInstalledFor.off('zoomstart', onCameraStart);
      guardInstalledFor.off('rotatestart', onCameraStart);
      guardInstalledFor.off('pitchstart', onCameraStart);
      guardInstalledFor.off('moveend', onCameraEnd);
      guardInstalledFor.off('zoomend', onCameraEnd);
      guardInstalledFor.off('rotateend', onCameraEnd);
      guardInstalledFor.off('pitchend', onCameraEnd);
    } catch {
      /* ignore */
    }
  }
  guardInstalledFor = map;
  map.on('movestart', onCameraStart);
  map.on('zoomstart', onCameraStart);
  map.on('rotatestart', onCameraStart);
  map.on('pitchstart', onCameraStart);
  map.on('moveend', onCameraEnd);
  map.on('zoomend', onCameraEnd);
  map.on('rotateend', onCameraEnd);
  map.on('pitchend', onCameraEnd);
}

function onCameraStart(): void {
  cameraInteracting = true;
  const map = guardInstalledFor;
  if (!map || !motionPersistHook) return;
  ensureMotionPersistRenderLoop(map);
  try {
    motionPersistHook(map);
  } catch {
    /* hook fault */
  }
}

function onCameraEnd(): void {
  cameraInteracting = false;
  if (guardInstalledFor) stopMotionPersistRenderLoop(guardInstalledFor);
}

export function uninstallSiMapLayerCameraSyncGuard(map?: MapboxMap | null): void {
  const target = map ?? guardInstalledFor;
  if (target) stopMotionPersistRenderLoop(target);
  if (!target?.off) {
    guardInstalledFor = null;
    cameraInteracting = false;
    return;
  }
  try {
    target.off('movestart', onCameraStart);
    target.off('zoomstart', onCameraStart);
    target.off('rotatestart', onCameraStart);
    target.off('pitchstart', onCameraStart);
    target.off('moveend', onCameraEnd);
    target.off('zoomend', onCameraEnd);
    target.off('rotateend', onCameraEnd);
    target.off('pitchend', onCameraEnd);
  } catch {
    /* map destroyed */
  }
  if (guardInstalledFor === target) {
    guardInstalledFor = null;
    cameraInteracting = false;
  }
}

export function resetSiMapLayerCameraSyncGuardForTests(): void {
  cameraInteracting = false;
  guardInstalledFor = null;
  motionPersistHook = null;
  motionPersistRenderHandler = null;
}
