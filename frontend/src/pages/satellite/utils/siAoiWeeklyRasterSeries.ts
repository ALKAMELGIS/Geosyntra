import { mpcZonalSample } from '../../../lib/mpcPlanetaryApi';
import { buildLiveAoiCacheKey, getLiveAoiCache, setLiveAoiCache } from './liveAoiAnalysisCache';
import { mpcZonalApiLayerIdsFromPopup } from './liveAoiEnvironmentalLayers';
import {
  buildAoiZonalDatetimeRange,
  liveRasterIndexStats,
  mpcResultToRasterPixelSample,
  resolveAoiZonalWeekContext,
  type SiAoiRasterPixelSample,
} from './siAoiZonalStats';
import { fetchWmsAoiLiveIndexSample, fetchWmsAoiMultiIndexSample } from '../../../lib/wmsAoiLiveIndexSample';
import type { StaticAoiChartLayerId, WeeklyCompositeLite } from './staticAoiChartTypes';

const DEFAULT_MPC_CATALOG_URL = 'https://planetarycomputer.microsoft.com/catalog';

/** AOI-masked zonal mean for one layer from an MPC raster sample (no synthetic fallback). */
export function zonalMeanFromRaster(
  raster: SiAoiRasterPixelSample | null | undefined,
  layerId: StaticAoiChartLayerId,
  feature: GeoJSON.Feature | null | undefined,
): number | null {
  const st = liveRasterIndexStats(raster, layerId, feature);
  return st && Number.isFinite(st.mean) ? st.mean : null;
}

/** Per-week zonal means per layer from pre-fetched weekly raster samples. */
export function weeklyZonalMeansFromRasters(
  weekly: readonly WeeklyCompositeLite[],
  layerIds: readonly StaticAoiChartLayerId[],
  rastersByWeekIdx: readonly (SiAoiRasterPixelSample | null | undefined)[],
  feature: GeoJSON.Feature | null,
): Partial<Record<StaticAoiChartLayerId, (number | null)[]>> {
  const out: Partial<Record<StaticAoiChartLayerId, (number | null)[]>> = {};
  for (const id of layerIds) {
    out[id] = weekly.map((_, i) => zonalMeanFromRaster(rastersByWeekIdx[i], id, feature));
  }
  return out;
}

export type WeeklyZonalMeansWithFallback = {
  means: Partial<Record<StaticAoiChartLayerId, (number | null)[]>>;
  hasRealRaster: boolean;
  hasPreviewFallback: boolean;
};

/**
 * Prefer AOI-masked raster means per week. No synthetic sin-curve fallback — gaps stay null
 * so each layer shows its own real trajectory (WMS / MPC pixels), not parallel preview arcs.
 */
export function weeklyZonalMeansWithTimelineFallback(
  weekly: readonly WeeklyCompositeLite[],
  layerIds: readonly StaticAoiChartLayerId[],
  rastersByWeekIdx: readonly (SiAoiRasterPixelSample | null | undefined)[],
  feature: GeoJSON.Feature | null,
  _aoiKey: string | null,
): WeeklyZonalMeansWithFallback {
  const fromRasters = weeklyZonalMeansFromRasters(weekly, layerIds, rastersByWeekIdx, feature);
  let hasRealRaster = false;
  const means: Partial<Record<StaticAoiChartLayerId, (number | null)[]>> = {};

  for (const id of layerIds) {
    means[id] = weekly.map((_, weekIdx) => {
      const rasterVal = fromRasters[id]?.[weekIdx];
      if (typeof rasterVal === 'number' && Number.isFinite(rasterVal)) {
        hasRealRaster = true;
        return rasterVal;
      }
      return null;
    });
  }

  return { means, hasRealRaster, hasPreviewFallback: false };
}

/** Merge MPC + WMS weekly samples — union layer arrays, prefer MPC values on overlap. */
export function mergeWeeklyRasterSamples(
  primary: SiAoiRasterPixelSample | null | undefined,
  secondary: SiAoiRasterPixelSample | null | undefined,
): SiAoiRasterPixelSample | null {
  if (!primary?.grid?.length) return secondary ?? null;
  if (!secondary?.grid?.length) return primary;
  return {
    grid: primary.grid.length >= secondary.grid.length ? primary.grid : secondary.grid,
    layers: { ...secondary.layers, ...primary.layers },
    resolutionM: primary.resolutionM ?? secondary.resolutionM,
    areaHa: primary.areaHa || secondary.areaHa,
  };
}

const DEFAULT_WMS_WEEK_CONCURRENCY = 4;

