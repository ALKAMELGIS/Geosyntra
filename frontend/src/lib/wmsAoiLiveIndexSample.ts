/**
 * Sample min/mean/max from the live Sentinel Hub WMS layer (same index math as map tiles).
 */
import { pointInAoiGeometry } from './siAoiFields';
import {
  buildSentinelHubWmsAoiClip,
  buildWmsIndexStatsEvalscript,
  evalscriptToBase64Param,
  inferWmsEvalProfile,
  lngLatToWebMercator,
  webMercatorToLngLat,
  wmsIndexStatsDecodeRange,
  type WmsIndexStatsDecodeRange,
} from './sentinelHubWmsAoiClip';
import { sentinelHubWmsUsesMaxCloudCover } from './siSentinel1InsarLayerCatalog';
import { getFeatureLngLatBounds } from '../pages/satellite/utils/siAoiZonalStats';
import type { SiAoiRasterPixelSample } from '../pages/satellite/utils/siAoiZonalStats';
import type { StaticAoiChartLayerId } from '../pages/satellite/utils/staticAoiChartTypes';
import { inferStaticAoiChartLayerFromWmsName } from '../pages/satellite/utils/siAoiZonalStats';

export type WmsAoiLiveIndexSampleOpts = {
  wmsBaseUrl: string;
  wmsAccessToken?: string | null;
  /** WMS `LAYERS=` tile name (e.g. Sentinel-2 L2A), not eval-only logical id. */
  layerName: string;
  /** Eval-only index id (NDVI, VHS, …) when layerName is the WMS collection. */
  logicalLayerId?: string;
  /** Spectral index for evalscript decode — defaults from logicalLayerId / layerName when omitted. */
  chartLayerId?: StaticAoiChartLayerId;
  timeStart: string;
  timeEnd: string;
  cloudCover: number;
  feature: GeoJSON.Feature;
  geometryWkt3857?: string | null;
  maxDim?: number;
};

export type WmsAoiMultiIndexSampleOpts = {
  wmsBaseUrl: string;
  wmsAccessToken?: string | null;
  /** WMS `LAYERS=` tile name (e.g. Sentinel-2 L2A), not eval-only logical id. */
  wmsLayerName: string;
  indexLayerIds: StaticAoiChartLayerId[];
  timeStart: string;
  timeEnd: string;
  cloudCover: number;
  feature: GeoJSON.Feature;
  geometryWkt3857?: string | null;
  maxDim?: number;
  /** When false, return zonal grid even if scatter pair is too sparse (timeline charts). */
  requireScatterPair?: boolean;
  /** Minimum decoded index layers before accepting the sample (default 2, or 1 when scatter not required). */
  minValidLayers?: number;
};

export function bbox3857FromFeature(feature: GeoJSON.Feature): [number, number, number, number] | null {
  const bounds = getFeatureLngLatBounds(feature);
  if (!bounds) return null;
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const [x1, y1] = lngLatToWebMercator(minLng, minLat);
  const [x2, y2] = lngLatToWebMercator(maxLng, maxLat);
  const padX = Math.max((Math.abs(x2 - x1) || 1) * 0.02, 1);
  const padY = Math.max((Math.abs(y2 - y1) || 1) * 0.02, 1);
  return [
    Math.min(x1, x2) - padX,
    Math.min(y1, y2) - padY,
    Math.max(x1, x2) + padX,
    Math.max(y1, y2) + padY,
  ];
}

export function wmsStatsImageDimensions(
  bbox3857: [number, number, number, number],
  maxDim = 512,
): { width: number; height: number } {
  const [xMin, yMin, xMax, yMax] = bbox3857;
  const wM = Math.max(1, xMax - xMin);
  const hM = Math.max(1, yMax - yMin);
  const aspect = wM / hM;
  if (aspect >= 1) {
    return {
      width: maxDim,
      height: Math.max(64, Math.round(maxDim / aspect)),
    };
  }
  return {
    width: Math.max(64, Math.round(maxDim * aspect)),
    height: maxDim,
  };
}

