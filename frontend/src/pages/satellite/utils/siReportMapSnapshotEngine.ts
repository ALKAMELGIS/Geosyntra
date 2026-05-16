import type { Map as MapboxMap } from 'mapbox-gl';
import {
  clipMapSnapshotToAoiFeature,
  fitMapToLngLatBounds,
  projectAoiRingsForSnapshot,
} from './siMapSnapshotAoiClip';
import { runSiMapCaptureSession } from './siMapCaptureSession';
import {
  captureMapboxCanvasPng,
  flushMapboxPaint,
  waitForAllMapSourcesReady,
  waitForMapboxIdle,
  waitForMapboxTilesPainted,
  waitForNextMapRender,
} from './siMapViewerSnapshot';

export type SiReportMapSnapshotProfile = 'fast' | 'balanced' | 'quality';

const PROFILE_PRESETS: Record<
  SiReportMapSnapshotProfile,
  {
    idlePasses: number;
    idleTimeoutMs: number;
    tilesTimeoutMs: number;
    sourcesTimeoutMs: number;
    wmsWaitMs: number;
    dateSettleMs: number;
    rasterFadeSettleMs: number;
    maxAttempts: number;
  }
> = {
  fast: {
    idlePasses: 1,
    idleTimeoutMs: 2800,
    tilesTimeoutMs: 2200,
    sourcesTimeoutMs: 5000,
    wmsWaitMs: 2800,
    dateSettleMs: 200,
    rasterFadeSettleMs: 480,
    maxAttempts: 4,
  },
  balanced: {
    idlePasses: 2,
    idleTimeoutMs: 5200,
    tilesTimeoutMs: 3800,
    sourcesTimeoutMs: 8000,
    wmsWaitMs: 4500,
    dateSettleMs: 280,
    rasterFadeSettleMs: 560,
    maxAttempts: 3,
  },
  quality: {
    idlePasses: 3,
    idleTimeoutMs: 10000,
    tilesTimeoutMs: 6500,
    sourcesTimeoutMs: 12000,
    wmsWaitMs: 7500,
    dateSettleMs: 360,
    rasterFadeSettleMs: 640,
    maxAttempts: 4,
  },
};

export type SiReportMapSnapshotRequest = {
  date?: string;
  scale?: number;
  fitBounds?: [[number, number], [number, number]];
  aoiFeature?: GeoJSON.Feature;
  outlineColor?: string;
  profile?: SiReportMapSnapshotProfile;
  applyDate?: (iso: string) => void | Promise<void>;
  freezeViewport?: boolean;
};

export function setReportMapCaptureMode(active: boolean): void {
  try {
    document.body.classList.toggle('si-report-map-capture-active', active);
  } catch {
    /* ignore */
  }
}

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
      return t === 'raster';
    });
  } catch {
    return [];
  }
}

export async function waitForWmsRasterSourcesReady(map: MapboxMap, timeoutMs: number): Promise<void> {
  const ids = listRasterSourceIds(map).filter(
    id => id.includes('sentinel') || id.startsWith('si-sentinel'),
  );
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
    if (ready) return;
    await new Promise<void>(r => window.setTimeout(r, 56));
    return poll();
  };
  await poll();
}

export function isSnapshotCanvasLikelyBlank(canvas: HTMLCanvasElement): boolean | null {
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const w = canvas.width;
    const h = canvas.height;
    if (w < 8 || h < 8) return true;
    const samples = 49;
    let sum = 0;
    let sumSq = 0;
    let maxLuma = 0;
    for (let i = 0; i < samples; i++) {
      const x = Math.floor(((i % 7) + 0.5) * (w / 7));
      const y = Math.floor((Math.floor(i / 7) + 0.5) * (h / 7));
      const d = ctx.getImageData(x, y, 1, 1).data;
      const luma = 0.299 * d[0]! + 0.587 * d[1]! + 0.114 * d[2]!;
      sum += luma;
      sumSq += luma * luma;
      maxLuma = Math.max(maxLuma, luma);
    }
    const mean = sum / samples;
    const variance = sumSq / samples - mean * mean;
    if (maxLuma < 18 && mean < 12) return true;
    return mean < 10 && variance < 90;
  } catch {
    return null;
  }
}

async function waitForReportMapFrame(
  map: MapboxMap,
  profile: SiReportMapSnapshotProfile,
): Promise<void> {
  const p = PROFILE_PRESETS[profile];
  await new Promise<void>(r => window.setTimeout(r, p.rasterFadeSettleMs));
  for (let i = 0; i < p.idlePasses; i++) {
    await waitForAllMapSourcesReady(map, p.sourcesTimeoutMs);
    await waitForMapboxIdle(map, p.idleTimeoutMs);
    await waitForMapboxTilesPainted(map, p.tilesTimeoutMs);
    await waitForWmsRasterSourcesReady(map, p.wmsWaitMs);
    try {
      map.triggerRepaint?.();
    } catch {
      /* ignore */
    }
    await waitForNextMapRender(map, Math.min(5000, p.idleTimeoutMs));
    await flushMapboxPaint();
  }
}

async function tryCaptureFrame(map: MapboxMap, scale: number): Promise<string | null> {
  await waitForNextMapRender(map, 4000);
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

export async function captureSiReportMapSnapshot(
  map: MapboxMap,
  opts?: SiReportMapSnapshotRequest,
): Promise<string | null> {
  const freeze = opts?.freezeViewport === true;
  const profile = freeze ? 'quality' : (opts?.profile ?? 'balanced');
  const preset = PROFILE_PRESETS[profile];
  const scale = Math.min(4, Math.max(2, opts?.scale ?? 3));

  if (!prepareMapboxMapForSnapshot(map)) return null;

  return runSiMapCaptureSession(map, async () => {
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

      const projectedRings =
        opts?.aoiFeature?.geometry != null
          ? projectAoiRingsForSnapshot(map, opts.aoiFeature, scale)
          : undefined;

      let raw: string | null = null;
      for (let attempt = 0; attempt < preset.maxAttempts; attempt++) {
        if (attempt > 0) {
          await waitForReportMapFrame(map, profile);
        }
        raw = await tryCaptureFrame(map, scale);
        if (raw) break;
      }
      if (!raw) return null;

      if (opts?.aoiFeature?.geometry) {
        return await clipMapSnapshotToAoiFeature(map, raw, opts.aoiFeature, {
          outlineColor: opts.outlineColor ?? 'rgba(34, 197, 94, 0.95)',
          projectedRings,
          skipOutlineStroke: true,
          imageScale: scale,
        });
      }
      return raw;
    } finally {
      setReportMapCaptureMode(false);
    }
  });
}
