import type { Map as MapboxMap } from 'mapbox-gl';
import { readSiMapCamera, type SiMapCameraSnapshot } from './siMapProjectionTerrain';

export type SiMapUserCameraSource =
  | 'orbit-drag'
  | 'mapbox-gesture'
  | 'explicit';

type SiMapUserCameraRecord = {
  snapshot: SiMapCameraSnapshot;
  updatedAt: number;
  source: SiMapUserCameraSource;
};

let userCamera: SiMapUserCameraRecord | null = null;
let manualOrbitUntilMs = 0;
let syncInstalledFor: MapboxMap | null = null;
let moveRaf: number | null = null;

type SiMapUserCameraSyncHandlers = {
  onLiveCamera: (camera: SiMapCameraSnapshot) => void;
  onCommitCamera: (camera: SiMapCameraSnapshot) => void;
  shouldIgnoreMove?: () => boolean;
};

let syncHandlers: SiMapUserCameraSyncHandlers | null = null;

/** User manually orbited/rotated — defer automatic camera corrections briefly. */
export function markSiMapManualOrbitCooldown(ms = 1200): void {
  manualOrbitUntilMs = Date.now() + ms;
}

export function isSiMapManualOrbitCooldownActive(): boolean {
  return Date.now() < manualOrbitUntilMs;
}

export function commitSiMapUserCamera(
  snapshot: SiMapCameraSnapshot,
  source: SiMapUserCameraSource = 'mapbox-gesture',
): SiMapCameraSnapshot {
  const next = { ...snapshot };
  userCamera = { snapshot: next, updatedAt: Date.now(), source };
  return next;
}

export function commitSiMapUserCameraFromMap(
  map: MapboxMap | null | undefined,
  source: SiMapUserCameraSource = 'mapbox-gesture',
): SiMapCameraSnapshot | null {
  if (!map) return null;
  try {
    return commitSiMapUserCamera(readSiMapCamera(map), source);
  } catch {
    return null;
  }
}

export function readSiMapUserCamera(): SiMapCameraSnapshot | null {
  return userCamera ? { ...userCamera.snapshot } : null;
}

export function hasSiMapUserCameraAuthority(): boolean {
  return userCamera != null;
}

/** Block flyTo / easeTo / home / auto 2D↔3D unless the caller is an explicit user command. */
export function shouldBlockProgrammaticCameraMove(opts?: { explicit?: boolean }): boolean {
  if (opts?.explicit) return false;
  return hasSiMapUserCameraAuthority() || isSiMapManualOrbitCooldownActive();
}

export function clearSiMapUserCameraAuthority(): void {
  userCamera = null;
  manualOrbitUntilMs = 0;
}

function scheduleLiveCameraSync(map: MapboxMap): void {
  if (!syncHandlers) return;
  if (moveRaf != null) return;
  moveRaf = requestAnimationFrame(() => {
    moveRaf = null;
    if (!syncHandlers || syncHandlers.shouldIgnoreMove?.()) return;
    try {
      const cam = readSiMapCamera(map);
      commitSiMapUserCamera(cam, 'mapbox-gesture');
      syncHandlers.onLiveCamera(cam);
    } catch {
      /* ignore */
    }
  });
}

function onUserCameraStart(): void {
  /* gesture started */
}

function onUserCameraMove(): void {
  if (!syncInstalledFor) return;
  scheduleLiveCameraSync(syncInstalledFor);
}

function onUserCameraEnd(): void {
  if (!syncInstalledFor || !syncHandlers) return;
  if (syncHandlers.shouldIgnoreMove?.()) return;
  try {
    const cam = readSiMapCamera(syncInstalledFor);
    commitSiMapUserCamera(cam, 'mapbox-gesture');
    syncHandlers.onCommitCamera(cam);
  } catch {
    /* ignore */
  }
}

/** Live camera sync during pan / rotate / pitch — commits on moveend. */
export function installSiMapUserCameraSync(
  map: MapboxMap | null | undefined,
  handlers: SiMapUserCameraSyncHandlers,
): void {
  if (!map?.on) return;
  if (syncInstalledFor && syncInstalledFor !== map) {
    uninstallSiMapUserCameraSync(syncInstalledFor);
  }
  syncHandlers = handlers;
  if (syncInstalledFor === map) return;
  syncInstalledFor = map;
  map.on('movestart', onUserCameraStart);
  map.on('rotatestart', onUserCameraStart);
  map.on('pitchstart', onUserCameraStart);
  map.on('dragstart', onUserCameraStart);
  map.on('move', onUserCameraMove);
  map.on('rotate', onUserCameraMove);
  map.on('pitch', onUserCameraMove);
  map.on('moveend', onUserCameraEnd);
  map.on('rotateend', onUserCameraEnd);
  map.on('pitchend', onUserCameraEnd);
  map.on('zoomend', onUserCameraEnd);
}

export function uninstallSiMapUserCameraSync(map: MapboxMap | null | undefined): void {
  if (!map?.off) return;
  try {
    map.off('movestart', onUserCameraStart);
    map.off('rotatestart', onUserCameraStart);
    map.off('pitchstart', onUserCameraStart);
    map.off('dragstart', onUserCameraStart);
    map.off('move', onUserCameraMove);
    map.off('rotate', onUserCameraMove);
    map.off('pitch', onUserCameraMove);
    map.off('moveend', onUserCameraEnd);
    map.off('rotateend', onUserCameraEnd);
    map.off('pitchend', onUserCameraEnd);
    map.off('zoomend', onUserCameraEnd);
  } catch {
    /* ignore */
  }
  if (syncInstalledFor === map) {
    syncInstalledFor = null;
    syncHandlers = null;
  }
  if (moveRaf != null) {
    cancelAnimationFrame(moveRaf);
    moveRaf = null;
  }
}

export function resetSiMapUserCameraAuthorityForTests(): void {
  clearSiMapUserCameraAuthority();
  syncHandlers = null;
  syncInstalledFor = null;
  if (moveRaf != null) {
    cancelAnimationFrame(moveRaf);
    moveRaf = null;
  }
}
