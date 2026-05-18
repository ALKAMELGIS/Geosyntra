/**
 * Live AOI dashboard snapshot — values from AOI-clipped raster pixels when available.
 */
import type { SiAoiSpectralProfileMini } from '../components/AoiSpectralProfileMiniChart';
import {
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
import { STATIC_AOI_CHART_LAYER_OPTIONS, type StaticAoiChartLayerId } from './staticAoiChartTypes';

export type LiveAoiMapChartSnapshot = {
  analysisDateIso: string;
  analysisDateLabel: string;
  activeLayerId: StaticAoiChartLayerId;
  activeLayerLabel: string;
  zonal: SiAoiZonalAnalytics | null;
  health: SiAoiIndexHealthBreakdown | null;
  primaryIndexValue: number | null;
  spectralProfile: SiAoiSpectralProfileMini | null;
  fieldBars: Array<{ name: string; value: number }>;
  fieldBarsSubtitle: string;
  dataSource?: 'raster' | 'synthetic';
  pixelCount?: number;
  confidencePct?: number;
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
  const labels = ids.map(id => STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === id)?.label ?? id);
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
      subtitle: 'Optical indices · AOI-clipped raster pixels',
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
      subtitle: `${activeLayerId} · ${activeVals.length} raster pixels`,
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
  allowSyntheticFallback?: boolean;
}): LiveAoiMapChartSnapshot | null {
  const activeLayerId = inferStaticAoiChartLayerFromWmsName(
    opts.activeWmsLayer || opts.selectedIndex || 'NDVI',
  );
  const layerMeta = STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === activeLayerId);
  const analysisDateIso = opts.analysisDateIso.slice(0, 10);
  const weekCtx = resolveAoiZonalWeekContext([], analysisDateIso, analysisDateIso, activeLayerId);
  const popupLayers: StaticAoiChartLayerId[] = [
    ...new Set<StaticAoiChartLayerId>(['NDVI', 'NDWI', 'SAVI', activeLayerId]),
  ];
  const raster = opts.rasterSample ?? null;
  const useRaster = Boolean(raster?.grid?.length);

  let zonal: SiAoiZonalAnalytics | null = null;
  let health: SiAoiIndexHealthBreakdown | null = null;
  const fieldBars: Array<{ name: string; value: number }> = [];

  const primaryFeature = opts.feature;
  if (primaryFeature?.geometry) {
    const gt = primaryFeature.geometry.type;
    if (gt === 'Polygon' || gt === 'MultiPolygon') {
      zonal = computeAoiZonalAnalytics({
        feature: primaryFeature,
        aoiKey: opts.aoiKey,
        layerIds: popupLayers,
        weekIdx: weekCtx.weekIdx,
        nWeeks: weekCtx.nWeeks,
        anchorWeeklyMean: weekCtx.anchorWeeklyMean,
        analysisDateIso: weekCtx.analysisDateIso,
        rasterSample: raster,
        allowSyntheticFallback: opts.allowSyntheticFallback !== false && !useRaster,
      });
      health = computeAoiIndexHealthBreakdown({
        feature: primaryFeature,
        aoiKey: opts.aoiKey,
        layerId: activeLayerId,
        weekCtx,
        rasterSample: raster,
        allowSyntheticFallback: opts.allowSyntheticFallback !== false && !useRaster,
      });
    }
  }

  if (useRaster && raster) {
    const sketchGeomType = opts.drawnGeometry?.geometry?.type;
    if (
      opts.drawnGeometry &&
      (sketchGeomType === 'Polygon' || sketchGeomType === 'MultiPolygon')
    ) {
      const v = zonalMeanFromRaster(raster, activeLayerId);
      if (v != null) fieldBars.push({ name: 'Drawn AOI', value: v });
    }
  }

  const primaryIndexValue = zonal?.indices[activeLayerId]?.mean ?? null;

  const spectralProfile =
    useRaster && raster
      ? buildSpectralProfileFromRaster(raster, activeLayerId)
      : null;

  if (!primaryFeature && fieldBars.length === 0 && !zonal) return null;

  const activeVals = useRaster && raster ? finitePixelValues(raster.layers[activeLayerId]) : [];
  const confidencePct =
    useRaster && raster?.grid?.length
      ? Math.round((activeVals.length / Math.max(1, raster.grid.length)) * 100)
      : undefined;

  return {
    analysisDateIso,
    analysisDateLabel: formatLiveDateLabel(analysisDateIso),
    activeLayerId,
    activeLayerLabel: layerMeta?.label ?? activeLayerId,
    zonal,
    health,
    primaryIndexValue,
    spectralProfile,
    fieldBars: fieldBars.slice(0, 14),
    fieldBarsSubtitle: useRaster
      ? `${activeLayerId} · raster pixels · ${formatLiveDateLabel(analysisDateIso)}`
      : `${activeLayerId} · ${formatLiveDateLabel(analysisDateIso)}`,
    dataSource: useRaster ? 'raster' : zonal?.dataSource,
    pixelCount: useRaster ? raster?.grid.length : zonal?.pixelCount,
    confidencePct,
  };
}

export function formatLivePrimaryIndex(value: number | null, layerId: StaticAoiChartLayerId): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return roundIndexDisplay(value, layerId);
}
