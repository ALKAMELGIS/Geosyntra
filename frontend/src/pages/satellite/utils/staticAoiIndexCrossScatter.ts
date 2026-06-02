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

function layerSpan(id: StaticAoiChartLayerId): number {
  const m = layerMeta(id);
  const r0 = Number(m?.range?.[0] ?? -1);
  const r1 = Number(m?.range?.[1] ?? 1);
  const s = Math.abs(r1 - r0);
  return Number.isFinite(s) && s > 0 ? s : 2;
}

/** 32-bit avalanche hash — nearby cell keys produce statistically independent seeds. */
function seedFromKey(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Deterministic per-seed uniform PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample via Box–Muller (independent draws from the supplied PRNG). */
function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Plausible correlation for a synthetic index pair. Deterministic per pair so the chart is
 * stable, biased to physical reality (LST is inversely related to vegetation/water indices).
 */
function syntheticPairCorrelation(xId: StaticAoiChartLayerId, yId: StaticAoiChartLayerId): number {
  const lstInvolved = xId === 'LST' || yId === 'LST';
  const base = lstInvolved ? -0.55 : 0.6;
  const jitter = ((seedFromKey(`${xId}~${yId}`) % 1000) / 1000 - 0.5) * 0.3; // ±0.15
  return Math.max(-0.85, Math.min(0.85, base + jitter));
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

  // Cloud centre = AOI-level layer means for the week (stable, NOT per-cell). The per-cell
  // spread is then real bivariate-normal noise. The previous code derived both axes from the
  // same rolling hash of the cell key, and because two equal-length layer ids (e.g. NDVI/NDWI)
  // shift that affine hash by a constant, the X and Y noise were almost perfectly linearly
  // related — the points fell on parallel diagonal lines instead of a natural scatter.
  const meanX = staticAoiLayerMeanForWeek(xId, wIdx, nWeeks, aoiKey, anchor);
  const meanY = staticAoiLayerMeanForWeek(yId, wIdx, nWeeks, aoiKey, anchor);
  const [xr0, xr1] = layerMeta(xId)?.range ?? [-1, 1];
  const [yr0, yr1] = layerMeta(yId)?.range ?? [-1, 1];
  const sigmaX = layerSpan(xId) * 0.06;
  const sigmaY = layerSpan(yId) * 0.06;
  const rho = syntheticPairCorrelation(xId, yId);
  const k = Math.sqrt(Math.max(0, 1 - rho * rho));

  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), v));

  const out: StaticAoiIndexCrossScatterPoint[] = [];
  for (const p of grid) {
    const rng = mulberry32(seedFromKey(`${cellKeyForPixel(aoiKey, p.lng, p.lat)}|${wIdx}`));
    // Bivariate normal with Corr(x, y) = rho: y shares latent z1 with x plus independent z2.
    const z1 = gaussian(rng);
    const z2 = gaussian(rng);
    const x = clamp(meanX + sigmaX * z1, Number(xr0), Number(xr1));
    const y = clamp(meanY + sigmaY * (rho * z1 + k * z2), Number(yr0), Number(yr1));
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
