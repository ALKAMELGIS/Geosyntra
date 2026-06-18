import type { Map as MapboxMap } from 'mapbox-gl';
import { clipMapSnapshotToAoiFeature } from './siMapSnapshotAoiClip';
import { waitForMapboxRasterSettle } from './siMapRenderSync';
import { siAoiReportFeatureBBoxLngLat } from './siAoiReportGeo';
import {
  captureSiReportMapSnapshot,
  waitForWmsRasterSourcesReady,
} from './siReportMapSnapshotEngine';
import { fetchWmsClippedIndexRaster } from '../../../lib/wmsAoiLiveIndexSample';
import {
  encodeFloat32GeoTiff4326,
  encodeRgbGeoTiff4326,
  rgbaToRgbInterleaved,
  type GeoTiff4326BBox,
} from './writeRgbGeoTiff4326';

export type RasterMapCoordinates = [[number, number], [number, number], [number, number], [number, number]];

export const EXPORT_AOI_GEOTIFF_LAYER_NAME = 'Exported AOI GeoTIFF';
export const EXTRACT_SOURCE_RASTER_LAYER_PREFIX = 'Source raster';

export type ExtractMaskErrorCategory =
  | 'aoi-not-selected'
  | 'layer-not-loaded'
  | 'invalid-raster-source'
  | 'export-service-unavailable'
  | 'network-error'
  | 'unknown';

export type ExtractMaskExportErrorInfo = {
  category: ExtractMaskErrorCategory;
  message: string;
  recovery?: string;
};

export class ExtractMaskExportError extends Error {
  readonly category: ExtractMaskErrorCategory;
  readonly recovery?: string;
  readonly shortMessage: string;

  constructor(info: ExtractMaskExportErrorInfo) {
    const text = info.recovery ? `${info.message} ${info.recovery}` : info.message;
    super(text);
    this.name = 'ExtractMaskExportError';
    this.category = info.category;
    this.recovery = info.recovery;
    this.shortMessage = info.message;
  }
}

export type ExtractMaskGeoTiffLayerPayload = {
  previewUrl: string;
  geoTiffBlob: Blob;
  coordinates: RasterMapCoordinates;
  boundsLngLat: [number, number, number, number];
  width: number;
  height: number;
};

export type ExtractMaskGeoTiffWorkflowResult = {
  payload: ExtractMaskGeoTiffLayerPayload;
  layerName: string;
  sourceStaged?: { layerId: string; layerName: string };
};

export type StageExtractSourceLayerInput = {
  id: string;
  name: string;
  payload: ExtractMaskGeoTiffLayerPayload;
  indexLayerId: string;
};

export type RunExtractMaskGeoTiffWorkflowOpts = {
  map: MapboxMap;
  aoiFeature: GeoJSON.Feature;
  fitBounds: [[number, number], [number, number]];
  indexLayerId: string;
  indexLayerLabel?: string;
  existingLayerNames: string[];
  prepareMap: () => void | Promise<void>;
  onStatus?: (message: string) => void;
  stageSourceLayer?: (input: StageExtractSourceLayerInput) => Promise<boolean>;
  /** When set, prefer WMS clip export with raw index pixel values inside AOI. */
  wmsExport?: {
    wmsBaseUrl: string;
    wmsAccessToken?: string | null;
    wmsTileLayerName: string;
    timeStart: string;
    timeEnd: string;
    cloudCover: number;
  };
};

function floatGridToPreviewDataUrl(values: Float32Array, width: number, height: number): string {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx || !Number.isFinite(min)) return '';
  const rgba = new Uint8ClampedArray(width * height * 4);
  const span = Math.max(1e-9, max - min);
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    const o = i * 4;
    if (!Number.isFinite(v)) {
      rgba[o + 3] = 0;
      continue;
    }
    const g = Math.max(0, Math.min(255, Math.round(((v - min) / span) * 255)));
    rgba[o] = g;
    rgba[o + 1] = g;
    rgba[o + 2] = g;
    rgba[o + 3] = 255;
  }
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas.toDataURL('image/png');
}

