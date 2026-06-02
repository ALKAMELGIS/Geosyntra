/**
 * Live AOI dashboard snapshot — values from AOI-clipped raster pixels when available.
 */
import type { SiAoiSpectralProfileMini } from '../components/AoiSpectralProfileMiniChart';
import {
  LIVE_AOI_PANEL_LAYER_IDS,
  liveAoiDisplayLabel,
} from './liveAoiEnvironmentalLayers';
import {
  computeAoiGeometryBaseline,
  computeAoiIndexHealthBreakdown,
  computeAoiZonalAnalytics,
  inferStaticAoiChartLayerFromWmsName,
  resolveAoiZonalWeekContext,
  roundIndexDisplay,
  type SiAoiIndexHealthBreakdown,
  type SiAoiRasterPixelSample,
  type SiAoiZonalAnalytics,
} from './siAoiZonalStats';
import { finitePixelValues, opticalLayerIdsForSpectralProfile } from './liveAoiSpectralStats';
import { STATIC_AOI_CHART_LAYER_OPTIONS, type StaticAoiChartLayerId, type WeeklyCompositeLite } from './staticAoiChartTypes';
import {
  activeIndexStatsFromZonal,
  deriveEnvironmentalIndicators,
  type LiveAoiActiveIndexStats,
  type LiveAoiEnvironmentalIndicators,
} from './liveAoiEnvironmentalIndicators';

export type { LiveAoiActiveIndexStats, LiveAoiEnvironmentalIndicators };

export type LiveAoiMapChartSnapshot = {
  analysisDateIso: string;
  analysisDateLabel: string;
  seriesStartIso?: string;
  seriesEndIso?: string;
  activeLayerId: StaticAoiChartLayerId;
  activeLayerLabel: string;
  zonal: SiAoiZonalAnalytics | null;
  health: SiAoiIndexHealthBreakdown | null;
  primaryIndexValue: number | null;
  spectralProfile: SiAoiSpectralProfileMini | null;
  fieldBars: Array<{ name: string; value: number; layerId?: StaticAoiChartLayerId }>;
  fieldBarsSubtitle: string;
  dataSource?: 'raster' | 'synthetic' | 'geometry' | 'map-layer';
  pixelCount?: number;
  confidencePct?: number;
  activeIndexStats?: LiveAoiActiveIndexStats | null;
  environmental?: LiveAoiEnvironmentalIndicators | null;
  updatedAtIso?: string | null;
  liveLayerLabel?: string;
};

