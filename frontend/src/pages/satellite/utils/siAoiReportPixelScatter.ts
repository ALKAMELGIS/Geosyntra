import {
  STATIC_AOI_CHART_LAYER_OPTIONS,
  staticAoiLayerMeanForWeek,
  type StaticAoiChartLayerId,
} from './staticAoiMultiChartData';
import type { SiAoiReportModel } from './siAoiVegetationReportModel';

export type SiAoiPixelScatterPoint = { x: number; y: number };

export type SiAoiPixelScatterModel = {
  points: SiAoiPixelScatterPoint[];
  slope: number;
  intercept: number;
  r2: number;
  xId: StaticAoiChartLayerId;
  yId: StaticAoiChartLayerId;
  xLabel: string;
  yLabel: string;
  weekLabel: string;
};

function polygonRingCentroid(ring: number[][]): [number, number] | null {
  if (!ring?.length) return null;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const p of ring) {
    if (p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
      sx += p[0]!;
      sy += p[1]!;
      n++;
    }
  }
  if (!n) return null;
  return [sx / n, sy / n];
}

function featureCentroidLngLat(f: GeoJSON.Feature): [number, number] | null {
  const g = f.geometry;
  if (!g) return null;
  if (g.type === 'Polygon') {
    const outer = g.coordinates[0];
    return outer ? polygonRingCentroid(outer) : null;
  }
  if (g.type === 'MultiPolygon') {
    const first = g.coordinates[0]?.[0];
    return first ? polygonRingCentroid(first) : null;
  }
  return null;
}

export function aoiOutlineFingerprint(report: SiAoiReportModel): string {
  const g = report.aoiOutlineGeoJson.features[0]?.geometry;
  return JSON.stringify(g ?? {}).slice(0, 240);
}

/** Ordinary least squares + coefficient of determination R². */
export function linearRegressionWithR2(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return { slope: NaN, intercept: NaN, r2: NaN };
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i]!;
    my += ys[i]!;
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxx += dx * dx;
    sxy += dx * dy;
  }
  if (sxx < 1e-18) return { slope: NaN, intercept: NaN, r2: NaN };
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const yhat = slope * xs[i]! + intercept;
    const dy = ys[i]! - my;
    ssTot += dy * dy;
    ssRes += (ys[i]! - yhat) ** 2;
  }
  const r2 = ssTot < 1e-18 ? NaN : Math.max(0, Math.min(1, 1 - ssRes / ssTot));
  return { slope, intercept, r2 };
}

/**
 * Sample AOI “pixel” cells from the report heatmap GeoJSON and assign synthetic index values
 * per cell (same engine as the static AOI chart) so X vs Y correlates with a meaningful R² demo.
 */
export function buildSiAoiPixelScatterModel(
  report: SiAoiReportModel,
  yIndexId: StaticAoiChartLayerId,
  weeklyAnchorMeans: number[],
  maxPoints = 420,
): SiAoiPixelScatterModel | null {
  const xId = report.indexId;
  if (yIndexId === xId) return null;
  const feats = report.heatmapCellsGeoJson?.features ?? [];
  if (!feats.length) return null;

  const baseKey = aoiOutlineFingerprint(report);
  const ts = report.timeSeries;
  const nWeeks = Math.max(1, ts.length);
  const mid = Math.min(nWeeks - 1, Math.max(0, Math.floor(nWeeks / 2)));
  const weekLabel = ts[mid]?.date ?? '';

  const anchor =
    weeklyAnchorMeans.length > mid && Number.isFinite(weeklyAnchorMeans[mid]!)
      ? weeklyAnchorMeans[mid]!
      : 0.45;

  const points: SiAoiPixelScatterPoint[] = [];
  const step = Math.max(1, Math.ceil(feats.length / maxPoints));
  for (let i = 0; i < feats.length; i += step) {
    const c = featureCentroidLngLat(feats[i]!);
    if (!c) continue;
    const [lng, lat] = c;
    const cellKey = `${baseKey}|${lng.toFixed(6)}|${lat.toFixed(6)}`;
    const x = staticAoiLayerMeanForWeek(xId, mid, nWeeks, cellKey, anchor);
    const y = staticAoiLayerMeanForWeek(yIndexId, mid, nWeeks, cellKey, anchor);
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
  }

  if (points.length < 8) return null;

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const { slope, intercept, r2 } = linearRegressionWithR2(xs, ys);

  const xLabel = report.indexLabel;
  const yOpt = STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === yIndexId);

  return {
    points,
    slope,
    intercept,
    r2,
    xId,
    yId: yIndexId,
    xLabel,
    yLabel: yOpt?.label ?? yIndexId,
    weekLabel,
  };
}