export function buildWmsAoiStatsGetMapUrl(opts: {
  wmsBaseUrl: string;
  layerName: string;
  bbox3857: [number, number, number, number];
  width: number;
  height: number;
  timeStart: string;
  timeEnd: string;
  cloudCover: number;
  evalscriptB64: string;
  geometryWkt3857?: string | null;
  logicalLayerId?: string;
}): string {
  const [xMin, yMin, xMax, yMax] = opts.bbox3857;
  const maxcc =
    opts.logicalLayerId &&
    !sentinelHubWmsUsesMaxCloudCover(opts.logicalLayerId, opts.layerName)
      ? ''
      : `&MAXCC=${opts.cloudCover}`;
  let url =
    `${opts.wmsBaseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=${encodeURIComponent(opts.layerName)}` +
    `&BBOX=${xMin},${yMin},${xMax},${yMax}` +
    `&CRS=EPSG:3857&FORMAT=image/png&TRANSPARENT=true` +
    `&WIDTH=${opts.width}&HEIGHT=${opts.height}` +
    `&TIME=${opts.timeStart}/${opts.timeEnd}${maxcc}&SHOWLOGO=false&WARNINGS=false` +
    `&EVALSCRIPT=${encodeURIComponent(opts.evalscriptB64)}`;
  if (opts.geometryWkt3857) {
    url += `&GEOMETRY=${encodeURIComponent(opts.geometryWkt3857)}`;
  }
  return url;
}

export function decodeWmsIndexSamplePixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bbox3857: [number, number, number, number],
  geometry: GeoJSON.Geometry,
  decodeRange: WmsIndexStatsDecodeRange,
): { grid: Array<{ lng: number; lat: number }>; values: number[] } {
  const [xMin, yMin, xMax, yMax] = bbox3857;
  const xSpan = Math.max(1e-9, xMax - xMin);
  const ySpan = Math.max(1e-9, yMax - yMin);
  const span = decodeRange.max - decodeRange.min;
  const grid: Array<{ lng: number; lat: number }> = [];
  const values: number[] = [];

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4;
      const a = data[i + 3]!;
      if (a < 16) continue;
      const r = data[i]!;
      const t = r / 255;
      const idx = decodeRange.min + t * span;
      const x = xMin + ((px + 0.5) / width) * xSpan;
      const y = yMax - ((py + 0.5) / height) * ySpan;
      const [lng, lat] = webMercatorToLngLat(x, y);
      if (!pointInAoiGeometry(lng, lat, geometry)) continue;
      grid.push({ lng, lat });
      values.push(idx);
    }
  }
  return { grid, values };
}

/** Full raster grid — NaN outside AOI / transparent pixels (preserves index values inside clip). */
export function decodeWmsIndexGridRaster(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bbox3857: [number, number, number, number],
  geometry: GeoJSON.Geometry,
  decodeRange: WmsIndexStatsDecodeRange,
): Float32Array {
  const [xMin, yMin, xMax, yMax] = bbox3857;
  const xSpan = Math.max(1e-9, xMax - xMin);
  const ySpan = Math.max(1e-9, yMax - yMin);
  const span = decodeRange.max - decodeRange.min;
  const out = new Float32Array(width * height);
  out.fill(Number.NaN);

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4;
      const a = data[i + 3]!;
      if (a < 16) continue;
      const x = xMin + ((px + 0.5) / width) * xSpan;
      const y = yMax - ((py + 0.5) / height) * ySpan;
      const [lng, lat] = webMercatorToLngLat(x, y);
      if (!pointInAoiGeometry(lng, lat, geometry)) continue;
      const r = data[i]!;
      const t = r / 255;
      out[py * width + px] = decodeRange.min + t * span;
    }
  }
  return out;
}

export type WmsClippedIndexRaster = {
  width: number;
  height: number;
  values: Float32Array;
  fitBounds: [[number, number], [number, number]];
  boundsLngLat: [number, number, number, number];
};