async function buildClipRasterPayloadFromWms(
  raster: Awaited<ReturnType<typeof fetchWmsClippedIndexRaster>>,
): Promise<ExtractMaskGeoTiffLayerPayload | null> {
  if (!raster) return null;
  const bbox = fitBoundsToGeoTiff4326BBox(raster.fitBounds);
  const geotiffBuffer = encodeFloat32GeoTiff4326(raster.width, raster.height, raster.values, bbox);
  const geoTiffBlob = new Blob([geotiffBuffer], { type: 'image/tiff' });
  const previewDataUrl = floatGridToPreviewDataUrl(raster.values, raster.width, raster.height);
  if (!previewDataUrl) return null;
  const previewUrl = URL.createObjectURL(dataUrlToBlob(previewDataUrl));
  return {
    previewUrl,
    geoTiffBlob,
    coordinates: fitBoundsToRasterCoordinates(raster.fitBounds),
    boundsLngLat: raster.boundsLngLat,
    width: raster.width,
    height: raster.height,
  };
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode exported raster image.'));
    img.src = src;
  });
}

/** Decode a data URL to Blob without fetch (avoids browser "Failed to fetch" on data: URLs). */
export function dataUrlToBlob(dataUrl: string): Blob {
  if (dataUrl.startsWith('blob:')) {
    throw new Error('Blob URLs must be converted asynchronously.');
  }
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Invalid data URL.');
  const header = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = header.match(/^data:([^;,]+)/i)?.[1] || 'application/octet-stream';
  if (/;base64/i.test(header)) {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(body)], { type: mime });
}

async function pngToPreviewBlob(dataUrl: string): Promise<Blob> {
  if (dataUrl.startsWith('blob:')) {
    const res = await fetch(dataUrl);
    return res.blob();
  }
  return dataUrlToBlob(dataUrl);
}

export function formatExtractMaskExportError(err: unknown): ExtractMaskExportErrorInfo {
  if (err instanceof ExtractMaskExportError) {
    return {
      category: err.category,
      message: err.shortMessage,
      recovery: err.recovery,
    };
  }

  const raw = err instanceof Error ? err.message : String(err ?? 'Extract by Mask export failed.');
  const lower = raw.toLowerCase();

  if (/aoi|draw.*polygon|select an aoi|no aoi/.test(lower)) {
    return {
      category: 'aoi-not-selected',
      message: 'AOI not selected.',
      recovery: 'Draw a polygon, pick a workspace AOI, or use a layer feature as the mask.',
    };
  }
  if (/failed to fetch|networkerror|network error|load failed|cors|aborted/.test(lower)) {
    return {
      category: 'network-error',
      message: 'Network error.',
      recovery: 'Check your connection and that Sentinel tiles can load inside the AOI, then retry.',
    };
  }
  if (/wms|sentinel|tile|service unavailable|503|502|504|timeout/.test(lower)) {
    return {
      category: 'export-service-unavailable',
      message: 'Export service unavailable.',
      recovery: 'Wait for tiles to finish loading or adjust the date range, then retry.',
    };
  }
  if (/index layer|not visible|capture failed|layer not loaded|too small|blank|decode/.test(lower)) {
    return {
      category: 'layer-not-loaded',
      message: 'Layer not loaded.',
      recovery: 'Turn on “Show on map” for the index layer and wait until it renders inside the AOI.',
    };
  }
  if (/invalid.*source|unknown layer|no layer|unsupported/.test(lower)) {
    return {
      category: 'invalid-raster-source',
      message: 'Invalid raster source.',
      recovery: 'Choose a remote sensing index layer (e.g. NDVI) before exporting.',
    };
  }
  if (/map is not ready|mapbox|canvas/.test(lower)) {
    return {
      category: 'layer-not-loaded',
      message: 'Map is not ready for export.',
      recovery: 'Wait for the map to finish loading, then try again.',
    };
  }

  return {
    category: 'unknown',
    message: raw || 'Extract by Mask export failed.',
    recovery: 'Verify AOI, index layer visibility, and date range, then retry.',
  };
}

export function formatExtractMaskStatusLine(info: ExtractMaskExportErrorInfo): string {
  return info.recovery ? `${info.message} ${info.recovery}` : info.message;
}

export function fitBoundsToGeoTiff4326BBox(
  fit: [[number, number], [number, number]],
): GeoTiff4326BBox {
  const [[west, south], [east, north]] = fit;
  return { west, south, east, north };
}

export function fitBoundsToRasterCoordinates(
  fit: [[number, number], [number, number]],
): RasterMapCoordinates {
  const [[west, south], [east, north]] = fit;
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
}

