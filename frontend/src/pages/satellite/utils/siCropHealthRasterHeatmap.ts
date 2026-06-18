import type { Feature, FeatureCollection, Polygon } from 'geojson';
import { getFeatureLngLatBounds } from './siAoiZonalStats';
import type { SiCropHealthCell, SiCropHealthSeverity } from './siCropHealthTypes';
import { stressIndexToHex, stressIndexToRgb } from './siCropHealthStressModel';

export type SiCropHealthRasterBounds = [number, number, number, number];

export type SiCropHealthStressRaster = {
  /** PNG data URL aligned to `bounds` (WGS84). */
  imageDataUrl: string;
  bounds: SiCropHealthRasterBounds;
  width: number;
  height: number;
  resolutionM: number | null;
};

export type SiCropHealthSeverityLayers = Record<SiCropHealthSeverity, FeatureCollection>;

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!;
    const yi = ring[i]![1]!;
    const xj = ring[j]![0]!;
    const yj = ring[j]![1]!;
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInFeature(lng: number, lat: number, feature: Feature): boolean {
  const g = feature.geometry;
  if (!g) return true;
  if (g.type === 'Polygon') {
    const coords = g.coordinates as number[][][];
    if (!coords[0]?.length) return false;
    if (!pointInRing(lng, lat, coords[0]!)) return false;
    for (let h = 1; h < coords.length; h += 1) {
      if (pointInRing(lng, lat, coords[h]!)) return false;
    }
    return true;
  }
  if (g.type === 'MultiPolygon') {
    return (g.coordinates as number[][][][]).some(poly => {
      const outer = poly[0];
      if (!outer?.length || !pointInRing(lng, lat, outer)) return false;
      for (let h = 1; h < poly.length; h += 1) {
        if (pointInRing(lng, lat, poly[h]!)) return false;
      }
      return true;
    });
  }
  return true;
}

type GridMatrix = {
  latitudes: number[];
  longitudes: number[];
  /** Row-major stress index 0..1 or NaN outside samples */
  stress: number[][];
};

function buildGridFromCells(cells: SiCropHealthCell[]): GridMatrix | null {
  if (cells.length < 4) return null;
  const latitudes = [...new Set(cells.map(c => c.lat))].sort((a, b) => b - a);
  const longitudes = [...new Set(cells.map(c => c.lng))].sort((a, b) => a - b);
  if (latitudes.length < 2 || longitudes.length < 2) return null;

  const latIdx = new Map(latitudes.map((v, i) => [v, i]));
  const lngIdx = new Map(longitudes.map((v, i) => [v, i]));
  const stress: number[][] = latitudes.map(() => longitudes.map(() => Number.NaN));

  for (const cell of cells) {
    const ri = latIdx.get(cell.lat);
    const ci = lngIdx.get(cell.lng);
    if (ri == null || ci == null) continue;
    stress[ri]![ci] = 1 - cell.score;
  }

  return { latitudes, longitudes, stress };
}

function estimateResolutionM(matrix: GridMatrix, bounds: SiCropHealthRasterBounds): number {
  const [, minLat, maxLng, maxLat] = bounds;
  const rows = matrix.latitudes.length;
  const cols = matrix.longitudes.length;
  if (rows < 2 || cols < 2) return 20;
  const dLat = Math.abs(matrix.latitudes[0]! - matrix.latitudes[rows - 1]!) / Math.max(1, rows - 1);
  const dLng = Math.abs(matrix.longitudes[cols - 1]! - matrix.longitudes[0]!) / Math.max(1, cols - 1);
  const midLat = (minLat + maxLat) / 2;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((midLat * Math.PI) / 180);
  return Math.max(5, Math.round(Math.sqrt((dLat * mPerDegLat) ** 2 + (dLng * mPerDegLng) ** 2)));
}

function cellRing(
  lng0: number,
  lat0: number,
  lng1: number,
  lat1: number,
): number[][] {
  return [
    [lng0, lat0],
    [lng1, lat0],
    [lng1, lat1],
    [lng0, lat1],
    [lng0, lat0],
  ];
}

