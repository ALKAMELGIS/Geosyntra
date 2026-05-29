import type { Map as MapboxMap } from 'mapbox-gl';
import { enforceSiFrozenMapViewport, isSiViewportChangeBlocked } from './siMapCaptureSession';

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

/** Wait for the next Mapbox GL paint (basemap + rasters committed to the WebGL buffer). */
export function waitForNextMapRender(map: MapboxMap, timeoutMs = 6000): Promise<void> {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        map.off('render', onRender);
      } catch {
        /* ignore */
      }
      resolve();
    };
    const onRender = () => finish();
    try {
      map.on('render', onRender);
      map.triggerRepaint?.();
    } catch {
      finish();
      return;
    }
    window.setTimeout(finish, timeoutMs);
  });
}

function listStyleSourceIds(map: MapboxMap): string[] {
  try {
    const sources = map.getStyle()?.sources ?? {};
    return Object.keys(sources);
  } catch {
    return [];
  }
}

/** Raster overlays (Sentinel Hub WMS, per-AOI stacks, legacy sentinel-source). */
export function isSiMapIndexRasterSourceId(id: string): boolean {
  const lid = id.toLowerCase();
  return (
    lid.includes('sentinel') ||
    lid.startsWith('si-sentinel') ||
    lid.includes('wms') ||
    lid.startsWith('si-wms') ||
    lid === 'sentinel-source'
  );
}

/** Poll until raster sources (basemap + WMS) report loaded, then idle + tiles. */
/** Corners + center must show non-black pixels (basemap painted). */
export function isSnapshotCanvasLikelyHasBasemap(canvas: HTMLCanvasElement): boolean | null {
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const w = canvas.width;
    const h = canvas.height;
    if (w < 8 || h < 8) return false;
    const points = [
      [w * 0.12, h * 0.12],
      [w * 0.88, h * 0.12],
      [w * 0.12, h * 0.88],
      [w * 0.88, h * 0.88],
      [w * 0.5, h * 0.5],
    ];
    let bright = 0;
    for (const [x, y] of points) {
      const d = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      const luma = 0.299 * d[0]! + 0.587 * d[1]! + 0.114 * d[2]!;
      if (luma > 22) bright++;
    }
    return bright >= 3;
  } catch {
    return null;
  }
}

/** Mapbox raster layer ids for Sentinel Hub index overlays (live WMS stack). */
export function listIndexRasterLayerIds(map: MapboxMap): string[] {
  try {
    const layers = map.getStyle()?.layers ?? [];
    return layers
      .filter(
        l =>
          l.type === 'raster' &&
          (l.id === 'sentinel-layer' || l.id.startsWith('si-sentinel-layer-')),
      )
      .map(l => l.id);
  } catch {
    return [];
  }
}

/** Ensure index rasters are not hidden before canvas export (React re-render can flip visibility). */
export function ensureIndexRasterLayersVisible(map: MapboxMap): void {
  for (const layerId of listIndexRasterLayerIds(map)) {
    try {
      const vis = map.getLayoutProperty(layerId, 'visibility');
      if (vis === 'none') map.setLayoutProperty(layerId, 'visibility', 'visible');
    } catch {
      /* ignore */
    }
  }
}

export function areIndexRasterSourcesLoaded(map: MapboxMap): boolean {
  const ids = listStyleSourceIds(map).filter(isSiMapIndexRasterSourceId);
  if (!ids.length) return false;
  return ids.every(id => {
    try {
      return map.isSourceLoaded(id);
    } catch {
      return true;
    }
  });
}

export type RgbSample = { r: number; g: number; b: number };

/** Classified index overlays add saturated reds/yellows/greens on top of natural imagery. */
function isClassifiedIndexPixel(r: number, g: number, b: number): boolean {
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luma < 24) return false;
  if (r > 160 && g < 105 && b < 105) return true;
  if (r > 200 && g > 175 && b < 135) return true;
  if (g > 155 && r < 95 && b < 95) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min >= 52 && luma >= 28;
}

