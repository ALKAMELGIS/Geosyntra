/**
 * Phase-1 "Live Analysis" snapshot for map AOI charts (no timeline / no date range).
 */
import type { SiAoiSpectralProfileMini } from '../components/AoiSpectralProfileMiniChart';
import { staticAoiLayerMeanForWeek } from './staticAoiLayerSynthetic';
import { STATIC_AOI_CHART_LAYER_OPTIONS, type StaticAoiChartLayerId } from './staticAoiChartTypes';
import {
  computeAoiIndexHealthBreakdown,
  computeAoiZonalAnalytics,
  inferStaticAoiChartLayerFromWmsName,
  resolveAoiZonalWeekContext,
  roundIndexDisplay,
  type SiAoiIndexHealthBreakdown,
  type SiAoiZonalAnalytics,
} from './siAoiZonalStats';

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

function buildLiveSpectralProfile(
  feature: GeoJSON.Feature,
  aoiKey: string | null,
  weekCtx: ReturnType<typeof resolveAoiZonalWeekContext>,
  aoiHeatPointGeoJson: GeoJSON.FeatureCollection | null | undefined,
  activeLayerId: StaticAoiChartLayerId,
): SiAoiSpectralProfileMini | null {
  const fc = aoiHeatPointGeoJson;
  if (fc?.features?.length) {
    const vals = fc.features
      .map(f => (f.properties as { value?: number } | null | undefined)?.value)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (vals.length >= 6) {
      vals.sort((a, b) => a - b);
      const target = 72;
      const step = Math.max(1, Math.ceil(vals.length / target));
      const sampled: number[] = [];
      for (let i = 0; i < vals.length; i += step) sampled.push(vals[i]!);
      const yMin = Math.min(...sampled);
      const yMax = Math.max(...sampled);
      return {
        mode: 'pixels',
        values: sampled,
        labels: [],
        yMin,
        yMax,
        subtitle: `${activeLayerId} · ${vals.length} live AOI samples`,
      };
    }
  }

  const opticalDefs = STATIC_AOI_CHART_LAYER_OPTIONS.filter(o => o.id !== 'LST');
  const labels = opticalDefs.map(o => o.label);
  const values = opticalDefs.map(o =>
    staticAoiLayerMeanForWeek(o.id, weekCtx.weekIdx, weekCtx.nWeeks, aoiKey, weekCtx.anchorWeeklyMean),
  );
  const yMin = Math.min(...values);
  const yMax = Math.max(...values);
  return {
    mode: 'indices',
    values,
    labels,
    yMin,
    yMax,
    subtitle: aoiKey
      ? `Six optical indices · live layer snapshot`
      : `Draw an AOI for index fingerprint · live snapshot`,
  };
}

function zonalMeanForFeature(
  feature: GeoJSON.Feature,
  aoiKey: string | null,
  layerId: StaticAoiChartLayerId,
  weekCtx: ReturnType<typeof resolveAoiZonalWeekContext>,
): number {
  const z = computeAoiZonalAnalytics({
    feature,
    aoiKey,
    layerIds: [layerId],
    weekIdx: weekCtx.weekIdx,
    nWeeks: weekCtx.nWeeks,
    anchorWeeklyMean: weekCtx.anchorWeeklyMean,
    analysisDateIso: weekCtx.analysisDateIso,
  });
  const m = z?.indices[layerId]?.mean;
  if (typeof m === 'number' && Number.isFinite(m)) return m;
  return staticAoiLayerMeanForWeek(layerId, weekCtx.weekIdx, weekCtx.nWeeks, aoiKey, weekCtx.anchorWeeklyMean);
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
}): LiveAoiMapChartSnapshot | null {
  const activeLayerId = inferStaticAoiChartLayerFromWmsName(
    opts.activeWmsLayer || opts.selectedIndex || 'NDVI',
  );
  const layerMeta = STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === activeLayerId);
  const analysisDateIso = opts.analysisDateIso.slice(0, 10);
  const weekCtx = resolveAoiZonalWeekContext([], analysisDateIso, analysisDateIso, activeLayerId);

  const popupLayers: StaticAoiChartLayerId[] = ['NDVI', 'NDWI', 'SAVI', activeLayerId];
  const layerIds = [...new Set(popupLayers)] as StaticAoiChartLayerId[];

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
        layerIds,
        weekIdx: weekCtx.weekIdx,
        nWeeks: weekCtx.nWeeks,
        anchorWeeklyMean: weekCtx.anchorWeeklyMean,
        analysisDateIso: weekCtx.analysisDateIso,
      });
      health = computeAoiIndexHealthBreakdown({
        feature: primaryFeature,
        aoiKey: opts.aoiKey,
        layerId: activeLayerId,
        weekCtx,
      });
    }
  }

  const sketchGeomType = opts.drawnGeometry?.geometry?.type;
  if (
    opts.aoiKey &&
    opts.drawnGeometry &&
    (sketchGeomType === 'Polygon' || sketchGeomType === 'MultiPolygon')
  ) {
    fieldBars.push({
      name: 'Drawn AOI',
      value: zonalMeanForFeature(opts.drawnGeometry, opts.aoiKey, activeLayerId, weekCtx),
    });
  }

  for (const f of opts.savedFields ?? []) {
    const gt = f.geometry?.type;
    if (gt !== 'Polygon' && gt !== 'MultiPolygon') continue;
    const feat: GeoJSON.Feature = { type: 'Feature', geometry: f.geometry, properties: {} };
    fieldBars.push({
      name: (f.name && f.name.trim()) || f.id,
      value: zonalMeanForFeature(feat, `sat-field:${f.id}`, activeLayerId, weekCtx),
    });
  }

  for (const af of opts.aoiFields ?? []) {
    const gt = af.geometry?.type;
    if (gt !== 'Polygon' && gt !== 'MultiPolygon') continue;
    const feat: GeoJSON.Feature = { type: 'Feature', geometry: af.geometry, properties: {} };
    fieldBars.push({ name: af.name, value: zonalMeanForFeature(feat, `sat-aoif:${af.id}`, activeLayerId, weekCtx) });
  }

  const primaryIndexValue = zonal?.indices[activeLayerId]?.mean ?? null;

  const spectralProfile =
    primaryFeature && (primaryFeature.geometry?.type === 'Polygon' || primaryFeature.geometry?.type === 'MultiPolygon')
      ? buildLiveSpectralProfile(primaryFeature, opts.aoiKey, weekCtx, opts.aoiHeatPointGeoJson, activeLayerId)
      : null;

  if (!primaryFeature && fieldBars.length === 0) return null;

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
    fieldBarsSubtitle: `${activeLayerId} · live layer · ${formatLiveDateLabel(analysisDateIso)}`,
  };
}

export function formatLivePrimaryIndex(value: number | null, layerId: StaticAoiChartLayerId): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return roundIndexDisplay(value, layerId);
}
