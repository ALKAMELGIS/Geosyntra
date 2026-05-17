import type { Map as MapboxMap } from 'mapbox-gl';
import type { SiAoiProjectedRing } from './siMapSnapshotAoiClip';
import {
  clipMapSnapshotToAoiFeature,
  fitMapToLngLatBounds,
  projectAoiRingsForSnapshot,
} from './siMapSnapshotAoiClip';
import { runLightSnapshotLock } from './siMapCaptureSession';
import {
  captureMapboxCanvasPng,
  flushMapboxPaint,
  isSnapshotCanvasLikelyHasBasemap,
  waitForVisibleMapLayersReady,
} from './siMapViewerSnapshot';

export type SiReportMapSnapshotProfile = 'fast' | 'balanced' | 'quality';

export type SiReportCaptureMode = 'export-fast' | 'export-quality';

export type SiReportMapSnapshotRequest = {
  date?: string;
  scale?: number;
  fitBounds?: [[number, number], [number, number]];
  aoiFeature?: GeoJSON.Feature;
  outlineColor?: string;
  profile?: SiReportMapSnapshotProfile;
  applyDate?: (iso: string) => void | Promise<void>;
  freezeViewport?: boolean;
  maskToAoi?: boolean;
  captureMode?: SiReportCaptureMode;
  /** Time-series grid slot — shorter WMS wait (target ~400–500 ms / frame). */
  batchSlot?: boolean;
  /** Keep report modal visible (avoids 12× hide/show flicker during change-detection batch). */
  suppressModalChrome?: boolean;
};

let reportMapCaptureSessionDepth = 0;

export function setReportMapCaptureMode(active: boolean): void {
  if (active) reportMapCaptureSessionDepth += 1;
  else reportMapCaptureSessionDepth = Math.max(0, reportMapCaptureSessionDepth - 1);
  try {
    document.body.classList.toggle('si-report-map-capture-active', reportMapCaptureSessionDepth > 0);
  } catch {
    /* ignore */
  }
}

/** One modal hide for an entire change-detection batch (not per slot). */
export function beginReportMapCaptureBatch(): void {
  setReportMapCaptureMode(true);
}

export function endReportMapCaptureBatch(): void {
  setReportMapCaptureMode(false);
}

export function isSnapshotCanvasLikelyBlank(canvas: HTMLCanvasElement): boolean | null {
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const w = canvas.width;
    const h = canvas.height;
    if (w < 8 || h < 8) return true;
    let sum = 0;
    let maxLuma = 0;
    for (let i = 0; i < 25; i++) {
      const x = Math.floor(((i % 5) + 0.5) * (w / 5));
      const y = Math.floor((Math.floor(i / 5) + 0.5) * (h / 5));
      const d = ctx.getImageData(x, y, 1, 1).data;
      const luma = 0.299 * d[0]! + 0.587 * d[1]! + 0.114 * d[2]!;
      sum += luma;
      maxLuma = Math.max(maxLuma, luma);
    }
    const mean = sum / 25;
    if (maxLuma < 18 && mean < 12) return true;
    return mean < 8;
  } catch {
    return null;
  }
}

function prepareCanvasForExport(map: MapboxMap): boolean {
  try {
    const canvas = map.getCanvas?.();
    return canvas instanceof HTMLCanvasElement && canvas.width >= 8 && canvas.height >= 8;
  } catch {
    return false;
  }
}

type CaptureFrameResult = {
  png: string;
  projectedRings?: SiAoiProjectedRing[];
};

async function captureCurrentCanvasFrame(
  map: MapboxMap,
  scale: number,
  aoiFeature?: GeoJSON.Feature,
  opts?: { requireBasemap?: boolean },
): Promise<CaptureFrameResult | null> {
  await flushMapboxPaint();

  const canvas = map.getCanvas();
  if (!canvas.width || !canvas.height) return null;

  const imgW = scale <= 1 ? canvas.width : Math.round(canvas.width * scale);
  const imgH = scale <= 1 ? canvas.height : Math.round(canvas.height * scale);
  const projectedRings =
    aoiFeature?.geometry != null ? projectAoiRingsForSnapshot(map, aoiFeature, imgW, imgH) : undefined;

  const png = captureMapboxCanvasPng(map, scale);
  if (!png || png.length < 800) return null;

  if (isSnapshotCanvasLikelyBlank(canvas) === true) return null;
  if (opts?.requireBasemap !== false && isSnapshotCanvasLikelyHasBasemap(canvas) === false) {
    return null;
  }

  return { png, projectedRings };
}