export function nextExportAoiGeoTiffLayerName(existingNames: string[]): string {
  const base = EXPORT_AOI_GEOTIFF_LAYER_NAME;
  if (!existingNames.includes(base)) return base;
  let i = 2;
  while (existingNames.includes(`${base} (${i})`)) i += 1;
  return `${base} (${i})`;
}

export function nextExtractSourceStagingLayerName(
  existingNames: string[],
  indexLayerLabel?: string,
): string {
  const label = (indexLayerLabel || 'index').trim() || 'index';
  const base = `${EXTRACT_SOURCE_RASTER_LAYER_PREFIX} · ${label}`;
  if (!existingNames.includes(base)) return base;
  let i = 2;
  while (existingNames.includes(`${base} (${i})`)) i += 1;
  return `${base} (${i})`;
}

export async function pngDataUrlToExtractMaskPayload(
  pngDataUrl: string,
  fitBounds: [[number, number], [number, number]],
): Promise<ExtractMaskGeoTiffLayerPayload> {
  const img = await loadImageElement(pngDataUrl);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (width < 4 || height < 4) throw new Error('Exported image is too small.');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare export canvas.');
  ctx.drawImage(img, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const rgb = rgbaToRgbInterleaved(rgba, width * height);
  const bbox = fitBoundsToGeoTiff4326BBox(fitBounds);
  const geotiffBuffer = encodeRgbGeoTiff4326(width, height, rgb, bbox);
  const geoTiffBlob = new Blob([geotiffBuffer], { type: 'image/tiff' });
  const previewUrl =
    pngDataUrl.startsWith('blob:') || pngDataUrl.startsWith('data:')
      ? URL.createObjectURL(await pngToPreviewBlob(pngDataUrl))
      : pngDataUrl;
  const boundsLngLat = siAoiReportFeatureBBoxLngLat({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [bbox.west, bbox.south],
          [bbox.east, bbox.south],
          [bbox.east, bbox.north],
          [bbox.west, bbox.north],
          [bbox.west, bbox.south],
        ],
      ],
    },
    properties: {},
  });
  if (!boundsLngLat) throw new Error('Could not compute exported layer bounds.');

  return {
    previewUrl,
    geoTiffBlob,
    coordinates: fitBoundsToRasterCoordinates(fitBounds),
    boundsLngLat,
    width,
    height,
  };
}

export type CaptureExtractMaskSnapshotOpts = {
  map: MapboxMap;
  aoiFeature: GeoJSON.Feature;
  fitBounds: [[number, number], [number, number]];
  prepareMap?: () => void | Promise<void>;
};

/** Capture the live index raster clipped to AOI (Extract by Mask). */
export async function captureExtractMaskAoiSnapshot(
  opts: CaptureExtractMaskSnapshotOpts,
): Promise<string | null> {
  return captureSiReportMapSnapshot(opts.map, {
    aoiFeature: opts.aoiFeature,
    fitBounds: opts.fitBounds,
    maskToAoi: true,
    freezeViewport: true,
    captureMode: 'export-quality',
    requireIndexLayer: true,
    prepareMap: opts.prepareMap,
    outlineColor: 'rgba(34, 197, 94, 0.95)',
  });
}

/** Capture the index raster over the AOI extent without masking (materialize remote WMS locally). */
export async function captureExtractSourceRasterSnapshot(
  opts: CaptureExtractMaskSnapshotOpts,
): Promise<string | null> {
  return captureSiReportMapSnapshot(opts.map, {
    aoiFeature: opts.aoiFeature,
    fitBounds: opts.fitBounds,
    maskToAoi: false,
    freezeViewport: true,
    captureMode: 'export-quality',
    requireIndexLayer: true,
    prepareMap: opts.prepareMap,
    outlineColor: 'rgba(34, 197, 94, 0.95)',
  });
}

async function ensureRasterSourceReady(
  map: MapboxMap,
  prepareMap: () => void | Promise<void>,
): Promise<void> {
  await Promise.resolve(prepareMap());
  await waitForWmsRasterSourcesReady(map, 14_000);
  await waitForMapboxRasterSettle(map, { extraFrames: 2, rasterFadeMs: 160 });
}

/**
 * Clip active index raster to AOI, materializing a local source layer when the remote WMS
 * cannot be exported directly.
 */
