import type { Map as MapboxMap } from 'mapbox-gl';

/** Wait until Mapbox GL finishes rendering tiles + layers (or timeout). */
export function waitForMapboxIdle(map: MapboxMap, timeoutMs = 5200): Promise<void> {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    try {
      map.triggerRepaint?.();
      if (map.isStyleLoaded?.()) map.once('idle', finish);
      else map.once('style.load', () => map.once('idle', finish));
    } catch {
      finish();
    }
    window.setTimeout(finish, timeoutMs);
  });
}

/**
 * After idle, wait until `areTilesLoaded()` is true (Mapbox GL 2.2+ / 3.x) so WMS/raster
 * overlays are present before `toDataURL`. Short-poll with a tight cap to avoid long exports.
 */
export function waitForMapboxTilesPainted(map: MapboxMap, timeoutMs = 2800, intervalMs = 72): Promise<void> {
  const areTilesLoaded = (map as unknown as { areTilesLoaded?: () => boolean }).areTilesLoaded;
  if (typeof areTilesLoaded !== 'function') return Promise.resolve();
  return new Promise(resolve => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const tick = () => {
      try {
        if (areTilesLoaded.call(map)) {
          resolve();
          return;
        }
      } catch {
        resolve();
        return;
      }
      const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
      if (elapsed >= timeoutMs) {
        resolve();
        return;
      }
      window.setTimeout(tick, intervalMs);
    };
    tick();
  });
}

/** One paint after repaint — helps `preserveDrawingBuffer` read the latest frame. */
export function flushMapboxPaint(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/**
 * Idle → tiles loaded → repaint → rAF, then PNG. Use for AOI report / export snapshots.
 */
export async function captureMapboxCanvasWhenReady(
  map: MapboxMap,
  opts?: { scale?: number; idleTimeoutMs?: number; tilesTimeoutMs?: number },
): Promise<string | null> {
  const scale = opts?.scale ?? 2;
  const idleTimeout = opts?.idleTimeoutMs ?? 6200;
  const tilesTimeout = opts?.tilesTimeoutMs ?? 2800;
  await waitForMapboxIdle(map, idleTimeout);
  await waitForMapboxTilesPainted(map, tilesTimeout);
  try {
    map.triggerRepaint?.();
  } catch {
    /* ignore */
  }
  await flushMapboxPaint();
  return captureMapboxCanvasPng(map, scale);
}

/** Hi-res PNG from the live Mapbox canvas (requires `preserveDrawingBuffer` on MapGL). */
export function captureMapboxCanvasPng(map: MapboxMap, scale = 2): string | null {
  try {
    const canvas = map.getCanvas?.();
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width < 4 || canvas.height < 4) return null;
    const w = canvas.width;
    const h = canvas.height;
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    const ctx = c.getContext('2d');
    if (!ctx) return canvas.toDataURL('image/png');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(canvas, 0, 0);
    return c.toDataURL('image/png');
  } catch {
    return null;
  }
}

export type SiLiveMapSnapshotOptions = {
  /** ISO date (YYYY-MM-DD) — parent should apply WMS / timeline before capture. */
  date?: string;
  scale?: number;
};

export type SiLiveMapSnapshotCapture = (opts?: SiLiveMapSnapshotOptions) => Promise<string | null>;