function finishAoiSnapshot(
  map: MapboxMap,
  raw: string,
  aoiFeature: GeoJSON.Feature,
  projectedRings: SiAoiProjectedRing[] | undefined,
  maskToAoi: boolean,
  outlineColor: string,
): Promise<string> {
  if (!maskToAoi) {
    // WMS + AOI outline are already on the Mapbox canvas; re-projecting rings causes visible drift in PDF.
    return Promise.resolve(raw);
  }
  return clipMapSnapshotToAoiFeature(map, raw, aoiFeature, {
    outlineColor,
    projectedRings,
    skipOutlineStroke: true,
  });
}

async function captureExportFast(map: MapboxMap, opts: SiReportMapSnapshotRequest): Promise<string | null> {
  const scale = 1;
  const maskToAoi = opts.maskToAoi ?? false;
  const outline = opts.outlineColor ?? 'rgba(34, 197, 94, 0.95)';
  const needsDate = Boolean(opts.date && opts.applyDate);
  const batch = opts.batchSlot === true;
  const wmsWait = batch
    ? { timeoutMs: 360, wmsTimeoutMs: 280 }
    : { timeoutMs: 650, wmsTimeoutMs: 520 };
  const idleWait = batch
    ? { timeoutMs: 220, wmsTimeoutMs: 160 }
    : { timeoutMs: 280, wmsTimeoutMs: 200 };

  return runLightSnapshotLock(async () => {
    const manageModal = opts.suppressModalChrome !== true;
    if (manageModal) setReportMapCaptureMode(true);
    try {
      if (!prepareCanvasForExport(map)) return null;

      if (opts.fitBounds) {
        try {
          fitMapToLngLatBounds(map, opts.fitBounds, 56);
          await waitForVisibleMapLayersReady(map, wmsWait);
        } catch {
          /* ignore */
        }
      }

      if (needsDate && opts.date && opts.applyDate) {
        await Promise.resolve(opts.applyDate(opts.date.slice(0, 10)));
        await waitForVisibleMapLayersReady(map, wmsWait);
      } else {
        await waitForVisibleMapLayersReady(map, idleWait);
      }

      const captured = await captureCurrentCanvasFrame(map, scale, opts.aoiFeature, {
        requireBasemap: !needsDate,
      });
      if (!captured) return null;

      if (!opts.aoiFeature?.geometry) return captured.png;
      return finishAoiSnapshot(map, captured.png, opts.aoiFeature, captured.projectedRings, maskToAoi, outline);
    } finally {
      if (manageModal) setReportMapCaptureMode(false);
    }
  });
}

async function captureExportQuality(map: MapboxMap, opts: SiReportMapSnapshotRequest): Promise<string | null> {
  const scale = 1;
  const maskToAoi = opts.maskToAoi ?? false;
  const outline = opts.outlineColor ?? 'rgba(34, 197, 94, 0.95)';

  const manageModal = opts.suppressModalChrome !== true;
  return runLightSnapshotLock(async () => {
    if (manageModal) setReportMapCaptureMode(true);
    try {
      if (!prepareCanvasForExport(map)) return null;
      await waitForVisibleMapLayersReady(map, { timeoutMs: 1100, wmsTimeoutMs: 900 });

      let captured = await captureCurrentCanvasFrame(map, scale, opts.aoiFeature);
      if (!captured) {
        await waitForVisibleMapLayersReady(map, { timeoutMs: 500, wmsTimeoutMs: 400 });
        captured = await captureCurrentCanvasFrame(map, scale, opts.aoiFeature);
      }
      if (!captured) return null;

      if (!opts.aoiFeature?.geometry) return captured.png;
      return finishAoiSnapshot(map, captured.png, opts.aoiFeature, captured.projectedRings, maskToAoi, outline);
    } finally {
      if (manageModal) setReportMapCaptureMode(false);
    }
  });
}

export async function captureSiReportMapSnapshot(
  map: MapboxMap,
  opts?: SiReportMapSnapshotRequest,
): Promise<string | null> {
  const mode: SiReportCaptureMode =
    opts?.captureMode ?? (opts?.freezeViewport ? 'export-quality' : 'export-fast');

  if (mode === 'export-quality' && opts?.freezeViewport) {
    return captureExportQuality(map, opts);
  }
  return captureExportFast(map, opts ?? {});
}

export async function waitForWmsRasterSourcesReady(map: MapboxMap, timeoutMs: number): Promise<void> {
  await waitForVisibleMapLayersReady(map, { wmsTimeoutMs: timeoutMs, timeoutMs: Math.min(900, timeoutMs) });
}

export function prepareMapboxMapForSnapshot(map: MapboxMap): boolean {
  return prepareCanvasForExport(map);
}
