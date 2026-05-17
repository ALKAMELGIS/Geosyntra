/**
 * Unified AOI geometry metrics + zonal pixel statistics (popups, charts, Excel export).
 * Popups prefer MPC raster pixel sampling (AOI-clipped); charts/export may still use synthetic weeks.
 */
import { pointInPolygonGeometry } from '../drawingUtils';
import type { MpcZonalSampleResult } from '../../../lib/mpcPlanetaryApi';
import { staticAoiLayerMeanForWeek } from './staticAoiLayerSynthetic';
import { STATIC_AOI_CHART_LAYER_OPTIONS } from './staticAoiChartTypes';
import type { StaticAoiChartLayerId, WeeklyCompositeLite } from './staticAoiChartTypes';

export const SI_AOI_MAX_GRID_CELLS = 9000;
const R_EARTH_M = 6371000;

export type SiAoiZonalIndexStats = {
  mean: number;
  min: number;
  max: number;
  validCount: number;
};

export type SiAoiZonalAnalytics = {
  areaHa: number;
  areaM2: number;
  areaKm2: number;
  pixelCount: number;
  validPixelCount: number;
  approxResolutionM: number | null;
  analysisDateIso: string;
  indices: Partial<Record<StaticAoiChartLayerId, SiAoiZonalIndexStats>>;
  dataSource?: 'raster' | 'synthetic';
};

/** AOI-clipped raster pixels from analysis_engine `/mpc/zonal-sample`. */
export type SiAoiRasterPixelSample = {
  grid: AoiGridPoint[];
  layers: Partial<Record<StaticAoiChartLayerId, number[]>>;
  areaHa: number;
  resolutionM: number | null;
};

function walkCoordsLngLat2D(coords: unknown, points: [number, number][]) {
  if (!coords) return;
  if (typeof (coords as number[])[0] === 'number' && typeof (coords as number[])[1] === 'number') {
    points.push([(coords as number[])[0]!, (coords as number[])[1]!]);
    return;
  }
  if (Array.isArray(coords)) {
    for (const c of coords) walkCoordsLngLat2D(c, points);
  }
}

export function getFeatureLngLatBounds(
  feature: GeoJSON.Feature | null,
): [number, number, number, number] | null {
  if (!feature?.geometry) return null;
  const points: [number, number][] = [];
  const g = feature.geometry;
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
    walkCoordsLngLat2D(g.coordinates, points);
  }
  if (!points.length) return null;
  let minX = points[0]![0];
  let minY = points[0]![1];
  let maxX = minX;
  let maxY = minY;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [minX, minY, maxX, maxY];
}

function pointInAoiGeometry(lng: number, lat: number, geometry: GeoJSON.Geometry): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygonGeometry(lng, lat, geometry as { type: string; coordinates: number[][][] });
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.some(coords =>
      pointInPolygonGeometry(lng, lat, { type: 'Polygon', coordinates: coords as number[][][] }),
    );
  }
  return false;
}

/** Geodesic-style polygon area (m²) — works without Leaflet GeometryUtil. */
function ringAreaSqMeters(ring: number[][]): number {
  if (!ring || ring.length < 3) return 0;
  let slng = 0;
  let slat = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    slng += ring[i]![0];
    slat += ring[i]![1];
  }
  const lng0 = slng / n;
  const lat0 = slat / n;
  const kx = R_EARTH_M * Math.cos((lat0 * Math.PI) / 180) * (Math.PI / 180);
  const ky = R_EARTH_M * (Math.PI / 180);
  let sum = 0;
  for (let i = 0; i < n - 1; i++) {
    const x1 = (ring[i]![0] - lng0) * kx;
    const y1 = (ring[i]![1] - lat0) * ky;
    const x2 = (ring[i + 1]![0] - lng0) * kx;
    const y2 = (ring[i + 1]![1] - lat0) * ky;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum / 2);
}

