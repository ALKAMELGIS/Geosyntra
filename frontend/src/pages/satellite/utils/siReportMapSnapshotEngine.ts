import type { Map as MapboxMap } from 'mapbox-gl';
import { clipMapSnapshotToAoiFeature, fitMapToLngLatBounds } from './siMapSnapshotAoiClip';
import {
  captureMapboxCanvasPng,
  flushMapboxPaint,
  waitForMapboxIdle,
  waitForMapboxTilesPainted,
} from './siMapViewerSnapshot';

export type SiReportMapSnapshotProfile = 'fast' | 'balanced' | 'quality';

const PROFILE_PRESETS: Record<
  SiReportMapSnapshotProfile,
  { idlePasses: number; idleTimeoutMs: number; tilesTimeoutMs: number; wmsWaitMs: number; dateSettleMs: number; maxAttempts: number }
> = {
  fast: { idlePasses: 1, idleTimeoutMs: 2200, tilesTimeoutMs: 1400, wmsWaitMs: 2000, dateSettleMs: 160, maxAttempts: 4 },
  balanced: { idlePasses: 2, idleTimeoutMs: 4200, tilesTimeoutMs: 2600, wmsWaitMs: 3600, dateSettleMs: 220, maxAttempts: 3 },
  quality: { idlePasses: 2, idleTimeoutMs: 8000, tilesTimeoutMs: 5200, wmsWaitMs: 6500, dateSettleMs: 320, maxAttempts: 2 },
};

export type SiReportMapSnapshotRequest = {
  /** ISO date (YYYY-MM-DD) — caller applies WMS / timeline before capture when provided. */
  date?: string;
  scale?: number;
  fitBounds?: [[number, number], [number, number]];
  aoiFeature?: GeoJSON.Feature;
  outlineColor?: string;
  profile?: SiReportMapSnapshotProfile;
  /** Called when `date` differs from the viewer — must update WMS/time and resolve when scheduled. */
  applyDate?: (iso: string) => void | Promise<void>;
  /** Current viewer frame only (no timeline / camera changes). */
  freezeViewport?: boolean;
};

/** Briefly hide the report modal so the live Mapbox canvas keeps painting (avoids throttled blank frames). */
export function setReportMapCaptureMode(active: boolean): void {
  try {
    document.body.classList.toggle('si-report-map-capture-active', active);
  } catch {
    /* ignore */
  }
}

/** Ensure the map canvas has a real layout size and the style is loaded. */
export function prepareMapboxMapForSnapshot(map: MapboxMap): boolean {
  try {
    map.resize();
    map.triggerRepaint?.();
  } catch {
    /* ignore */
  }
  try {
    const canvas = map.getCanvas?.();
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    return canvas.width >= 8 && canvas.height >= 8;
  } catch {
    return false;
  }
}

function listRasterSourceIds(map: MapboxMap): string[] {
  try {
    const sources = map.getStyle()?.sources ?? {};
    return Object.keys(sources).filter(id => {
      const t = (sources as Record<string, { type?: string }>)[id]?.type;
      return t === 'raster' && (id.includes('sentinel') || id.startsWith('si-sentinel'));
    });
  } catch {
    return [];
  }
}

/** Wait for Sentinel Hub WMS raster sources (NDVI etc.) after a date/layer change. */
export async function waitForWmsRasterSourcesReady(map: MapboxMap, timeoutMs: number): Promise<void> {
  const ids = listRasterSourceIds(map);
  if (!ids.length) return;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const poll = async (): Promise<void> => {
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    if (elapsed >= timeoutMs) return;
    const ready = ids.every(id => {
      try {
        return map.isSourceLoaded(id);
      } catch {
        return true;
      }
    });
    if (ready) {
      await waitForMapboxIdle(map, Math.min(1800, timeoutMs));
      await waitForMapboxTilesPainted(map, Math.min(1600, timeoutMs));
      await flushMapboxPaint();
      return;
    }
    await new Promise<void>(r => window.setTimeout(r, 56));
    return poll();
  };
  await poll();
}

