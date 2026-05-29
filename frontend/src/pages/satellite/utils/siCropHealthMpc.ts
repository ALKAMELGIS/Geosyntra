import type { Feature } from 'geojson';
import {
  mpcZonalSample,
  parseMpcApiError,
  type MpcZonalSampleResult,
} from '../../../lib/mpcPlanetaryApi';
import { MPC_ZONAL_ENVIRONMENTAL_LAYER_IDS } from './liveAoiEnvironmentalLayers';
import type { StaticAoiChartLayerId } from './staticAoiChartTypes';
import type { WeeklyCompositeLite } from './staticAoiChartTypes';
import {
  buildAoiInteriorGrid,
  geometryAoiAreaHectares,
  mpcResultToRasterPixelSample,
  type SiAoiRasterPixelSample,
} from './siAoiZonalStats';

const CROP_HEALTH_LAYER_IDS: StaticAoiChartLayerId[] = [...MPC_ZONAL_ENVIRONMENTAL_LAYER_IDS];
const CROP_HEALTH_RETRY_LAYER_IDS: StaticAoiChartLayerId[] = ['NDVI', 'EVI', 'SAVI', 'NDMI'];

function clampIndex(n: number): number {
  return Math.max(-0.25, Math.min(0.95, n));
}

function hashJitter(lng: number, lat: number): number {
  const t = Math.sin(lng * 12.9898 + lat * 78.233) * 43758.5453;
  return t - Math.floor(t) - 0.5;
}

/** Rolling Sentinel-2 window when timeline weeks are missing. */
export function cropHealthDefaultDatetime(): string {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 60);
  return `${start.toISOString().slice(0, 10)}/${end.toISOString().slice(0, 10)}`;
}

export function cropHealthDatetimeFromTimeline(
  weekCtx: { weekIdx: number; analysisDateIso: string },
  weekly: readonly WeeklyCompositeLite[],
  fallbackStart: string,
  fallbackEnd: string,
): string {
  if (weekly.length > 0 && weekCtx.weekIdx >= 0 && weekCtx.weekIdx < weekly.length) {
    const w = weekly[weekCtx.weekIdx]!;
    const s = w.startDate.slice(0, 10);
    const e = w.endDate.slice(0, 10);
    if (s && e) return `${s}/${e}`;
  }
  const s = fallbackStart.trim().slice(0, 10);
  const e = fallbackEnd.trim().slice(0, 10);
  if (s && e && s <= e) return `${s}/${e}`;
  return cropHealthDefaultDatetime();
}

export function rasterHasCropHealthLayers(
  sample: SiAoiRasterPixelSample,
  layerIds: readonly StaticAoiChartLayerId[] = CROP_HEALTH_LAYER_IDS,
): boolean {
  const n = sample.grid.length;
  if (n < 4) return false;
  for (const id of ['NDVI', 'EVI', 'SAVI'] as const) {
    const arr = sample.layers[id];
    if (!arr || arr.length < 4) return false;
  }
  if (!layerIds.includes('NDMI')) return true;
  const ndmi = sample.layers.NDMI;
  return Boolean(ndmi && ndmi.length >= 4);
}

/** Demo raster inside AOI when analysis_engine is offline or MPC fails. */
export function buildSyntheticCropHealthRaster(
  feature: Feature,
  weekly: readonly WeeklyCompositeLite[],
): SiAoiRasterPixelSample | null {
  const grid = buildAoiInteriorGrid(feature, 520);
  if (grid.length < 4) return null;
  const sorted = [...weekly].sort((a, b) => a.endDate.localeCompare(b.endDate));
  const ndviBase = sorted.length ? sorted[sorted.length - 1]!.mean : 0.48;
  const ndvi: number[] = [];
  const evi: number[] = [];
  const savi: number[] = [];
  const ndmi: number[] = [];
  for (const pt of grid) {
    const j = hashJitter(pt.lng, pt.lat) * 0.1;
    const v = clampIndex(ndviBase + j);
    ndvi.push(v);
    evi.push(clampIndex(v * 1.04 + 0.02));
    savi.push(clampIndex(v * 0.96 + 0.01));
    ndmi.push(clampIndex((v - 0.38) * 0.55));
  }
  return {
    grid,
    layers: { NDVI: ndvi, EVI: evi, SAVI: savi, NDMI: ndmi },
    areaHa: geometryAoiAreaHectares(feature.geometry),
    resolutionM: null,
  };
}

export function describeAnalysisEngineHttpError(status: number, bodyText: string): string {
  const raw = bodyText.trim();
  const lower = raw.toLowerCase();
  if (
    status === 502 ||
    (status === 500 &&
      (!raw ||
        lower.includes('econnrefused') ||
        lower.includes('proxy error') ||
        lower.includes('socket hang up') ||
        lower.includes('connect ')))
  ) {
    return (
      'Analysis engine is not reachable. Start it with: cd analysis_engine && uvicorn app.main:app --reload --port 8000 ' +
      '(or set ANALYSIS_ENGINE_URL on the API host).'
    );
  }
  return parseMpcApiError(raw, status);
}

export type FetchCropHealthRasterOptions = {
  baseUrl: string;
  feature: Feature;
  datetime: string;
  catalogUrl: string;
  maxCloudCover?: number;
};

async function mpcToSample(
  result: MpcZonalSampleResult,
  layerIds: StaticAoiChartLayerId[],
): Promise<SiAoiRasterPixelSample | null> {
  return mpcResultToRasterPixelSample(result, layerIds);
}

export async function fetchCropHealthRasterSample(
  opts: FetchCropHealthRasterOptions,
): Promise<{ sample: SiAoiRasterPixelSample; source: 'mpc-full' | 'mpc-retry' }> {
  const body = {
    aoi: opts.feature,
    datetime: opts.datetime,
    catalog_url: opts.catalogUrl,
    clip_to_aoi: true,
    max_cloud_cover: opts.maxCloudCover,
    max_pixels: 9000,
    resolution: 20,
  };

  let lastErr: unknown = new Error('No raster pixels returned for this AOI and date.');

  try {
    const result = await mpcZonalSample(opts.baseUrl, {
      ...body,
      layer_ids: CROP_HEALTH_LAYER_IDS,
    });
    const sample = await mpcToSample(result, CROP_HEALTH_LAYER_IDS);
    if (sample && rasterHasCropHealthLayers(sample)) {
      return { sample, source: 'mpc-full' };
    }
  } catch (e) {
    lastErr = e;
  }

  try {
    const result = await mpcZonalSample(opts.baseUrl, {
      ...body,
      layer_ids: CROP_HEALTH_RETRY_LAYER_IDS,
      max_pixels: 6000,
      resolution: 30,
      max_items: 8,
    });
    const sample = await mpcToSample(result, CROP_HEALTH_RETRY_LAYER_IDS);
    if (sample && rasterHasCropHealthLayers(sample)) {
      return { sample, source: 'mpc-retry' };
    }
  } catch (e) {
    lastErr = e;
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
