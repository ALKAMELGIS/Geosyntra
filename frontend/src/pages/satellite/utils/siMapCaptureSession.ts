import type { Map as MapboxMap } from 'mapbox-gl';

export type SiMapCaptureSessionState = {
  active: boolean;
  startedAt: number;
};

export type SiFrozenMapViewport = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
};

let session: SiMapCaptureSessionState = { active: false, startedAt: 0 };
let frozenViewport: SiFrozenMapViewport | null = null;

export function isSiMapCaptureSessionActive(): boolean {
  return session.active;
}

export function getSiFrozenMapViewport(): SiFrozenMapViewport | null {
  return frozenViewport;
}

/** Snapshot current camera — call once at capture start. */
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

/** Re-apply pinned camera (no animation) so tiles/WMS stay aligned with the frozen frame. */
export function enforceSiFrozenMapViewport(map: MapboxMap): void {
  const v = frozenViewport;
  if (!v) return;
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

export function beginSiMapCaptureSession(map?: MapboxMap | null): void {
  session = { active: true, startedAt: Date.now() };
  if (map) {
    try {
      map.stop?.();
    } catch {
      /* ignore */
    }
    pinSiFrozenMapViewport(map);
    enforceSiFrozenMapViewport(map);
    try {
      map.triggerRepaint?.();
    } catch {
      /* ignore */
    }
  }
  try {
    document.body.classList.add('si-map-capture-frozen');
  } catch {
    /* ignore */
  }
}

export function endSiMapCaptureSession(): void {
  session = { active: false, startedAt: 0 };
  frozenViewport = null;
  try {
    document.body.classList.remove('si-map-capture-frozen');
  } catch {
    /* ignore */
  }
}

export async function runSiMapCaptureSession<T>(
  map: MapboxMap | null | undefined,
  work: () => Promise<T>,
): Promise<T> {
  beginSiMapCaptureSession(map ?? undefined);
  try {
    return await work();
  } finally {
    endSiMapCaptureSession();
  }
}