/** Fetch live WMS index raster clipped to AOI (raw index values, not colormap RGB). */
export async function fetchWmsClippedIndexRaster(opts: {
  wmsBaseUrl: string;
  wmsAccessToken?: string | null;
  logicalLayerId: string;
  tileLayerName: string;
  timeStart: string;
  timeEnd: string;
  cloudCover: number;
  feature: GeoJSON.Feature;
  geometryWkt3857?: string | null;
  maxDim?: number;
}): Promise<WmsClippedIndexRaster | null> {
  const geom = opts.feature.geometry;
  if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) return null;

  const profile = inferWmsEvalProfile(opts.logicalLayerId);
  const decodeRange = wmsIndexStatsDecodeRange(profile, opts.logicalLayerId);
  const evalPlain = buildWmsIndexStatsEvalscript(profile, opts.logicalLayerId);
  if (!decodeRange || !evalPlain) return null;

  const bbox3857 = bbox3857FromFeature(opts.feature);
  if (!bbox3857) return null;
  const boundsLngLat = getFeatureLngLatBounds(opts.feature);
  if (!boundsLngLat) return null;

  const { width, height } = wmsStatsImageDimensions(bbox3857, opts.maxDim ?? 768);
  const evalscriptB64 = evalscriptToBase64Param(evalPlain);
  const geometryWkt3857 =
    opts.geometryWkt3857 ??
    buildSentinelHubWmsAoiClip(opts.feature, opts.logicalLayerId).geometryWkt3857;
  const url = buildWmsAoiStatsGetMapUrl({
    wmsBaseUrl: opts.wmsBaseUrl,
    layerName: opts.tileLayerName,
    bbox3857,
    width,
    height,
    timeStart: opts.timeStart,
    timeEnd: opts.timeEnd,
    cloudCover: opts.cloudCover,
    evalscriptB64,
    geometryWkt3857,
    logicalLayerId: opts.logicalLayerId,
  });

  const headers: Record<string, string> = {};
  const token = opts.wmsAccessToken?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 28000);
  let res: Response;
  try {
    res = await fetch(url, { headers, mode: 'cors', signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
  if (!res.ok) return null;

  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const values = decodeWmsIndexGridRaster(
    img.data,
    canvas.width,
    canvas.height,
    bbox3857,
    geom,
    decodeRange,
  );
  if (!values.some(Number.isFinite)) return null;

  const [minLng, minLat, maxLng, maxLat] = boundsLngLat;
  return {
    width: canvas.width,
    height: canvas.height,
    values,
    fitBounds: [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    boundsLngLat: [minLng, minLat, maxLng, maxLat],
  };
}

function cellKey(lng: number, lat: number): string {
  return `${lng.toFixed(5)}|${lat.toFixed(5)}`;
}

function alignValuesToGrid(
  targetGrid: Array<{ lng: number; lat: number }>,
  source: { grid: Array<{ lng: number; lat: number }>; values: number[] },
): number[] {
  const map = new Map<string, number>();
  for (let i = 0; i < source.grid.length; i++) {
    const p = source.grid[i]!;
    map.set(cellKey(p.lng, p.lat), source.values[i]!);
  }
  return targetGrid.map(p => map.get(cellKey(p.lng, p.lat)) ?? NaN);
}

export function rasterHasScatterPair(
  raster: SiAoiRasterPixelSample | null | undefined,
  xId: StaticAoiChartLayerId,
  yId: StaticAoiChartLayerId,
  minPoints = 8,
): boolean {
  if (!raster?.grid?.length) return false;
  const xs = raster.layers[xId];
  const ys = raster.layers[yId];
  const n = raster.grid.length;
  if (!xs?.length || !ys?.length || xs.length !== n || ys.length !== n) return false;
  let valid = 0;
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(xs[i]!) && Number.isFinite(ys[i]!)) valid++;
  }
  return valid >= minPoints;
}

async function fetchWmsIndexGridValues(opts: {
  wmsBaseUrl: string;
  wmsAccessToken?: string | null;
  wmsLayerName: string;
  chartLayerId: StaticAoiChartLayerId;
  timeStart: string;
  timeEnd: string;
  cloudCover: number;
  feature: GeoJSON.Feature;
  geometry: GeoJSON.Geometry;
  bbox3857: [number, number, number, number];
  width: number;
  height: number;
  geometryWkt3857?: string | null;
}): Promise<{ grid: Array<{ lng: number; lat: number }>; values: number[] } | null> {
  const profile = inferWmsEvalProfile(opts.chartLayerId);
  const decodeRange = wmsIndexStatsDecodeRange(profile, opts.chartLayerId);
  const evalPlain = buildWmsIndexStatsEvalscript(profile, opts.chartLayerId);
  if (!decodeRange || !evalPlain) return null;

  const evalscriptB64 = evalscriptToBase64Param(evalPlain);
  const geometryWkt3857 =
    opts.geometryWkt3857 ??
    buildSentinelHubWmsAoiClip(opts.feature, opts.wmsLayerName).geometryWkt3857;
  const url = buildWmsAoiStatsGetMapUrl({
    wmsBaseUrl: opts.wmsBaseUrl,
    layerName: opts.wmsLayerName,
    bbox3857: opts.bbox3857,
    width: opts.width,
    height: opts.height,
    timeStart: opts.timeStart,
    timeEnd: opts.timeEnd,
    cloudCover: opts.cloudCover,
    evalscriptB64,
    geometryWkt3857,
    logicalLayerId: opts.chartLayerId,
  });

  const headers: Record<string, string> = {};
  const token = opts.wmsAccessToken?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutMs = 22000;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { headers, mode: 'cors', signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
  if (!res.ok) return null;
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const decoded = decodeWmsIndexSamplePixels(
    img.data,
    canvas.width,
    canvas.height,
    opts.bbox3857,
    opts.geometry,
    decodeRange,
  );
  if (!decoded.values.length) return null;
  return decoded;
}

/** Sample multiple spectral indices from live WMS (same date + AOI) for index cross-scatter. */
export async function fetchWmsAoiMultiIndexSample(
  opts: WmsAoiMultiIndexSampleOpts,
): Promise<SiAoiRasterPixelSample | null> {
  const geom = opts.feature.geometry;
  if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) return null;
  const ids = [...new Set(opts.indexLayerIds)].filter(Boolean);
  if (ids.length < 2) return null;

  const bbox3857 = bbox3857FromFeature(opts.feature);
  if (!bbox3857) return null;
  const { width, height } = wmsStatsImageDimensions(bbox3857, opts.maxDim ?? 512);
  const geometryWkt3857 =
    opts.geometryWkt3857 ??
    buildSentinelHubWmsAoiClip(opts.feature, opts.wmsLayerName).geometryWkt3857;

  const samples = await Promise.all(
    ids.map(async chartLayerId => {
      const decoded = await fetchWmsIndexGridValues({
        wmsBaseUrl: opts.wmsBaseUrl,
        wmsAccessToken: opts.wmsAccessToken,
        wmsLayerName: opts.wmsLayerName,
        chartLayerId,
        timeStart: opts.timeStart,
        timeEnd: opts.timeEnd,
        cloudCover: opts.cloudCover,
        feature: opts.feature,
        geometry: geom,
        bbox3857,
        width,
        height,
        geometryWkt3857,
      });
      return { chartLayerId, decoded };
    }),
  );

  const valid = samples.filter(s => s.decoded?.values.length);
  const requireScatter = opts.requireScatterPair !== false;
  const minValid = opts.minValidLayers ?? (requireScatter ? 2 : 1);
  if (valid.length < minValid) return null;

  const base = valid[0]!.decoded!;
  const grid = base.grid;
  const layers: Partial<Record<StaticAoiChartLayerId, number[]>> = {
    [valid[0]!.chartLayerId]: base.values,
  };

  for (let i = 1; i < valid.length; i++) {
    const { chartLayerId, decoded } = valid[i]!;
    if (!decoded) continue;
    if (decoded.grid.length === grid.length) {
      let aligned = true;
      for (let j = 0; j < grid.length; j++) {
        const a = grid[j]!;
        const b = decoded.grid[j]!;
        if (Math.abs(a.lng - b.lng) > 1e-4 || Math.abs(a.lat - b.lat) > 1e-4) {
          aligned = false;
          break;
        }
      }
      layers[chartLayerId] = aligned ? decoded.values : alignValuesToGrid(grid, decoded);
    } else {
      layers[chartLayerId] = alignValuesToGrid(grid, decoded);
    }
  }

  if (requireScatter) {
    const xId = ids[0]!;
    const yId = ids[1]!;
    if (!rasterHasScatterPair({ grid, layers, areaHa: 0, resolutionM: 0 }, xId, yId)) return null;
  }

  const [xMin, , xMax] = bbox3857;
  return {
    grid,
    layers,
    resolutionM: Math.abs(xMax - xMin) / Math.max(1, width),
    areaHa: 0,
  };
}

export async function fetchWmsAoiLiveIndexSample(
  opts: WmsAoiLiveIndexSampleOpts,
): Promise<SiAoiRasterPixelSample | null> {
  const geom = opts.feature.geometry;
  if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) return null;

  const logicalName = (opts.logicalLayerId ?? opts.layerName).trim();
  const profile = inferWmsEvalProfile(logicalName);
  const layerId =
    profile === 'agro_composite' || profile === 'agro_delta'
      ? (logicalName as StaticAoiChartLayerId)
      : (opts.chartLayerId ?? inferStaticAoiChartLayerFromWmsName(logicalName));
  const bbox3857 = bbox3857FromFeature(opts.feature);
  if (!bbox3857) return null;

  const { width, height } = wmsStatsImageDimensions(bbox3857, opts.maxDim ?? 384);
  const decoded = await fetchWmsIndexGridValues({
    wmsBaseUrl: opts.wmsBaseUrl,
    wmsAccessToken: opts.wmsAccessToken,
    wmsLayerName: opts.layerName,
    chartLayerId: layerId,
    timeStart: opts.timeStart,
    timeEnd: opts.timeEnd,
    cloudCover: opts.cloudCover,
    feature: opts.feature,
    geometry: geom,
    bbox3857,
    width,
    height,
    geometryWkt3857: opts.geometryWkt3857,
  });
  if (!decoded) return null;

  const [xMin, , xMax] = bbox3857;
  return {
    grid: decoded.grid,
    layers: { [layerId]: decoded.values },
    resolutionM: Math.abs(xMax - xMin) / Math.max(1, width),
    areaHa: 0,
    aoiClipped: true,
  };
}