async function mapWeeklySamplesWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<SiAoiRasterPixelSample | null>,
): Promise<(SiAoiRasterPixelSample | null)[]> {
  const results: (SiAoiRasterPixelSample | null)[] = new Array(items.length).fill(null);
  let nextIdx = 0;
  const worker = async () => {
    while (nextIdx < items.length) {
      const i = nextIdx++;
      try {
        results[i] = await fn(items[i]!, i);
      } catch {
        results[i] = null;
      }
    }
  };
  const workers = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/** Per-week multi-index WMS samples (live Sentinel Hub) for timeline charts. */
export async function fetchWeeklyWmsAoiRasters(opts: {
  wmsBaseUrl: string;
  wmsAccessToken?: string | null;
  /** WMS `LAYERS=` tile name — resolved from logical eval-only ids (e.g. HONC → Sentinel-2 L2A). */
  wmsTileLayerName: string;
  feature: GeoJSON.Feature;
  weekly: readonly WeeklyCompositeLite[];
  layerIds: readonly StaticAoiChartLayerId[];
  cloudCover?: number;
  concurrency?: number;
  onWeekSampled?: (weekIdx: number, sample: SiAoiRasterPixelSample | null) => void;
}): Promise<(SiAoiRasterPixelSample | null)[]> {
  const tileLayer = opts.wmsTileLayerName?.trim();
  if (!opts.wmsBaseUrl?.trim() || !tileLayer || !opts.weekly.length) {
    return opts.weekly.map(() => null);
  }
  const layerIds = [...new Set(opts.layerIds)].filter(Boolean);
  if (layerIds.length < 1) return opts.weekly.map(() => null);

  return mapWeeklySamplesWithConcurrency(
    opts.weekly,
    opts.concurrency ?? DEFAULT_WMS_WEEK_CONCURRENCY,
    async (w, weekIdx) => {
      const timeStart = w.startDate.slice(0, 10);
      const timeEnd = w.endDate.slice(0, 10);
      const sample =
        layerIds.length >= 2
          ? await fetchWmsAoiMultiIndexSample({
              wmsBaseUrl: opts.wmsBaseUrl,
              wmsAccessToken: opts.wmsAccessToken,
              wmsLayerName: tileLayer,
              indexLayerIds: layerIds,
              timeStart,
              timeEnd,
              cloudCover: opts.cloudCover ?? 20,
              feature: opts.feature,
              maxDim: 384,
              requireScatterPair: false,
              minValidLayers: 1,
            })
          : await fetchWmsAoiLiveIndexSample({
              wmsBaseUrl: opts.wmsBaseUrl,
              wmsAccessToken: opts.wmsAccessToken,
              layerName: tileLayer,
              chartLayerId: layerIds[0],
              timeStart,
              timeEnd,
              cloudCover: opts.cloudCover ?? 20,
              feature: opts.feature,
              maxDim: 384,
            });
      opts.onWeekSampled?.(weekIdx, sample);
      return sample;
    },
  );
}

export async function fetchWeeklyAoiRasters(opts: {
  baseUrl: string;
  feature: GeoJSON.Feature;
  aoiKey: string;
  weekly: readonly WeeklyCompositeLite[];
  layerIds: readonly StaticAoiChartLayerId[];
  catalogUrl?: string;
  maxCloudCover?: number;
  wmsLayer?: string;
  timeSeriesStart?: string;
  timeSeriesEnd?: string;
}): Promise<(SiAoiRasterPixelSample | null)[]> {
  const mpcLayers = mpcZonalApiLayerIdsFromPopup(opts.layerIds);
  if (!mpcLayers.length || !opts.weekly.length) {
    return opts.weekly.map(() => null);
  }

  const catalogUrl = opts.catalogUrl ?? DEFAULT_MPC_CATALOG_URL;
  const results: (SiAoiRasterPixelSample | null)[] = [];

  for (let weekIdx = 0; weekIdx < opts.weekly.length; weekIdx++) {
    const w = opts.weekly[weekIdx]!;
    const weekCtx = resolveAoiZonalWeekContext(
      opts.weekly,
      w.startDate.slice(0, 10),
      w.endDate.slice(0, 10),
    );
    const datetime = buildAoiZonalDatetimeRange(
      weekCtx,
      opts.weekly,
      opts.timeSeriesStart ?? '',
      opts.timeSeriesEnd ?? '',
    );
    const cacheKey = buildLiveAoiCacheKey({
      aoiKey: opts.aoiKey,
      datetime,
      layerIds: mpcLayers,
      catalogUrl,
      maxCloudCover: opts.maxCloudCover,
      resolution: 20,
      wmsLayer: opts.wmsLayer,
      anchorIso: w.startDate.slice(0, 10),
    });
    const cached = getLiveAoiCache(cacheKey);
    if (cached?.raster?.grid?.length) {
      results.push(cached.raster);
      continue;
    }
    try {
      const result = await mpcZonalSample(opts.baseUrl, {
        aoi: opts.feature,
        datetime,
        layer_ids: mpcLayers,
        catalog_url: catalogUrl,
        clip_to_aoi: true,
        max_cloud_cover: opts.maxCloudCover,
        max_pixels: 9000,
        resolution: 20,
      });
      const sample = mpcResultToRasterPixelSample(result, mpcLayers);
      if (sample?.grid?.length) {
        setLiveAoiCache(cacheKey, { result, raster: sample, fetchedAt: Date.now() });
        results.push(sample);
      } else {
        results.push(null);
      }
    } catch {
      results.push(null);
    }
  }

  return results;
}