export function buildCropHealthSeverityLayers(
  cells: SiCropHealthCell[],
  feature: Feature,
): SiCropHealthSeverityLayers {
  const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
  const matrix = buildGridFromCells(cells);
  if (!matrix) {
    return { low: empty, medium: empty, high: empty };
  }
  const { latitudes, longitudes, stress } = matrix;
  const layers: SiCropHealthSeverityLayers = { low: empty, medium: empty, high: empty };
  const feats: Record<SiCropHealthSeverity, Feature[]> = { low: [], medium: [], high: [] };

  for (let r = 0; r < latitudes.length - 1; r += 1) {
    for (let c = 0; c < longitudes.length - 1; c += 1) {
      const s = stress[r]?.[c];
      if (!Number.isFinite(s)) continue;
      const latN = latitudes[r]!;
      const latS = latitudes[r + 1] ?? latitudes[r]! - 1e-6;
      const lngW = longitudes[c]!;
      const lngE = longitudes[c + 1] ?? longitudes[c]! + 1e-6;
      const cx = (lngW + lngE) / 2;
      const cy = (latN + latS) / 2;
      if (!pointInFeature(cx, cy, feature)) continue;
      const cell = cells.find(
        x => x.lng === lngW && x.lat === latN,
      );
      const severity: SiCropHealthSeverity = cell?.severity ?? (s < 0.35 ? 'low' : s < 0.58 ? 'medium' : 'high');
      feats[severity].push({
        type: 'Feature',
        properties: {
          stressIndex: Number(s.toFixed(4)),
          severity,
          fill: stressIndexToHex(s),
          opacity: 0.55,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [cellRing(lngW, latN, lngE, latS)],
        } as Polygon,
      });
    }
  }

  for (const k of Object.keys(feats) as SiCropHealthSeverity[]) {
    layers[k] = { type: 'FeatureCollection', features: feats[k] };
  }
  return layers;
}

export function buildCropHealthStressRaster(
  cells: SiCropHealthCell[],
  feature: Feature,
  maxDim = 256,
): SiCropHealthStressRaster | null {
  const bounds = getFeatureLngLatBounds(feature);
  const matrix = buildGridFromCells(cells);
  if (!bounds || !matrix) return null;

  const rows0 = matrix.latitudes.length;
  const cols0 = matrix.longitudes.length;
  const scale = Math.min(1, maxDim / Math.max(rows0, cols0));
  const rows = Math.max(2, Math.round(rows0 * scale));
  const cols = Math.max(2, Math.round(cols0 * scale));

  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    return null;
  }
  if (!ctx) return null;

  const img = ctx.createImageData(cols, rows);
  for (let r = 0; r < rows; r += 1) {
    const ri = Math.min(rows0 - 1, Math.round((r / Math.max(1, rows - 1)) * (rows0 - 1)));
    for (let c = 0; c < cols; c += 1) {
      const ci = Math.min(cols0 - 1, Math.round((c / Math.max(1, cols - 1)) * (cols0 - 1)));
      const s = matrix.stress[ri]?.[ci];
      const o = (r * cols + c) * 4;
      if (!Number.isFinite(s)) {
        img.data[o + 3] = 0;
        continue;
      }
      const [R, G, B] = stressIndexToRgb(s);
      img.data[o] = R;
      img.data[o + 1] = G;
      img.data[o + 2] = B;
      img.data[o + 3] = 210;
    }
  }
  ctx.putImageData(img, 0, 0);

  const [minLng, minLat, maxLng, maxLat] = bounds;
  return {
    imageDataUrl: canvas.toDataURL('image/png'),
    bounds: [minLng, minLat, maxLng, maxLat],
    width: cols,
    height: rows,
    resolutionM: estimateResolutionM(matrix, bounds),
  };
}

/** Mapbox `image` source corners: top-left, top-right, bottom-right, bottom-left. */
export function cropHealthRasterImageCoordinates(
  bounds: SiCropHealthRasterBounds,
): [[number, number], [number, number], [number, number], [number, number]] {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  return [
    [minLng, maxLat],
    [maxLng, maxLat],
    [maxLng, minLat],
    [minLng, minLat],
  ];
}

export function downloadCropHealthRasterPng(raster: SiCropHealthStressRaster, filename = 'crop-stress-heatmap.png'): void {
  const a = document.createElement('a');
  a.href = raster.imageDataUrl;
  a.download = filename;
  a.click();
}