/** AOI area in m² from Polygon / MultiPolygon (Mapbox path — no Leaflet required). */
export function geometryAoiAreaSqMeters(geometry: GeoJSON.Geometry | null | undefined): number {
  if (!geometry) return 0;
  if (geometry.type === 'Polygon') {
    const outer = geometry.coordinates[0];
    return outer ? ringAreaSqMeters(outer) : 0;
  }
  if (geometry.type === 'MultiPolygon') {
    let t = 0;
    for (const poly of geometry.coordinates) {
      const outer = poly?.[0];
      if (outer) t += ringAreaSqMeters(outer);
    }
    return t;
  }
  return 0;
}

export function geometryAoiAreaHectares(geometry: GeoJSON.Geometry | null | undefined): number {
  return Math.max(0, geometryAoiAreaSqMeters(geometry) / 10_000);
}

export type AoiGridPoint = { lng: number; lat: number };

export function buildAoiInteriorGrid(feature: GeoJSON.Feature, maxCells = SI_AOI_MAX_GRID_CELLS): AoiGridPoint[] {
  const bounds = getFeatureLngLatBounds(feature);
  const geom = feature.geometry;
  if (!bounds || !geom) return [];
  const [minX, minY, maxX, maxY] = bounds;
  const w = Math.max(1e-12, maxX - minX);
  const h = Math.max(1e-12, maxY - minY);
  const aspect = w / h;
  let nx = Math.ceil(Math.sqrt(maxCells * aspect));
  let ny = Math.ceil(maxCells / Math.max(1, nx));
  nx = Math.max(12, Math.min(140, nx));
  ny = Math.max(12, Math.min(140, ny));
  while (nx * ny > maxCells) {
    if (nx >= ny) nx--;
    else ny--;
  }
  const stepX = w / nx;
  const stepY = h / ny;
  const pts: AoiGridPoint[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const lng = minX + (i + 0.5) * stepX;
      const lat = minY + (j + 0.5) * stepY;
      if (pointInAoiGeometry(lng, lat, geom)) pts.push({ lng, lat });
    }
  }
  return pts;
}

function cellKeyForPixel(aoiKey: string | null, lng: number, lat: number): string {
  return `${aoiKey ?? 'aoi'}|${lng.toFixed(5)}|${lat.toFixed(5)}`;
}

function statsFromValues(vals: number[]): SiAoiZonalIndexStats | null {
  const finite = vals.filter(Number.isFinite);
  if (!finite.length) return null;
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
  return {
    mean,
    min: Math.min(...finite),
    max: Math.max(...finite),
    validCount: finite.length,
  };
}

export function mpcResultToRasterPixelSample(
  result: MpcZonalSampleResult,
  layerIds: StaticAoiChartLayerId[],
): SiAoiRasterPixelSample | null {
  const grid = (result.grid ?? []).map(p => ({ lng: p.lng, lat: p.lat }));
  if (!grid.length) return null;
  const layers: Partial<Record<StaticAoiChartLayerId, number[]>> = {};
  for (const id of layerIds) {
    const entry = result.layers?.[id];
    if (entry?.values?.length) layers[id] = entry.values;
  }
  if (!Object.keys(layers).length) return null;
  const resM = result.processing?.resolution_m;
  return {
    grid,
    layers,
    areaHa: Number.isFinite(result.area_ha) ? result.area_ha : 0,
    resolutionM: typeof resM === 'number' && Number.isFinite(resM) ? resM : null,
  };
}

export function buildAoiZonalDatetimeRange(
  weekCtx: SiAoiZonalWeekContext,
  weekly: readonly WeeklyCompositeLite[],
  fallbackStart: string,
  fallbackEnd: string,
): string {
  if (weekly.length > 0 && weekCtx.weekIdx >= 0 && weekCtx.weekIdx < weekly.length) {
    const w = weekly[weekCtx.weekIdx]!;
    return `${w.startDate.slice(0, 10)}/${w.endDate.slice(0, 10)}`;
  }
  const s = fallbackStart.trim().slice(0, 10);
  const e = fallbackEnd.trim().slice(0, 10);
  if (s && e) return `${s}/${e}`;
  const anchor = weekCtx.analysisDateIso.slice(0, 10);
  const d = new Date(`${anchor}T12:00:00Z`);
  const start = new Date(d);
  start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 7);
  return `${start.toISOString().slice(0, 10)}/${end.toISOString().slice(0, 10)}`;
}

