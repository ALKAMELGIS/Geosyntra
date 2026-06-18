import type { LiveAoiAnalysisStatus } from '../hooks/useLiveAoiSpectralAnalysis';
import {
  buildLiveAoiIndexAnalysisSummary,
  type LiveAoiIndexAnalysisSummary,
} from './liveAoiIndexAnalysis';
import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import { SI_WMS_SPECTRAL_CLASS_COUNT } from './siWmsSpectralClassification';
import {
  classAtRasterClick,
  computeIndexClassAnalyticsFromRaster,
  formatAreaTriple,
  type SiIndexClassAnalytics,
  type SiIndexClassRow,
  type SiIndexCoverPair,
} from './siIndexClassAnalytics';
import {
  liveRasterIndexStats,
  type SiAoiRasterPixelSample,
  type SiAoiZonalAnalytics,
} from './siAoiZonalStats';
import type { StaticAoiChartLayerId } from './staticAoiChartTypes';

export type LiveAoiClickedClassInfo = SiIndexClassRow & { pixelValue: number };

export type LiveAoiStatsViewModel = {
  aoiKey: string;
  aoiName: string;
  layerName: string;
  layerId: StaticAoiChartLayerId;
  analysisDateIso: string;
  pixelCount: number | null;
  totalPixelCount: number | null;
  validPixelCount: number | null;
  approxResolutionM: number | null;
  min: number | null;
  max: number | null;
  mean: number | null;
  areaHa: number;
  areaM2: number;
  areaKm2: number;
  status: LiveAoiAnalysisStatus;
  classAnalytics: SiIndexClassAnalytics | null;
  cover: SiIndexCoverPair | null;
  clickedClass: LiveAoiClickedClassInfo | null;
  /** NDVI / vegetation-index popup summary (extensible to NDMI, LST, etc.). */
  indexAnalysis: LiveAoiIndexAnalysisSummary | null;
};

function resolveMaskedStatsStatus(
  status: LiveAoiAnalysisStatus,
  hasStats: boolean,
): LiveAoiAnalysisStatus {
  if (hasStats) return 'ready';
  if (status === 'loading' || status === 'idle') return status;
  if (status === 'ready') return 'error';
  return status;
}

/** Minimal model so the popup can mount immediately while raster stats load. */
export function buildLoadingLiveAoiStatsViewModel(args: {
  aoiKey: string;
  aoiName: string;
  layerId: StaticAoiChartLayerId;
  layerName: string;
  areaHa: number;
  analysisDateIso: string;
  status?: LiveAoiAnalysisStatus;
}): LiveAoiStatsViewModel {
  const areaHa = Math.max(0, args.areaHa);
  return {
    aoiKey: args.aoiKey,
    aoiName: args.aoiName,
    layerName: args.layerName,
    layerId: args.layerId,
    analysisDateIso: args.analysisDateIso.slice(0, 10),
    pixelCount: null,
    totalPixelCount: null,
    validPixelCount: null,
    approxResolutionM: null,
    min: null,
    max: null,
    mean: null,
    areaHa,
    areaM2: areaHa * 10000,
    areaKm2: areaHa / 100,
    status: args.status ?? 'loading',
    classAnalytics: null,
    cover: null,
    clickedClass: null,
    indexAnalysis: null,
  };
}

