import type { Map as MapboxMap } from 'mapbox-gl';

/** `timeline` = block playback ticks only; `full` = legacy hard freeze (avoid in change-detection). */
export type SiSnapshotLockLevel = 'none' | 'timeline' | 'full';

export type SiFrozenMapViewport = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
};

let lockLevel: SiSnapshotLockLevel = 'none';
let frozenViewport: SiFrozenMapViewport | null = null;

export function getSiSnapshotLockLevel(): SiSnapshotLockLevel {
  return lockLevel;
}

/** Blocks timeline interval steps — not explicit date/WMS updates from capture. */
export function isSiTimelinePlaybackBlocked(): boolean {
  return lockLevel === 'timeline' || lockLevel === 'full';
}

/** Blocks camera moves / jumpTo during capture (full freeze only). */
export function isSiViewportChangeBlocked(): boolean {
  return lockLevel === 'full';
}

/** @deprecated Prefer isSiTimelinePlaybackBlocked — kept for raster fade=0 hook. */
export function isSiMapCaptureSessionActive(): boolean {
  return lockLevel !== 'none';
}

export function getSiFrozenMapViewport(): SiFrozenMapViewport | null {
  return frozenViewport;
}

export function pinSiFrozenMapViewport(map: MapboxMap): SiFrozenMapViewport {
  const c = map.getCenter();
  const pinned: SiFrozenMapViewport = {
    center: [c.lng, c.lat],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
  frozenViewport = pinned;
  return pinned;
}

export function enforceSiFrozenMapViewport(map: MapboxMap): void {
  const v = frozenViewport;
  if (!v || lockLevel !== 'full') return;
  try {
    map.jumpTo({
      center: v.center,
      zoom: v.zoom,
      bearing: v.bearing,
      pitch: v.pitch,
      duration: 0,
    });
  } catch {
    /* ignore */
  }
}

/** Light lock — pause timeline ticks; keep current canvas / cached tiles. */
export function beginLightSnapshotLock(): void {
  lockLevel = 'timeline';
  try {
    document.body.classList.add('si-map-capture-light');
  } catch {
    /* ignore */
  }
}

/** Full freeze — only for rare quality paths; slow on time-series batches. */
export function beginFullSnapshotLock(map?: MapboxMap | null): void {
  lockLevel = 'full';
  if (map) {
    try {
      map.stop?.();
    } catch {
      /* ignore */
    }
    pinSiFrozenMapViewport(map);
    enforceSiFrozenMapViewport(map);
  }
  try {
    document.body.classList.add('si-map-capture-frozen');
  } catch {
    /* ignore */
  }
}

export function endSnapshotLock(): void {
  lockLevel = 'none';
  frozenViewport = null;
  try {
    document.body.classList.remove('si-map-capture-light', 'si-map-capture-frozen');
  } catch {
    /* ignore */
  }
}

export async function runLightSnapshotLock<T>(work: () => Promise<T>): Promise<T> {
  beginLightSnapshotLock();
  try {
    return await work();
  } finally {
    endSnapshotLock();
  }
}

export async function runFullSnapshotLock<T>(map: MapboxMap | null | undefined, work: () => Promise<T>): Promise<T> {
  beginFullSnapshotLock(map ?? undefined);
  try {
    return await work();
  } finally {
    endSnapshotLock();
  }
}