export async function runExtractMaskGeoTiffWorkflow(
  opts: RunExtractMaskGeoTiffWorkflowOpts,
): Promise<ExtractMaskGeoTiffWorkflowResult> {
  const {
    map,
    aoiFeature,
    fitBounds,
    indexLayerId,
    indexLayerLabel,
    existingLayerNames,
    prepareMap,
    onStatus,
    stageSourceLayer,
    wmsExport,
  } = opts;

  if (!indexLayerId?.trim()) {
    throw new ExtractMaskExportError({
      category: 'invalid-raster-source',
      message: 'Invalid raster source.',
      recovery: 'Choose a remote sensing index layer (e.g. NDVI) before exporting.',
    });
  }

  if (wmsExport?.wmsBaseUrl?.trim() && wmsExport.wmsTileLayerName?.trim()) {
    onStatus?.('Clipping raster to AOI (preserving index pixel values)…');
    const clipped = await fetchWmsClippedIndexRaster({
      wmsBaseUrl: wmsExport.wmsBaseUrl,
      wmsAccessToken: wmsExport.wmsAccessToken,
      logicalLayerId: indexLayerId,
      tileLayerName: wmsExport.wmsTileLayerName,
      timeStart: wmsExport.timeStart,
      timeEnd: wmsExport.timeEnd,
      cloudCover: wmsExport.cloudCover,
      feature: aoiFeature,
    });
    const wmsPayload = await buildClipRasterPayloadFromWms(clipped);
    if (wmsPayload) {
      const layerName = nextExportAoiGeoTiffLayerName(existingLayerNames);
      return { payload: wmsPayload, layerName };
    }
    onStatus?.('WMS clip unavailable — falling back to map capture…');
  }

  onStatus?.('Preparing raster source on the map…');
  await ensureRasterSourceReady(map, prepareMap);

  onStatus?.('Clipping raster to AOI and building GeoTIFF…');
  let maskedPng = await captureExtractMaskAoiSnapshot({
    map,
    aoiFeature,
    fitBounds,
    prepareMap,
  });

  let sourceStaged: ExtractMaskGeoTiffWorkflowResult['sourceStaged'];

  if (!maskedPng) {
    onStatus?.('Remote raster not ready — creating a local source layer in Added Layers…');
    await ensureRasterSourceReady(map, prepareMap);

    const sourcePng = await captureExtractSourceRasterSnapshot({
      map,
      aoiFeature,
      fitBounds,
      prepareMap,
    });
    if (!sourcePng) {
      throw new ExtractMaskExportError({
        category: 'layer-not-loaded',
        message: 'Layer not loaded.',
        recovery:
          'Turn on “Show on map” for the index layer and wait until tiles render inside the AOI.',
      });
    }

    const sourcePayload = await pngDataUrlToExtractMaskPayload(sourcePng, fitBounds);
    const sourceLayerName = nextExtractSourceStagingLayerName(existingLayerNames, indexLayerLabel);
    const sourceLayerId = `extract-source-${Date.now()}`;

    if (stageSourceLayer) {
      const mapOk = await stageSourceLayer({
        id: sourceLayerId,
        name: sourceLayerName,
        payload: sourcePayload,
        indexLayerId,
      });
      if (!mapOk) {
        throw new ExtractMaskExportError({
          category: 'layer-not-loaded',
          message: 'Layer not loaded.',
          recovery: 'Could not display the source raster on the map — check Added Layers visibility.',
        });
      }
      sourceStaged = { layerId: sourceLayerId, layerName: sourceLayerName };
      await waitForMapboxRasterSettle(map, { extraFrames: 2, rasterFadeMs: 120 });
    }

    maskedPng = await clipMapSnapshotToAoiFeature(map, sourcePng, aoiFeature, {
      outlineColor: 'rgba(34, 197, 94, 0.95)',
      skipOutlineStroke: true,
    });
    if (!maskedPng) {
      throw new ExtractMaskExportError({
        category: 'export-service-unavailable',
        message: 'Export service unavailable.',
        recovery: sourceStaged
          ? `Source layer “${sourceStaged.layerName}” was added — adjust the AOI and retry.`
          : 'Adjust the AOI or date range and retry.',
      });
    }
  }

  const payload = await pngDataUrlToExtractMaskPayload(maskedPng, fitBounds);
  const layerName = nextExportAoiGeoTiffLayerName([
    ...existingLayerNames,
    ...(sourceStaged ? [sourceStaged.layerName] : []),
  ]);

  return { payload, layerName, sourceStaged };
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