function zonalAnalyticsFromRaster(
  feature: GeoJSON.Feature,
  layerIds: StaticAoiChartLayerId[],
  raster: SiAoiRasterPixelSample,
  analysisDateIso: string,
): SiAoiZonalAnalytics | null {
  const geom = feature.geometry;
  if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) return null;

  const geomAreaM2 = geometryAoiAreaSqMeters(geom);
  const areaHa = raster.areaHa > 0 ? raster.areaHa : geomAreaM2 / 10_000;
  const areaM2 = areaHa * 10_000;
  const pixelCount = raster.grid.length;

  const indices: Partial<Record<StaticAoiChartLayerId, SiAoiZonalIndexStats>> = {};
  let validPixelCount = 0;
  for (const id of layerIds) {
    const raw = raster.layers[id];
    if (!raw?.length) continue;
    const st = statsFromValues(raw.filter(Number.isFinite));
    if (st) {
      indices[id] = st;
      validPixelCount = Math.max(validPixelCount, st.validCount);
    }
  }
  if (!validPixelCount) return null;

  const approxResolutionM =
    raster.resolutionM ??
    (pixelCount > 0 && areaM2 > 0 ? Math.sqrt(areaM2 / pixelCount) : null);

  return {
    areaHa,
    areaM2,
    areaKm2: areaHa / 100,
    pixelCount,
    validPixelCount,
    approxResolutionM,
    analysisDateIso: analysisDateIso.slice(0, 10),
    indices,
    dataSource: 'raster',
  };
}

/** Zonal stats — raster pixels inside AOI when provided; otherwise optional synthetic grid. */
export function computeAoiZonalAnalytics(opts: {
  feature: GeoJSON.Feature;
  aoiKey: string | null;
  layerIds: StaticAoiChartLayerId[];
  weekIdx: number;
  nWeeks: number;
  anchorWeeklyMean: number;
  analysisDateIso: string;
  grid?: AoiGridPoint[];
  rasterSample?: SiAoiRasterPixelSample | null;
  allowSyntheticFallback?: boolean;
}): SiAoiZonalAnalytics | null {
  if (opts.rasterSample) {
    return zonalAnalyticsFromRaster(
      opts.feature,
      opts.layerIds,
      opts.rasterSample,
      opts.analysisDateIso,
    );
  }
  if (opts.allowSyntheticFallback === false) return null;

  const geom = opts.feature.geometry;
  if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) return null;

  const areaM2 = geometryAoiAreaSqMeters(geom);
  const areaHa = areaM2 / 10_000;
  const grid = opts.grid ?? buildAoiInteriorGrid(opts.feature);
  const pixelCount = grid.length;

  const perLayer: Record<string, number[]> = {};
  for (const id of opts.layerIds) perLayer[id] = [];

  for (const p of grid) {
    const ck = cellKeyForPixel(opts.aoiKey, p.lng, p.lat);
    for (const id of opts.layerIds) {
      const v = staticAoiLayerMeanForWeek(
        id,
        opts.weekIdx,
        opts.nWeeks,
        ck,
        opts.anchorWeeklyMean,
      );
      if (Number.isFinite(v)) perLayer[id]!.push(v);
    }
  }

  const indices: Partial<Record<StaticAoiChartLayerId, SiAoiZonalIndexStats>> = {};
  let validPixelCount = 0;
  for (const id of opts.layerIds) {
    const st = statsFromValues(perLayer[id] ?? []);
    if (st) {
      indices[id] = st;
      validPixelCount = Math.max(validPixelCount, st.validCount);
    }
  }

  const approxResolutionM =
    pixelCount > 0 && areaM2 > 0 ? Math.sqrt(areaM2 / pixelCount) : null;

  return {
    areaHa,
    areaM2,
    areaKm2: areaHa / 100,
    pixelCount,
    validPixelCount,
    approxResolutionM,
    analysisDateIso: opts.analysisDateIso.slice(0, 10),
    indices,
    dataSource: 'synthetic',
  };
}