function formatLiveDateLabel(iso: string): string {
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'Latest update';
  try {
    const dt = new Date(`${d}T12:00:00Z`);
    return `Latest · ${dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } catch {
    return `Latest · ${d}`;
  }
}

function buildSpectralProfileFromRaster(
  raster: SiAoiRasterPixelSample,
  activeLayerId: StaticAoiChartLayerId,
): SiAoiSpectralProfileMini | null {
  const ids = opticalLayerIdsForSpectralProfile(activeLayerId);
  const labels = ids.map(id => liveAoiDisplayLabel(id));
  const values = ids.map(id => {
    const finite = finitePixelValues(raster.layers[id]);
    if (!finite.length) return NaN;
    return finite.reduce((a, b) => a + b, 0) / finite.length;
  });
  const finiteMeans = values.filter(Number.isFinite);
  if (finiteMeans.length >= 2) {
    return {
      mode: 'indices',
      values: values as number[],
      labels,
      yMin: Math.min(...finiteMeans),
      yMax: Math.max(...finiteMeans),
      subtitle: 'Environmental indices · AOI-clipped raster pixels',
    };
  }
  const activeVals = finitePixelValues(raster.layers[activeLayerId]);
  if (activeVals.length >= 6) {
    const sorted = [...activeVals].sort((a, b) => a - b);
    const step = Math.max(1, Math.ceil(sorted.length / 72));
    const sampled: number[] = [];
    for (let i = 0; i < sorted.length; i += step) sampled.push(sorted[i]!);
    return {
      mode: 'pixels',
      values: sampled,
      labels: [],
      yMin: Math.min(...sampled),
      yMax: Math.max(...sampled),
      subtitle: `${liveAoiDisplayLabel(activeLayerId)} · ${activeVals.length} raster pixels`,
    };
  }
  return null;
}

function zonalMeanFromRaster(
  raster: SiAoiRasterPixelSample,
  layerId: StaticAoiChartLayerId,
): number | null {
  const finite = finitePixelValues(raster.layers[layerId]);
  if (!finite.length) return null;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}

function pushFieldBar(
  fieldBars: LiveAoiMapChartSnapshot['fieldBars'],
  layerId: StaticAoiChartLayerId,
  value: number | null | undefined,
) {
  if (value == null || !Number.isFinite(value)) return;
  fieldBars.push({
    name: liveAoiDisplayLabel(layerId),
    value,
    layerId,
  });
}

export function buildLiveAoiMapChartSnapshot(opts: {
  feature: GeoJSON.Feature | null;
  aoiKey: string | null;
  activeWmsLayer: string;
  selectedIndex: string;
  analysisDateIso: string;
  aoiHeatPointGeoJson?: GeoJSON.FeatureCollection | null;
  savedFields?: Array<{ id: string; name?: string; geometry: GeoJSON.Geometry }>;
  aoiFields?: Array<{ id: string; name: string; geometry: GeoJSON.Geometry }>;
  drawnGeometry?: GeoJSON.Feature | null;
  rasterSample?: SiAoiRasterPixelSample | null;
  weeklyComposites?: readonly WeeklyCompositeLite[];
  timelineIndexMean?: number | null;
  precomputedZonal?: SiAoiZonalAnalytics | null;
  precomputedHealth?: SiAoiIndexHealthBreakdown | null;
  allowSyntheticFallback?: boolean;
  timelineStartIso?: string;
  timelineEndIso?: string;
  liveMapIndexStats?: {
    layerId: StaticAoiChartLayerId;
    mean: number;
    min: number;
    max: number;
    std?: number;
  } | null;
}): LiveAoiMapChartSnapshot | null {
  const activeLayerId = inferStaticAoiChartLayerFromWmsName(
    opts.activeWmsLayer || opts.selectedIndex || '',
    opts.selectedIndex,
  );
  const layerMeta = STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === activeLayerId);
  const analysisDateIso = opts.analysisDateIso.slice(0, 10);
  const weekCtx = resolveAoiZonalWeekContext(
    opts.weeklyComposites ?? [],
    analysisDateIso,
    analysisDateIso,
    activeLayerId,
  );
  const panelLayers: StaticAoiChartLayerId[] = [
    ...new Set<StaticAoiChartLayerId>([...LIVE_AOI_PANEL_LAYER_IDS, activeLayerId]),
  ];
  const raster = opts.rasterSample ?? null;
  const useRaster = Boolean(raster?.grid?.length);

  let zonal: SiAoiZonalAnalytics | null = opts.precomputedZonal ?? null;
  let health: SiAoiIndexHealthBreakdown | null = useRaster ? (opts.precomputedHealth ?? null) : null;
  const fieldBars: LiveAoiMapChartSnapshot['fieldBars'] = [];

  const primaryFeature = opts.feature;
  if (!zonal && primaryFeature?.geometry && useRaster) {
    const gt = primaryFeature.geometry.type;
    if (gt === 'Polygon' || gt === 'MultiPolygon') {
      zonal = computeAoiZonalAnalytics({
        feature: primaryFeature,
        aoiKey: opts.aoiKey,
        layerIds: panelLayers,
        weekIdx: weekCtx.weekIdx,
        nWeeks: weekCtx.nWeeks,
        anchorWeeklyMean: weekCtx.anchorWeeklyMean,
        analysisDateIso: weekCtx.analysisDateIso,
        rasterSample: raster,
        allowSyntheticFallback: false,
      });
      if (!health) {
        health = computeAoiIndexHealthBreakdown({
          feature: primaryFeature,
          aoiKey: opts.aoiKey,
          layerId: activeLayerId,
          weekCtx,
          rasterSample: raster,
          allowSyntheticFallback: false,
        });
      }
    }
  }

  if (zonal?.dataSource === 'raster') {
    for (const id of panelLayers) {
      pushFieldBar(fieldBars, id, zonal.indices[id]?.mean);
    }
  } else if (useRaster && raster) {
    for (const id of panelLayers) {
      pushFieldBar(fieldBars, id, zonalMeanFromRaster(raster, id));
    }
  }

  if (
    activeLayerId === 'LST' &&
    typeof opts.timelineIndexMean === 'number' &&
    Number.isFinite(opts.timelineIndexMean)
  ) {
    pushFieldBar(fieldBars, 'LST', opts.timelineIndexMean);
  }

  let primaryIndexValue: number | null = null;
  if (useRaster && raster) {
    primaryIndexValue = zonalMeanFromRaster(raster, activeLayerId);
  }
  if (
    (primaryIndexValue == null || !Number.isFinite(primaryIndexValue)) &&
    activeLayerId === 'LST' &&
    typeof opts.timelineIndexMean === 'number' &&
    Number.isFinite(opts.timelineIndexMean)
  ) {
    primaryIndexValue = opts.timelineIndexMean;
  }

  const spectralProfile =
    useRaster && raster ? buildSpectralProfileFromRaster(raster, activeLayerId) : null;

  if (!useRaster && opts.allowSyntheticFallback === false) {
    if (!primaryFeature) return null;
    const gt = primaryFeature.geometry;
    const areaOnly =
      gt && (gt.type === 'Polygon' || gt.type === 'MultiPolygon')
        ? computeAoiGeometryBaseline(primaryFeature, analysisDateIso)
        : null;
    const seriesStart = (opts.timelineStartIso ?? '').trim().slice(0, 10);
    const seriesEnd = (opts.timelineEndIso ?? '').trim().slice(0, 10);
    return {
      analysisDateIso,
      analysisDateLabel: formatLiveDateLabel(analysisDateIso),
      seriesStartIso: seriesStart || undefined,
      seriesEndIso: seriesEnd || undefined,
      activeLayerId,
      activeLayerLabel: liveAoiDisplayLabel(activeLayerId),
      zonal: areaOnly,
      health: null,
      primaryIndexValue: null,
      spectralProfile: null,
      fieldBars: [],
      fieldBarsSubtitle: areaOnly?.areaHa
        ? `AOI area · ${formatLiveDateLabel(analysisDateIso)} · awaiting live raster pixels`
        : 'Awaiting AOI-clipped raster from analysis engine',
      dataSource: 'geometry',
      activeIndexStats: null,
      environmental: null,
    };
  }

  if (!primaryFeature && fieldBars.length === 0 && !zonal) return null;

  const activeVals = useRaster && raster ? finitePixelValues(raster.layers[activeLayerId]) : [];
  const confidencePct =
    useRaster && raster?.grid?.length
      ? Math.round((activeVals.length / Math.max(1, raster.grid.length)) * 100)
      : undefined;

  const seriesStart = (opts.timelineStartIso ?? '').trim().slice(0, 10);
  const seriesEnd = (opts.timelineEndIso ?? '').trim().slice(0, 10);

  const lstMean =
    activeLayerId === 'LST' && typeof opts.timelineIndexMean === 'number'
      ? opts.timelineIndexMean
      : zonal?.indices.LST?.mean ?? null;

  const environmental = deriveEnvironmentalIndicators(zonal, lstMean);
  const activeIndexStats = activeIndexStatsFromZonal(zonal, activeLayerId);

  return {
    analysisDateIso,
    analysisDateLabel: formatLiveDateLabel(analysisDateIso),
    seriesStartIso: seriesStart || undefined,
    seriesEndIso: seriesEnd || undefined,
    activeLayerId,
    activeLayerLabel: liveAoiDisplayLabel(activeLayerId),
    zonal,
    health,
    primaryIndexValue,
    spectralProfile,
    fieldBars: fieldBars.slice(0, 14),
    fieldBarsSubtitle: useRaster
      ? `${liveAoiDisplayLabel(activeLayerId)} · raster pixels · ${formatLiveDateLabel(analysisDateIso)}`
      : `${activeLayerId} · ${formatLiveDateLabel(analysisDateIso)}`,
    dataSource: useRaster ? 'raster' : zonal?.dataSource,
    pixelCount: useRaster ? raster?.grid.length : zonal?.pixelCount,
    confidencePct,
    activeIndexStats,
    environmental,
    updatedAtIso: useRaster ? new Date().toISOString() : null,
    liveLayerLabel: 'Sentinel-2',
  };
}

export function formatLivePrimaryIndex(value: number | null, layerId: StaticAoiChartLayerId): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return roundIndexDisplay(value, layerId);
}