export function scoreIndexOverlayPixelSamples(samples: readonly RgbSample[]): {
  lumaHits: number;
  chromaHits: number;
} {
  let chromaHits = 0;
  let lumaHits = 0;
  for (const { r, g, b } of samples) {
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luma < 18) continue;
    lumaHits++;
    if (isClassifiedIndexPixel(r, g, b)) chromaHits++;
  }
  return { lumaHits, chromaHits };
}

export function indexOverlayLikelyFromSamples(samples: readonly RgbSample[]): boolean {
  const { lumaHits, chromaHits } = scoreIndexOverlayPixelSamples(samples);
  if (lumaHits < 6) return false;
  return chromaHits >= 6;
}

/**
 * Heuristic: classified index overlays add saturated reds/yellows/greens on top of natural imagery.
 * Returns null when canvas cannot be read (tainted / WebGL).
 */
export function isSnapshotCanvasLikelyHasIndexOverlay(canvas: HTMLCanvasElement): boolean | null {
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const w = canvas.width;
    const h = canvas.height;
    if (w < 16 || h < 16) return false;

    const x0 = Math.floor(w * 0.22);
    const y0 = Math.floor(h * 0.22);
    const x1 = Math.floor(w * 0.78);
    const y1 = Math.floor(h * 0.78);
    const cols = 9;
    const rows = 9;
    const samples: RgbSample[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = x0 + Math.floor(((col + 0.5) / cols) * (x1 - x0));
        const y = y0 + Math.floor(((row + 0.5) / rows) * (y1 - y0));
        const d = ctx.getImageData(x, y, 1, 1).data;
        samples.push({ r: d[0]!, g: d[1]!, b: d[2]! });
      }
    }
    return indexOverlayLikelyFromSamples(samples);
  } catch {
    return null;
  }
}

export type WaitUntilLayerRenderedOpts = {
  /** Total budget for source + paint + optional index verification. */
  timeoutMs?: number;
  idlePasses?: number;
  /** Poll canvas until index-like pixels appear (live WMS / classified ramp). */
  requireIndexOverlay?: boolean;
  /** Shorter waits for change-detection grid slots. */
  batchSlot?: boolean;
};

/**
 * Unified pre-export wait: idle → tiles → render → WebGL flush (+ optional index canvas verify).
 * Use for report snapshots, timeline capture, and live map export.
 */
export async function waitUntilLayerRendered(
  map: MapboxMap,
  opts?: WaitUntilLayerRenderedOpts,
): Promise<void> {
  const batch = opts?.batchSlot === true;
  const timeoutMs = opts?.timeoutMs ?? (batch ? 5200 : 15000);
  const idlePasses = Math.max(1, opts?.idlePasses ?? (batch ? 1 : 2));
  const requireIndex = opts?.requireIndexOverlay === true;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const stabilize = async (): Promise<void> => {
    ensureIndexRasterLayersVisible(map);
    try {
      map.triggerRepaint?.();
    } catch {
      /* ignore */
    }
    await waitForMapboxStableFrame(map, {
      idlePasses,
      idleTimeoutMs: Math.min(9000, timeoutMs),
      tilesTimeoutMs: Math.min(6500, timeoutMs),
    });
    await waitForAllMapSourcesReady(map, Math.min(12000, timeoutMs));
    await waitForVisibleMapLayersReady(map, {
      timeoutMs: Math.min(batch ? 900 : 2200, timeoutMs),
      wmsTimeoutMs: Math.min(batch ? 720 : 1800, timeoutMs),
    });
    await flushMapboxPaint();
  };

  await stabilize();

  if (!requireIndex) return;

  const deadline = t0 + timeoutMs;
  while ((typeof performance !== 'undefined' ? performance.now() : Date.now()) < deadline) {
    const canvas = map.getCanvas?.();
    if (canvas instanceof HTMLCanvasElement) {
      const hasIndex = isSnapshotCanvasLikelyHasIndexOverlay(canvas);
      if (hasIndex === true) return;
      if (hasIndex === null && areIndexRasterSourcesLoaded(map)) return;
    } else if (areIndexRasterSourcesLoaded(map)) {
      return;
    }
    await stabilize();
    await new Promise<void>(r => window.setTimeout(r, batch ? 140 : 260));
  }
}