export function buildLiveAoiStatsViewModel(args: {
  aoiKey: string;
  aoiName: string;
  layerId: StaticAoiChartLayerId;
  layerName: string;
  areaHa: number;
  analysisDateIso: string;
  rasterSample: SiAoiRasterPixelSample | null;
  zonal: SiAoiZonalAnalytics | null;
  feature?: GeoJSON.Feature | null;
  status: LiveAoiAnalysisStatus;
  clickLng?: number | null;
  clickLat?: number | null;
  /** Canonical WMS ramp — popup/legend/report colors match map tiles. */
  classifiedStops?: readonly IndexRampStop[] | null;
  /** Instant min/mean/max while full raster class analytics compute. */
  indexStatsFallback?: { mean: number; min: number; max: number; validCount?: number } | null;
}): LiveAoiStatsViewModel | null {
  const {
    aoiKey,
    aoiName,
    layerId,
    layerName,
    areaHa,
    analysisDateIso,
    rasterSample,
    zonal,
    feature,
    status,
    clickLng,
    clickLat,
  } = args;

  if (!Number.isFinite(areaHa) || areaHa <= 0) return null;

  const fromRaster = liveRasterIndexStats(rasterSample, layerId, feature);
  const indexZonal =
    zonal?.dataSource === 'raster' ? zonal.indices?.[layerId] : undefined;

  const mean =
    fromRaster?.mean ??
    (args.indexStatsFallback && Number.isFinite(args.indexStatsFallback.mean)
      ? args.indexStatsFallback.mean
      : null) ??
    (indexZonal && Number.isFinite(indexZonal.mean) ? indexZonal.mean : null);

  const min =
    fromRaster?.min ??
    (args.indexStatsFallback && Number.isFinite(args.indexStatsFallback.min)
      ? args.indexStatsFallback.min
      : null) ??
    (indexZonal && Number.isFinite(indexZonal.min) ? indexZonal.min : null);

  const max =
    fromRaster?.max ??
    (args.indexStatsFallback && Number.isFinite(args.indexStatsFallback.max)
      ? args.indexStatsFallback.max
      : null) ??
    (indexZonal && Number.isFinite(indexZonal.max) ? indexZonal.max : null);

  const pixelCount =
    fromRaster?.validCount ??
    args.indexStatsFallback?.validCount ??
    (zonal?.validPixelCount && zonal.validPixelCount > 0 ? zonal.validPixelCount : null);

  const totalPixelCount =
    zonal?.pixelCount && zonal.pixelCount > 0
      ? zonal.pixelCount
      : rasterSample?.grid?.length && rasterSample.grid.length > 0
        ? rasterSample.grid.length
        : null;

  const validPixelCount =
    zonal?.validPixelCount && zonal.validPixelCount > 0
      ? zonal.validPixelCount
      : fromRaster?.validCount ?? pixelCount;

  const approxResolutionM =
    zonal?.approxResolutionM && Number.isFinite(zonal.approxResolutionM)
      ? zonal.approxResolutionM
      : rasterSample?.resolutionM && Number.isFinite(rasterSample.resolutionM)
        ? rasterSample.resolutionM
        : null;

  const hasStats = mean != null && Number.isFinite(mean);
  const areaM2 = areaHa * 10000;
  const areaKm2 = areaHa / 100;

  const classAnalytics =
    rasterSample && hasStats
      ? computeIndexClassAnalyticsFromRaster({
          raster: rasterSample,
          layerId,
          feature,
          analysisDateIso,
          legendBandCount: SI_WMS_SPECTRAL_CLASS_COUNT,
          classifiedStops: args.classifiedStops,
          totalAreaM2Override: areaHa > 0 ? areaHa * 10000 : null,
        })
      : null;

  let clickedClass: LiveAoiClickedClassInfo | null = null;
  if (
    classAnalytics &&
    rasterSample &&
    clickLng != null &&
    clickLat != null &&
    Number.isFinite(clickLng) &&
    Number.isFinite(clickLat)
  ) {
    clickedClass = classAtRasterClick({
      raster: rasterSample,
      layerId,
      lng: clickLng,
      lat: clickLat,
      analytics: classAnalytics,
    });
  }

  const base: LiveAoiStatsViewModel = {
    aoiKey,
    aoiName,
    layerName,
    layerId,
    analysisDateIso: analysisDateIso.slice(0, 10),
    pixelCount,
    totalPixelCount,
    validPixelCount,
    approxResolutionM,
    min,
    max,
    mean,
    areaHa,
    areaM2,
    areaKm2,
    status: resolveMaskedStatsStatus(status, hasStats),
    classAnalytics,
    cover: classAnalytics?.cover ?? null,
    clickedClass,
    indexAnalysis: null,
  };

  base.indexAnalysis = buildLiveAoiIndexAnalysisSummary(base);
  return base;
}

/** User-facing hint when raster stats are missing or sampling failed. */
export function liveAoiStatsStatusHint(
  status: LiveAoiAnalysisStatus,
  loading: boolean,
): string | null {
  if (loading) return null;
  switch (status) {
    case 'unavailable':
      return 'Live layer sampling unavailable — check Sentinel Hub WMS configuration';
    case 'error':
      return 'Sampling failed — try another date, spectral index, or AOI';
    case 'idle':
      return 'Click inside the AOI to refresh live stats';
    default:
      return null;
  }
}

export { formatAreaTriple };