async function waitForReportMapFrame(
  map: MapboxMap,
  profile: SiReportMapSnapshotProfile,
): Promise<void> {
  const p = PROFILE_PRESETS[profile];
  for (let i = 0; i < p.idlePasses; i++) {
    await waitForMapboxIdle(map, p.idleTimeoutMs);
    await waitForMapboxTilesPainted(map, p.tilesTimeoutMs);
    try {
      map.triggerRepaint?.();
    } catch {
      /* ignore */
    }
    await flushMapboxPaint();
  }
  await waitForWmsRasterSourcesReady(map, p.wmsWaitMs);
}

/**
 * Heuristic: reject empty / failed WebGL readbacks (uniform near-black frame).
 * May return false when canvas is tainted — caller treats as "unknown, accept".
 */
export function isSnapshotCanvasLikelyBlank(canvas: HTMLCanvasElement): boolean | null {
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const w = canvas.width;
    const h = canvas.height;
    if (w < 8 || h < 8) return true;
    const samples = 36;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < samples; i++) {
      const x = Math.floor(((i % 6) + 0.5) * (w / 6));
      const y = Math.floor((Math.floor(i / 6) + 0.5) * (h / 6));
      const d = ctx.getImageData(x, y, 1, 1).data;
      const luma = 0.299 * d[0]! + 0.587 * d[1]! + 0.114 * d[2]!;
      sum += luma;
      sumSq += luma * luma;
    }
    const mean = sum / samples;
    const variance = sumSq / samples - mean * mean;
    return mean < 10 && variance < 90;
  } catch {
    return null;
  }
}

async function tryCaptureFrame(map: MapboxMap, scale: number): Promise<string | null> {
  await flushMapboxPaint();
  const png = captureMapboxCanvasPng(map, scale);
  if (!png || png.length < 800) return null;
  try {
    const canvas = map.getCanvas?.();
    if (canvas instanceof HTMLCanvasElement) {
      const blank = isSnapshotCanvasLikelyBlank(canvas);
      if (blank === true) return null;
    }
  } catch {
    /* ignore */
  }
  return png;
}

/**
 * Drop-in capture: AOI fit → WMS/NDVI readiness (fast poll) → hi-res PNG → optional AOI clip.
 */
export async function captureSiReportMapSnapshot(
  map: MapboxMap,
  opts?: SiReportMapSnapshotRequest,
): Promise<string | null> {
  const freeze = opts?.freezeViewport === true;
  const profile = freeze ? 'fast' : (opts?.profile ?? 'balanced');
  const preset = PROFILE_PRESETS[profile];
  const scale = Math.min(4, Math.max(2, opts?.scale ?? 3));

  if (!prepareMapboxMapForSnapshot(map)) return null;

  setReportMapCaptureMode(true);
  try {
    if (!freeze && opts?.fitBounds) {
      try {
        fitMapToLngLatBounds(map, opts.fitBounds, 56);
        await waitForReportMapFrame(map, profile);
      } catch {
        /* ignore fit */
      }
    }

    if (!freeze && opts?.date && opts.applyDate) {
      await Promise.resolve(opts.applyDate(opts.date.slice(0, 10)));
      await new Promise<void>(r => window.setTimeout(r, preset.dateSettleMs));
      await waitForReportMapFrame(map, profile);
    } else {
      await waitForReportMapFrame(map, profile);
    }

    let raw: string | null = null;
    for (let attempt = 0; attempt < preset.maxAttempts; attempt++) {
      if (attempt > 0) {
        await waitForMapboxIdle(map, Math.min(2800, preset.idleTimeoutMs));
        await waitForMapboxTilesPainted(map, Math.min(1800, preset.tilesTimeoutMs));
        await waitForWmsRasterSourcesReady(map, Math.min(2400, preset.wmsWaitMs));
      }
      raw = await tryCaptureFrame(map, scale);
      if (raw) break;
    }
    if (!raw) return null;

    if (opts?.aoiFeature?.geometry) {
      return await clipMapSnapshotToAoiFeature(map, raw, opts.aoiFeature, {
        outlineColor: opts.outlineColor ?? 'rgba(34, 197, 94, 0.95)',
      });
    }
    return raw;
  } finally {
    setReportMapCaptureMode(false);
  }
}
