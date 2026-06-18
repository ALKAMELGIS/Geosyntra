import type { Map as MapboxMap } from 'mapbox-gl';
import { isSiCustomLayerMapRefreshInFlight, type SiCustomLayerRegistryFields } from './siMapCustomLayerRegistry';
import { isSiMapElevationTransitionActive } from './siMapLayerTransitionGuard';
import { isSiMap3dTerrainCameraMoving } from './siMap3dTerrainCameraPerformance';

let cameraInteracting = false;
let guardInstalledFor: MapboxMap | null = null;

/** True while the user pans, zooms, rotates, or pitches the map. */
export function isSiMapCameraInteracting(): boolean {
  return cameraInteracting || isSiMap3dTerrainCameraMoving();
}

export function hasAnyCustomLayerRefreshInFlight(layers: SiCustomLayerRegistryFields[]): boolean {
  return layers.some(isSiCustomLayerMapRefreshInFlight);
}

/** Layer stack sync / repair must not run during camera motion, background refresh, or 2D↔3D transition. */
export function shouldPauseSiCustomLayerMapSync(layers: SiCustomLayerRegistryFields[]): boolean {
  return (
    cameraInteracting ||
    hasAnyCustomLayerRefreshInFlight(layers) ||
    isSiMapElevationTransitionActive()
  );
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
}

function onCameraEnd(): void {
  cameraInteracting = false;
}

export function uninstallSiMapLayerCameraSyncGuard(map?: MapboxMap | null): void {
  const target = map ?? guardInstalledFor;
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
}
