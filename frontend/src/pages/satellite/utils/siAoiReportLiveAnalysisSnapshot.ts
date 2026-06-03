/**
 * Serializable live-layer analysis snapshot for report preview + PDF/DOCX export.
 * Built only from AOI-clipped raster pixels (MPC / analysis_engine).
 */
import {
  computeIndexClassAnalyticsFromRaster,
  type SiIndexClassAnalytics,
  type SiIndexClassRow,
  type SiIndexCoverPair,
} from './siIndexClassAnalytics';
import {
  computeAoiIndexHealthBreakdown,
  computeAoiZonalAnalytics,
  roundIndexDisplay,
  type SiAoiIndexHealthBreakdown,
  type SiAoiRasterHistogramBin,
  type SiAoiRasterPixelSample,
  type SiAoiZonalAnalytics,
  type SiAoiZonalIndexStats,
} from './siAoiZonalStats';
import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import { STATIC_AOI_CHART_LAYER_OPTIONS, type StaticAoiChartLayerId } from './staticAoiChartTypes';

export type SiAoiLegendBandCount = 5 | 10;

export type SiAoiReportLiveHealthRow = {
  band: string;
  label: string;
  pct: number;
  areaHa: number;
  meanIndex: number;
  tone: 'high' | 'medium' | 'low';
};

export type SiAoiReportLiveAnalysisSnapshot = {
  aoiId: string;
  aoiName: string;
  analysisDateIso: string;
  activeLayerId: StaticAoiChartLayerId;
  activeLayerLabel: string;
  dataSource: 'raster';
  areaHa: number;
  areaM2: number;
  pixelCount: number;
  validPixelCount: number;
  approxResolutionM: number | null;
  confidencePct: number;
  indices: Partial<Record<StaticAoiChartLayerId, SiAoiZonalIndexStats>>;
  healthRows: SiAoiReportLiveHealthRow[];
  healthLayerLabel: string;
  healthPrimaryMean: number | null;
  /** Pixel-based legend class distribution for the active layer only. */
  classAnalytics: SiIndexClassAnalytics | null;
  classRows: SiIndexClassRow[];
  cover: SiIndexCoverPair | null;
  legendBandCount: SiAoiLegendBandCount;
  histograms: Partial<Record<StaticAoiChartLayerId, SiAoiRasterHistogramBin[]>>;
  capturedAtIso: string;
};

export function siAoiReportLiveAnalysisFingerprint(opts: {
  feature: GeoJSON.Feature;
  analysisDateIso: string;
  layerIds: StaticAoiChartLayerId[];
}): string {
  let geom = '';
  try {
    geom = JSON.stringify(opts.feature.geometry);
  } catch {
    geom = String(opts.feature.id ?? '');
  }
  return `${opts.analysisDateIso}|${opts.layerIds.join(',')}|${geom.slice(0, 400)}`;
}

