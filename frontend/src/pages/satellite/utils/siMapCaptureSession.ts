import type { Map as MapboxMap } from 'mapbox-gl';

/** Blocks timeline ticks, date changes, and viewport updates while a report snapshot runs. */
export type SiMapCaptureSessionState = {
  active: boolean;
  startedAt: number;
};

let session: SiMapCaptureSessionState = { active: false, startedAt: 0 };

export function isSiMapCaptureSessionActive(): boolean {
  return session.active;
}

export function beginSiMapCaptureSession(): void {
  session = { active: true, startedAt: Date.now() };
  try {
    document.body.classList.add('si-map-capture-frozen');
  } catch {
    /* ignore */
  }
}

export function endSiMapCaptureSession(): void {
  session = { active: false, startedAt: 0 };
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
  beginSiMapCaptureSession();
  try {
    if (map) {
      try {
        map.stop?.();
        map.triggerRepaint?.();
      } catch {
        /* ignore */
      }
    }
    return await work();
  } finally {
    endSiMapCaptureSession();
  }
}
