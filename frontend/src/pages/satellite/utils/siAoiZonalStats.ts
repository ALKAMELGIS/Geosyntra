/**
 * Unified AOI geometry metrics + zonal pixel statistics (popups, charts, Excel export).
 * Pixel values use the same engine as {@link staticAoiLayerMeanForWeek} / GeoAI export sheets.
 */
import { pointInPolygonGeometry } from '../drawingUtils';
import { staticAoiLayerMeanForWeek } from './staticAoiLayerSynthetic';
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

/** Zonal stats for one week — same pixel engine as Data_Raw / Summary_AOI in Excel export. */
export function computeAoiZonalAnalytics(opts: {
  feature: GeoJSON.Feature;
  aoiKey: string | null;
  layerIds: StaticAoiChartLayerId[];
  weekIdx: number;
  nWeeks: number;
  anchorWeeklyMean: number;
  analysisDateIso: string;
  grid?: AoiGridPoint[];
}): SiAoiZonalAnalytics | null {
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