export function buildSiAoiReportLiveAnalysisSnapshot(opts: {
  aoiId: string;
  aoiName: string;
  feature: GeoJSON.Feature;
  rasterSample: SiAoiRasterPixelSample;
  activeLayerId: StaticAoiChartLayerId;
  analysisDateIso: string;
  layerIds: StaticAoiChartLayerId[];
  legendBandCount?: SiAoiLegendBandCount;
  classifiedStops?: readonly IndexRampStop[] | null;
}): SiAoiReportLiveAnalysisSnapshot | null {
  const g = opts.feature.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return null;
  if (!opts.rasterSample.grid?.length) return null;

  const samplingLayers = [opts.activeLayerId].filter(id => id !== 'LST');
  const analytics = computeAoiZonalAnalytics({
    feature: opts.feature,
    aoiKey: opts.aoiId,
    layerIds: samplingLayers,
    weekIdx: 0,
    nWeeks: 1,
    anchorWeeklyMean: 0,
    analysisDateIso: opts.analysisDateIso,
    rasterSample: opts.rasterSample,
    allowSyntheticFallback: false,
  });
  if (!analytics || analytics.dataSource !== 'raster') return null;

  const classAnalytics = computeIndexClassAnalyticsFromRaster({
    raster: opts.rasterSample,
    layerId: opts.activeLayerId,
    feature: opts.feature,
    analysisDateIso: opts.analysisDateIso,
    legendBandCount: opts.legendBandCount,
    classifiedStops: opts.classifiedStops,
  });

  const health = computeAoiIndexHealthBreakdown({
    feature: opts.feature,
    aoiKey: opts.aoiId,
    layerId: opts.activeLayerId,
    weekCtx: {
      weekIdx: 0,
      nWeeks: 1,
      anchorWeeklyMean: 0,
      analysisDateIso: opts.analysisDateIso,
    },
    rasterSample: opts.rasterSample,
    allowSyntheticFallback: false,
  });

  const layerMeta = STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === opts.activeLayerId);
  const activeOnlyIndices: Partial<Record<StaticAoiChartLayerId, SiAoiZonalIndexStats>> = {};
  const activeStats = analytics.indices[opts.activeLayerId];
  if (activeStats) activeOnlyIndices[opts.activeLayerId] = activeStats;

  const confidencePct = Math.round(
    (analytics.validPixelCount / Math.max(1, analytics.pixelCount)) * 100,
  );

  return {
    aoiId: opts.aoiId,
    aoiName: opts.aoiName,
    analysisDateIso: analytics.analysisDateIso,
    activeLayerId: opts.activeLayerId,
    activeLayerLabel: layerMeta?.label ?? opts.activeLayerId,
    dataSource: 'raster',
    areaHa: analytics.areaHa,
    areaM2: analytics.areaM2,
    pixelCount: analytics.pixelCount,
    validPixelCount: analytics.validPixelCount,
    approxResolutionM: analytics.approxResolutionM,
    confidencePct,
    indices: activeOnlyIndices,
    healthRows: (health?.rows ?? []).map(r => ({
      band: r.band,
      label: r.label,
      pct: r.pct,
      areaHa: r.areaHa,
      meanIndex: r.meanIndex,
      tone: r.tone,
    })),
    healthLayerLabel: health?.layerLabel ?? layerMeta?.label ?? opts.activeLayerId,
    healthPrimaryMean: health?.primaryMean ?? classAnalytics?.mean ?? null,
    classAnalytics,
    classRows: classAnalytics?.classes ?? [],
    cover: classAnalytics?.cover ?? null,
    legendBandCount: classAnalytics?.legendBandCount ?? opts.legendBandCount ?? 5,
    histograms: opts.rasterSample.histograms?.[opts.activeLayerId]
      ? { [opts.activeLayerId]: opts.rasterSample.histograms[opts.activeLayerId]! }
      : {},
    capturedAtIso: new Date().toISOString(),
  };
}

export function formatReportIndexValue(v: number, layerId: StaticAoiChartLayerId): string {
  return roundIndexDisplay(v, layerId);
}

export function liveAnalysisToZonalAnalytics(snap: SiAoiReportLiveAnalysisSnapshot): SiAoiZonalAnalytics {
  return {
    areaHa: snap.areaHa,
    areaM2: snap.areaM2,
    areaKm2: snap.areaHa / 100,
    pixelCount: snap.pixelCount,
    validPixelCount: snap.validPixelCount,
    approxResolutionM: snap.approxResolutionM,
    analysisDateIso: snap.analysisDateIso,
    indices: snap.indices,
    dataSource: 'raster',
  };
}

export function liveAnalysisToIndexHealth(snap: SiAoiReportLiveAnalysisSnapshot): SiAoiIndexHealthBreakdown | null {
  if (!snap.healthRows.length) return null;
  return {
    layerId: snap.activeLayerId,
    layerLabel: snap.healthLayerLabel,
    primaryMean: snap.healthPrimaryMean ?? NaN,
    rows: snap.healthRows.map(r => ({
      band: r.band,
      label: r.label,
      pct: r.pct,
      areaHa: r.areaHa,
      meanIndex: r.meanIndex,
      color: r.tone === 'high' ? '#22c55e' : r.tone === 'medium' ? '#eab308' : '#ef4444',
      tone: r.tone,
    })),
  };
}
