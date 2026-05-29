/**
 * Lightweight AOI report geo helpers — no jsPDF / cartography canvas deps.
 * Imported by SatelliteIntelligence at module init to avoid pulling the full
 * report PDF graph into the indices route chunk (TDZ / init-order on GH Pages).
 */
import type { SiAoiClassificationPalette } from './siAoiReportCartographyTypes';

export type { SiAoiClassificationPalette } from './siAoiReportCartographyTypes';

export type SiPdfLngLatBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export const DEFAULT_SI_AOI_CLASSIFICATION_PALETTE: SiAoiClassificationPalette = {
  high: '#22c55e',
  medium: '#eab308',
  low: '#ef4444',
  aoiOutline: '#38bdf8',
};

/** Derive high / medium / low class colours from WMS symbology ramp stops. */
export function siAoiPaletteFromIndexRampStops(
  stops: ReadonlyArray<readonly [number, number]> | null | undefined,
): SiAoiClassificationPalette | undefined {
  if (!stops || stops.length < 2) return undefined;
  const sorted = [...stops].sort((a, b) => a[0] - b[0]);
  const toCss = (rgbInt: number) => {
    const u = rgbInt >>> 0;
    return `#${(u & 0xffffff).toString(16).padStart(6, '0')}`;
  };
  const low = toCss(sorted[0]![1]);
  const high = toCss(sorted[sorted.length - 1]![1]);
  const medium = toCss(sorted[Math.floor((sorted.length - 1) / 2)]![1]);
  return { low, medium, high, aoiOutline: DEFAULT_SI_AOI_CLASSIFICATION_PALETTE.aoiOutline };
}

/** Bounding box [west, south, east, north] in WGS84 for map fit / grids. */
export function siAoiReportFeatureBBoxLngLat(geojson: GeoJSON.Feature): [number, number, number, number] | null {
  const points: [number, number][] = [];
  const walkCoords = (coords: unknown) => {
    if (!coords) return;
    const c = coords as unknown;
    if (typeof c === 'object' && c !== null && 'length' in c && typeof (c as number[])[0] === 'number') {
      const arr = c as number[];
      if (arr.length >= 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
        points.push([arr[0], arr[1]]);
        return;
      }
    }
    if (Array.isArray(c)) {
      c.forEach(walkCoords);
    }
  };
  const g = geojson.geometry;
  if (!g) return null;
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
    walkCoords((g as GeoJSON.Polygon).coordinates);
  }
  if (points.length === 0) return null;
  let [minX, minY] = points[0]!;
  let [maxX, maxY] = points[0]!;
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

export function siPdfBoundsFromFitBounds(fit: [[number, number], [number, number]]): SiPdfLngLatBounds {
  const lngs = [fit[0][0], fit[1][0]];
  const lats = [fit[0][1], fit[1][1]];
  return {
    west: Math.min(...lngs),
    east: Math.max(...lngs),
    south: Math.min(...lats),
    north: Math.max(...lats),
  };
}