/** Per-week zonal mean for charts (one grid build, many weeks). */
export function computeAoiZonalWeeklyMeans(
  feature: GeoJSON.Feature,
  aoiKey: string | null,
  layerId: StaticAoiChartLayerId,
  weekly: WeeklyCompositeLite[],
): number[] {
  if (!weekly.length) return [];
  const grid = buildAoiInteriorGrid(feature);
  const n = weekly.length;
  return weekly.map((w, weekIdx) => {
    const vals: number[] = [];
    for (const p of grid) {
      const ck = cellKeyForPixel(aoiKey, p.lng, p.lat);
      const v = staticAoiLayerMeanForWeek(layerId, weekIdx, n, ck, w.mean);
      if (Number.isFinite(v)) vals.push(v);
    }
    const st = statsFromValues(vals);
    return st?.mean ?? NaN;
  });
}

export function roundIndexDisplay(v: number, layerId?: string): string {
  if (!Number.isFinite(v)) return '—';
  if (layerId === 'LST') return v.toFixed(1);
  return v.toFixed(2);
}

export type SiAoiIndexHealthBand = 'high' | 'medium' | 'low';

export type SiAoiIndexHealthRow = {
  band: SiAoiIndexHealthBand;
  label: string;
  pct: number;
  areaHa: number;
  areaKm2: number;
  meanIndex: number;
  color: string;
  tone: 'high' | 'medium' | 'low';
};

export type SiAoiIndexHealthBreakdown = {
  layerId: StaticAoiChartLayerId;
  layerLabel: string;
  primaryMean: number;
  rows: SiAoiIndexHealthRow[];
};

export type SiAoiZonalWeekContext = {
  weekIdx: number;
  nWeeks: number;
  anchorWeeklyMean: number;
  analysisDateIso: string;
};

const INDEX_HEALTH_PALETTE: Record<SiAoiIndexHealthBand, string> = {
  high: '#22c55e',
  medium: '#eab308',
  low: '#ef4444',
};

function metaForLayer(layerId: StaticAoiChartLayerId) {
  return STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === layerId) ?? STATIC_AOI_CHART_LAYER_OPTIONS[0]!;
}

/** Map active WMS / index name to chart layer id (popup + zonal engine). */
export function inferStaticAoiChartLayerFromWmsName(layerName: string): StaticAoiChartLayerId {
  const u = layerName.trim().toUpperCase();
  if (u.includes('LST') || u.includes('TEMP')) return 'LST';
  if (u.includes('NDWI') || u.includes('MNDWI')) return 'NDWI';
  if (u.includes('NDMI') || u.includes('MOISTURE')) return 'NDMI';
  if (u.includes('EVI') && !u.includes('NEVI')) return 'EVI';
  if (u.includes('SAVI')) return 'SAVI';
  if (u.includes('NDSI') || u.includes('SNOW')) return 'NDSI';
  if (u.includes('NDVI') || u.includes('GNDVI') || u.includes('NDRE') || u.includes('NBR')) return 'NDVI';
  return 'NDVI';
}

export function defaultAnchorMeanForLayer(layerId: StaticAoiChartLayerId): number {
  const { range } = metaForLayer(layerId);
  if (layerId === 'LST') return (range[0] + range[1]) / 2;
  return range[0] + (range[1] - range[0]) * 0.45;
}

