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