/** Visible WMS / index overlays only — short poll, no basemap reload, no off-viewport tiles. */
export async function waitForVisibleMapLayersReady(
  map: MapboxMap,
  opts?: { timeoutMs?: number; wmsTimeoutMs?: number },
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 900;
  const wmsTimeoutMs = opts?.wmsTimeoutMs ?? 700;
  const wmsIds = listStyleSourceIds(map).filter(isSiMapIndexRasterSourceId);
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const pollWms = async (): Promise<void> => {
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    if (elapsed >= wmsTimeoutMs || !wmsIds.length) return;
    const ready = wmsIds.every(id => {
      try {
        return map.isSourceLoaded(id);
      } catch {
        return true;
      }
    });
    if (ready) return;
    await new Promise<void>(r => window.setTimeout(r, 40));
    return pollWms();
  };
  await pollWms();
  const areTilesLoaded = (map as unknown as { areTilesLoaded?: () => boolean }).areTilesLoaded;
  if (typeof areTilesLoaded === 'function') {
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    while ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t1 < Math.min(500, timeoutMs)) {
      try {
        if (areTilesLoaded.call(map)) break;
      } catch {
        break;
      }
      await new Promise<void>(r => window.setTimeout(r, 36));
    }
  }
  await waitForNextMapRender(map, Math.min(420, timeoutMs));
  await flushMapboxPaint();
}

export async function waitForAllMapSourcesReady(map: MapboxMap, timeoutMs = 9000): Promise<void> {
  if (isSiViewportChangeBlocked()) enforceSiFrozenMapViewport(map);
  const rasterIds = listStyleSourceIds(map).filter(id => {
    try {
      const t = map.getStyle()?.sources?.[id] as { type?: string } | undefined;
      return t?.type === 'raster';
    } catch {
      return false;
    }
  });
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const poll = async (): Promise<void> => {
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    if (elapsed >= timeoutMs) return;
    const ready =
      rasterIds.length === 0 ||
      rasterIds.every(id => {
        try {
          return map.isSourceLoaded(id);
        } catch {
          return true;
        }
      });
    if (ready) return;
    await new Promise<void>(r => window.setTimeout(r, 48));
    return poll();
  };
  await poll();
  await waitForMapboxIdle(map, Math.min(5000, timeoutMs));
  await waitForMapboxTilesPainted(map, Math.min(4500, timeoutMs));
  await waitForNextMapRender(map, Math.min(4000, timeoutMs));
  await flushMapboxPaint();
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
    if (s <= 1) {
      return canvas.toDataURL('image/png');
    }
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
  /**
   * When false, export the full map frame (basemap + index) and draw AOI outline only.
   * Avoids black letterboxing outside the AOI mask in reports.
   */
  maskToAoi?: boolean;
  /**
   * `export-fast` — canvas grab + visible WMS wait (change detection).
   * `export-quality` — one extra visible-layer pass (single AOI); still no full freeze.
   */
  captureMode?: 'export-fast' | 'export-quality';
  /** Default true — set false when parent already paused timeline for a batch. */
  pauseTimeline?: boolean;
  /** Default true — set false between change-detection slots. */
  resumeTimeline?: boolean;
  /** Time-series slot in a batch — faster WMS wait. */
  batchSlot?: boolean;
  /** Do not hide the report modal for this frame (batch handles visibility once). */
  suppressModalChrome?: boolean;
  /** Wait for Sentinel Hub / index rasters on the WebGL canvas (default true for live export). */
  requireIndexLayer?: boolean;
  /** Parent hook: e.g. force WMS overlay visible before capture. */
  prepareMap?: () => void | Promise<void>;
};

export type SiLiveMapSnapshotCapture = (opts?: SiLiveMapSnapshotOptions) => Promise<string | null>;
