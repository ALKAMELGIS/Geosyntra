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
 * WMS / raster overlays often need more than one idle pass before the canvas is complete.
 */
export async function waitForMapboxStableFrame(
  map: MapboxMap,
  opts?: { idlePasses?: number; idleTimeoutMs?: number; tilesTimeoutMs?: number },
): Promise<void> {
  const passes = Math.max(1, opts?.idlePasses ?? 2);
  const idleTimeout = opts?.idleTimeoutMs ?? 7200;
  const tilesTimeout = opts?.tilesTimeoutMs ?? 4200;
  for (let i = 0; i < passes; i++) {
    await waitForMapboxIdle(map, idleTimeout);
    await waitForMapboxTilesPainted(map, tilesTimeout);
    try {
      map.triggerRepaint?.();
    } catch {
      /* ignore */
    }
    await flushMapboxPaint();
  }
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
 * Idle → tiles loaded → repaint → rAF (×2 passes), then PNG. Use for AOI report / export snapshots.
 */
export async function captureMapboxCanvasWhenReady(
  map: MapboxMap,
  opts?: { scale?: number; idleTimeoutMs?: number; tilesTimeoutMs?: number; idlePasses?: number },
): Promise<string | null> {
  const scale = Math.min(4, Math.max(1, opts?.scale ?? 2));
  await waitForMapboxStableFrame(map, {
    idlePasses: opts?.idlePasses ?? 2,
    idleTimeoutMs: opts?.idleTimeoutMs ?? 9000,
    tilesTimeoutMs: opts?.tilesTimeoutMs ?? 5500,
  });
  return captureMapboxCanvasPng(map, scale);
}

/** Hi-res PNG from the live Mapbox canvas (requires `preserveDrawingBuffer` on MapGL). */
export function captureMapboxCanvasPng(map: MapboxMap, scale = 2): string | null {
  try {
    const canvas = map.getCanvas?.();
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width < 4 || canvas.height < 4) return null;
    const w = canvas.width;
    const h = canvas.height;
    const s = Math.min(4, Math.max(1, scale));
    const c = document.createElement('canvas');
    c.width = Math.round(w * s);
    c.height = Math.round(h * s);
    const ctx = c.getContext('2d');
    if (!ctx) return canvas.toDataURL('image/png');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } catch {
    return null;
  }
}

export type SiLiveMapSnapshotOptions = {
  /** ISO date (YYYY-MM-DD) — parent should apply WMS / timeline before capture. */
  date?: string;
  /** Output scale factor 1–4 (device pixel ratio is already on the map canvas). */
  scale?: number;
  /** Fit viewport to AOI bounds before capture (lng/lat corners). */
  fitBounds?: [[number, number], [number, number]];
  /** Clip raster to this AOI feature after capture (requires map projection at capture time). */
  aoiFeature?: GeoJSON.Feature;
  /** Capture readiness profile (default balanced). */
  profile?: 'fast' | 'balanced' | 'quality';
  /**
   * Capture the current map frame only — no timeline date jump, no fitBounds.
   * Use for report preview so the live viewer and snapshot stay aligned.
   */
  freezeViewport?: boolean;
  /** When shifting `date` for multi-frame capture, skip restoring the viewer date until the last call. */
  skipTimelineRestore?: boolean;
};

export type SiLiveMapSnapshotCapture = (opts?: SiLiveMapSnapshotOptions) => Promise<string | null>;
