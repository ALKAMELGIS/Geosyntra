import { buildAoiInteriorGrid, type SiAoiRasterPixelSample } from './siAoiZonalStats';
import { linearRegressionWithR2 } from './siAoiReportPixelScatter';
import { staticAoiLayerMeanForWeek } from './staticAoiLayerSynthetic';
import type { StaticAoiChartLayerId, WeeklyCompositeLite } from './staticAoiChartTypes';
import { STATIC_AOI_CHART_LAYER_OPTIONS } from './staticAoiChartTypes';
import { formatStaticChartWeekLabel } from './staticAoiLayerSynthetic';

export type StaticAoiIndexCrossScatterPoint = { x: number; y: number };

export type StaticAoiIndexCrossScatterModel = {
  points: StaticAoiIndexCrossScatterPoint[];
  slope: number;
  intercept: number;
  r2: number;
  n: number;
  xId: StaticAoiChartLayerId;
  yId: StaticAoiChartLayerId;
  xLabel: string;
  yLabel: string;
  weekLabel: string;
  weekIdx: number;
  xLst: boolean;
  yLst: boolean;
  dataSource: 'raster' | 'synthetic';
};

function cellKeyForPixel(aoiKey: string | null, lng: number, lat: number): string {
  return `${aoiKey ?? 'aoi'}|${lng.toFixed(5)}|${lat.toFixed(5)}`;
}

function layerMeta(id: StaticAoiChartLayerId) {
  return STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === id);
}

function pointsFromRaster(
  raster: SiAoiRasterPixelSample,
  xId: StaticAoiChartLayerId,
  yId: StaticAoiChartLayerId,
): StaticAoiIndexCrossScatterPoint[] {
  const xs = raster.layers[xId];
  const ys = raster.layers[yId];
  const n = raster.grid.length;
  if (!xs?.length || !ys?.length || xs.length !== n || ys.length !== n) return [];
  const out: StaticAoiIndexCrossScatterPoint[] = [];
  for (let i = 0; i < n; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}

function pointsFromSyntheticGrid(
  feature: GeoJSON.Feature,
  aoiKey: string | null,
  xId: StaticAoiChartLayerId,
  yId: StaticAoiChartLayerId,
  weekIdx: number,
  weekly: WeeklyCompositeLite[],
  maxCells: number,
): StaticAoiIndexCrossScatterPoint[] {
  const grid = buildAoiInteriorGrid(feature, maxCells);
  if (!grid.length || !weekly.length) return [];
  const nWeeks = weekly.length;
  const wIdx = Math.max(0, Math.min(weekIdx, nWeeks - 1));
  const anchor = weekly[wIdx]?.mean ?? 0.45;
  const out: StaticAoiIndexCrossScatterPoint[] = [];
  for (const p of grid) {
    const ck = cellKeyForPixel(aoiKey, p.lng, p.lat);
    const x = staticAoiLayerMeanForWeek(xId, wIdx, nWeeks, ck, anchor);
    const y = staticAoiLayerMeanForWeek(yId, wIdx, nWeeks, ck, anchor);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}

/**
 * AOI pixel scatter for two index layers (X vs Y) with OLS + R².
 * Prefers MPC raster samples when both layers are present; otherwise synthetic per-cell grid.
 */
export function buildStaticAoiIndexCrossScatterModel(opts: {
  xLayerId: StaticAoiChartLayerId;
  yLayerId: StaticAoiChartLayerId;
  xLabel?: string;
  yLabel?: string;
  feature: GeoJSON.Feature | null;
  aoiKey: string | null;
  weekIdx: number;
  weekly: WeeklyCompositeLite[];
  raster?: SiAoiRasterPixelSample | null;
  maxCells?: number;
}): StaticAoiIndexCrossScatterModel | null {
  const xId = opts.xLayerId;
  const yId = opts.yLayerId;
  if (xId === yId) return null;

  const xLabel = opts.xLabel?.trim() || layerMeta(xId)?.label || xId;
  const yLabel = opts.yLabel?.trim() || layerMeta(yId)?.label || yId;

  let points: StaticAoiIndexCrossScatterPoint[] = [];
  let dataSource: 'raster' | 'synthetic' = 'synthetic';

  if (opts.raster?.grid?.length) {
    const fromRaster = pointsFromRaster(opts.raster, xId, yId);
    if (fromRaster.length >= 8) {
      points = fromRaster;
      dataSource = 'raster';
    }
  }

  if (points.length < 8 && opts.feature?.geometry) {
    const geom = opts.feature.geometry;
    if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
      points = pointsFromSyntheticGrid(
        opts.feature,
        opts.aoiKey,
        xId,
        yId,
        opts.weekIdx,
        opts.weekly,
        opts.maxCells ?? 2500,
      );
      dataSource = 'synthetic';
    }
  }

  if (points.length < 8) return null;

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const { slope, intercept, r2 } = linearRegressionWithR2(xs, ys);

  const nWeeks = Math.max(1, opts.weekly.length);
  const wIdx = Math.max(0, Math.min(opts.weekIdx, nWeeks - 1));
  const weekLabel = opts.weekly[wIdx]
    ? formatStaticChartWeekLabel(opts.weekly[wIdx]!.startDate)
    : '';

  return {
    points,
    slope,
    intercept,
    r2,
    n: points.length,
    xId,
    yId,
    xLabel,
    yLabel,
    weekLabel,
    weekIdx: wIdx,
    xLst: xId === 'LST',
    yLst: yId === 'LST',
    dataSource,
  };
}

/** Regression segment spanning observed X range (for Chart.js line dataset). */
export function regressionLineEndpoints(
  model: Pick<StaticAoiIndexCrossScatterModel, 'points' | 'slope' | 'intercept'>,
): [{ x: number; y: number }, { x: number; y: number }] | null {
  if (!Number.isFinite(model.slope) || !Number.isFinite(model.intercept) || !model.points.length) {
    return null;
  }
  const xs = model.points.map(p => p.x);
  const mn = Math.min(...xs);
  const mx = Math.max(...xs);
  const pad = (mx - mn) * 0.02 || 0.01;
  const x0 = mn - pad;
  const x1 = mx + pad;
  return [
    { x: x0, y: model.slope * x0 + model.intercept },
    { x: x1, y: model.slope * x1 + model.intercept },
  ];
}