/** Week anchor for zonal stats — works with or without a built timeline. */
export function resolveAoiZonalWeekContext(
  weekly: readonly WeeklyCompositeLite[],
  selectedDateIso: string,
  rowDateIso?: string | null,
  layerId?: StaticAoiChartLayerId,
): SiAoiZonalWeekContext {
  const analysisDateIso = (rowDateIso ?? selectedDateIso).slice(0, 10);
  if (!weekly.length) {
    return {
      weekIdx: 0,
      nWeeks: 1,
      anchorWeeklyMean: layerId ? defaultAnchorMeanForLayer(layerId) : 0.45,
      analysisDateIso,
    };
  }
  const n = weekly.length;
  let weekIdx = weekly.findIndex(
    w => analysisDateIso >= w.startDate.slice(0, 10) && analysisDateIso <= w.endDate.slice(0, 10),
  );
  if (weekIdx < 0) {
    weekIdx = weekly.findIndex(
      w => selectedDateIso.slice(0, 10) >= w.startDate.slice(0, 10) && selectedDateIso.slice(0, 10) <= w.endDate.slice(0, 10),
    );
  }
  if (weekIdx < 0) weekIdx = n - 1;
  return {
    weekIdx,
    nWeeks: n,
    anchorWeeklyMean: weekly[weekIdx]!.mean,
    analysisDateIso,
  };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const t = (sorted.length - 1) * p;
  const lo = Math.floor(t);
  const hi = Math.ceil(t);
  if (lo === hi) return sorted[lo]!;
  const w = t - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

function indexHealthFromValues(
  vals: number[],
  areaHa: number,
  layerId: StaticAoiChartLayerId,
  palette?: Partial<Record<SiAoiIndexHealthBand, string>>,
): SiAoiIndexHealthBreakdown | null {
  if (!vals.length) return null;

  const sorted = [...vals].sort((a, b) => a - b);
  const p33 = percentile(sorted, 1 / 3);
  const p66 = percentile(sorted, 2 / 3);
  const areaPerPx = areaHa / vals.length;

  const bands: SiAoiIndexHealthBand[] = ['low', 'medium', 'high'];
  const counts: Record<SiAoiIndexHealthBand, number> = { low: 0, medium: 0, high: 0 };
  const sums: Record<SiAoiIndexHealthBand, number> = { low: 0, medium: 0, high: 0 };

  for (const v of vals) {
    let band: SiAoiIndexHealthBand = 'high';
    if (v <= p33) band = 'low';
    else if (v <= p66) band = 'medium';
    counts[band] += 1;
    sums[band] += v;
  }

  const colors = { ...INDEX_HEALTH_PALETTE, ...palette };
  const rows: SiAoiIndexHealthRow[] = bands.map(band => {
    const n = counts[band];
    const pct = (100 * n) / vals.length;
    return {
      band,
      label: band === 'high' ? 'High' : band === 'medium' ? 'Medium' : 'Low',
      pct,
      areaHa: areaPerPx * n,
      areaKm2: (areaPerPx * n) / 100,
      meanIndex: n > 0 ? sums[band] / n : NaN,
      color: colors[band],
      tone: band,
    };
  });

  const meta = metaForLayer(layerId);
  const primaryMean = vals.reduce((a, b) => a + b, 0) / vals.length;

  return {
    layerId,
    layerLabel: meta.label,
    primaryMean,
    rows,
  };
}

/** AOI pixel tertiles for the active index — raster pixels when available. */
export function computeAoiIndexHealthBreakdown(opts: {
  feature: GeoJSON.Feature;
  aoiKey: string | null;
  layerId: StaticAoiChartLayerId;
  weekCtx: SiAoiZonalWeekContext;
  palette?: Partial<Record<SiAoiIndexHealthBand, string>>;
  rasterSample?: SiAoiRasterPixelSample | null;
  allowSyntheticFallback?: boolean;
}): SiAoiIndexHealthBreakdown | null {
  const geom = opts.feature.geometry;
  if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) return null;

  const geomAreaHa = geometryAoiAreaSqMeters(geom) / 10_000;

  if (opts.rasterSample) {
    const raw = opts.rasterSample.layers[opts.layerId];
    const vals = (raw ?? []).filter(Number.isFinite);
    const areaHa = opts.rasterSample.areaHa > 0 ? opts.rasterSample.areaHa : geomAreaHa;
    return indexHealthFromValues(vals, areaHa, opts.layerId, opts.palette);
  }
  if (opts.allowSyntheticFallback === false) return null;

  const grid = buildAoiInteriorGrid(opts.feature);
  if (!grid.length) return null;

  const { weekIdx, nWeeks, anchorWeeklyMean } = opts.weekCtx;
  const vals: number[] = [];
  for (const p of grid) {
    const ck = cellKeyForPixel(opts.aoiKey, p.lng, p.lat);
    const v = staticAoiLayerMeanForWeek(opts.layerId, weekIdx, nWeeks, ck, anchorWeeklyMean);
    if (Number.isFinite(v)) vals.push(v);
  }
  return indexHealthFromValues(vals, geomAreaHa, opts.layerId, opts.palette);
}
