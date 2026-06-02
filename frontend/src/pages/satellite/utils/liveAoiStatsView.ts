import type { LiveAoiAnalysisStatus } from '../hooks/useLiveAoiSpectralAnalysis';
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
};

function resolveMaskedStatsStatus(
  status: LiveAoiAnalysisStatus,
  hasStats: boolean,
): LiveAoiAnalysisStatus {
  if (status === 'loading' || status === 'idle') return status;
  if (hasStats) return status === 'error' ? 'ready' : status;
  if (status === 'ready') return 'error';
  return status;
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
    (indexZonal && Number.isFinite(indexZonal.mean) ? indexZonal.mean : null);

  const min =
    fromRaster?.min ??
    (indexZonal && Number.isFinite(indexZonal.min) ? indexZonal.min : null);

  const max =
    fromRaster?.max ??
    (indexZonal && Number.isFinite(indexZonal.max) ? indexZonal.max : null);

  const pixelCount =
    fromRaster?.validCount ??
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

  return {
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
  };
}

/** User-facing hint when raster stats are missing or sampling failed. */
export function liveAoiStatsStatusHint(
  status: LiveAoiAnalysisStatus,
  loading: boolean,
): string | null {
  if (loading) return null;
  switch (status) {
    case 'unavailable':
      return 'Start the analysis engine for live AOI sampling';
    case 'error':
      return 'Sampling failed — try another date, spectral index, or AOI';
    case 'idle':
      return 'Click inside the AOI to refresh live stats';
    default:
      return null;
  }
}

export { formatAreaTriple };
