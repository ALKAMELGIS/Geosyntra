import { pointInPolygonGeometry } from '../drawingUtils';

function pointInAoiGeometryLngLat(lng: number, lat: number, geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygonGeometry(lng, lat, geometry as unknown as { type: string; coordinates: number[][][] });
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.some(coords =>
      pointInPolygonGeometry(lng, lat, { type: 'Polygon', coordinates: coords }),
    );
  }
  return false;
}

export type SiRasterSymbologyMethod =
  | 'equal_interval'
  | 'quantile'
  | 'natural_breaks'
  | 'manual'
  | 'std_dev';

export type SiRasterSymbologyRampId =
  | 'vegetation'
  | 'water'
  | 'heat'
  | 'terrain'
  | 'ai_detection'
  | 'custom';

export type SiRasterSymbologyClassRow = {
  id: string;
  min: number;
  max: number;
  color: string;
  label: string;
};

export type SiRasterSymbologyVizMode = 'classes' | 'heatmap';

export type SiRasterSymbologyState = {
  method: SiRasterSymbologyMethod;
  classCount: number;
  opacity: number;
  rampId: SiRasterSymbologyRampId;
  /** Used when rampId === 'custom' */
  customStops: [string, string, string];
  classes: SiRasterSymbologyClassRow[];
  targetLayerId: string;
  showOnMap: boolean;
  /** Classes = stepped breaks on raw `v`. Heatmap = continuous ramp on clamped raw `v` (same value field). */
  vizMode: SiRasterSymbologyVizMode;
  /**
   * When false, no classified overlay is drawn on the map (index/WMS stays raw).
   * Set true only after the user runs Reclassify → Run/Apply; further edits update the overlay live.
   */
  reclassifyApplied?: boolean;
};

const RAMP_PRESETS: Record<Exclude<SiRasterSymbologyRampId, 'custom'>, string[]> = {
  vegetation: ['#b91c1c', '#facc15', '#22c55e', '#15803d'],
  water: ['#78350f', '#22d3ee', '#0369a1', '#1e3a8a'],
  heat: ['#fef08a', '#fb923c', '#ea580c', '#991b1b'],
  terrain: ['#78350f', '#166534', '#ffffff'],
  ai_detection: ['#581c87', '#ec4899', '#06b6d4', '#a5f3fc'],
};

function clamp01(t: number) {
  return Math.max(0, Math.min(1, t));
}

function hexToRgb(hex: string): [number, number, number] | null {
  const h = (hex || '').replace('#', '').trim();
  if (!h) return null;
  const pad = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h.padEnd(6, '0').slice(0, 6);
  const r = parseInt(pad.slice(0, 2), 16);
  const g = parseInt(pad.slice(2, 4), 16);
  const b = parseInt(pad.slice(4, 6), 16);
  if (![r, g, b].every(n => Number.isFinite(n))) return null;
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number) {
  const f = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}

function lerpColor(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  if (!A || !B) return a;
  const u = clamp01(t);
  return rgbToHex(A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u);
}

export function siRasterSymbologyRampColors(
  rampId: SiRasterSymbologyRampId,
  custom: [string, string, string],
  stops: number,
): string[] {
  const n = Math.max(2, Math.min(32, Math.round(stops)));
  if (rampId === 'custom') {
    const [c0, c1, c2] = custom;
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const t = n <= 1 ? 0 : i / (n - 1);
      const mid = 0.5;
      if (t <= mid) out.push(lerpColor(c0, c1, t / mid));
      else out.push(lerpColor(c1, c2, (t - mid) / (1 - mid)));
    }
    return out;
  }
  const pal = RAMP_PRESETS[rampId];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 0 : i / (n - 1);
    const idx = t * (pal.length - 1);
    const j = Math.floor(idx);
    const f = idx - j;
    const c0 = pal[j] ?? pal[0]!;
    const c1 = pal[Math.min(j + 1, pal.length - 1)] ?? c0;
    out.push(lerpColor(c0, c1, f));
  }
  return out;
}

function equalIntervalBreaks(minV: number, maxV: number, k: number): number[] {
  if (!Number.isFinite(minV) || !Number.isFinite(maxV) || maxV <= minV || k < 2) {
    return [0, 1];
  }
  const out: number[] = [];
  for (let i = 0; i <= k; i++) out.push(minV + ((maxV - minV) * i) / k);
  return out;
}

function quantileBreaks(sorted: number[], k: number): number[] {
  const s = sorted.filter(Number.isFinite).sort((a, b) => a - b);
  if (s.length < 2 || k < 2) return [s[0] ?? 0, s[s.length - 1] ?? 1];
  const minV = s[0]!;
  const maxV = s[s.length - 1]!;
  const out: number[] = [minV];
  for (let i = 1; i < k; i++) {
    const pos = (i / k) * (s.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    const f = pos - lo;
    const v = s[lo]! * (1 - f) + s[hi]! * f;
    out.push(v);
  }
  out.push(maxV);
  for (let j = 1; j < out.length; j++) {
    if (out[j]! <= out[j - 1]!) out[j] = out[j - 1]! + 1e-9 * (maxV - minV || 1);
  }
  return out;
}

/** One-dimensional Lloyd's k-means on sorted values (Jenks-style natural clusters). */
function naturalBreaksFromSample(sorted: number[], k: number, iters = 24): number[] {
  const s = sorted.filter(Number.isFinite).sort((a, b) => a - b);
  if (s.length < k || k < 2) {
    const a = s[0] ?? 0;
    const b = s[s.length - 1] ?? 1;
    return equalIntervalBreaks(a, b, k);
  }
  const minV = s[0]!;
  const maxV = s[s.length - 1]!;
  let centers: number[] = [];
  for (let i = 0; i < k; i++) {
    const t = (i + 0.5) / k;
    const idx = Math.floor(t * (s.length - 1));
    centers.push(s[idx]!);
  }
  const assignments = new Int32Array(s.length);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < s.length; i++) {
      let best = 0;
      let bestD = Infinity;
      const v = s[i]!;
      for (let c = 0; c < k; c++) {
        const d = Math.abs(v - centers[c]!);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assignments[i] = best;
    }
    const sums = new Array(k).fill(0);
    const counts = new Array(k).fill(0);
    for (let i = 0; i < s.length; i++) {
      const c = assignments[i]!;
      sums[c] += s[i]!;
      counts[c] += 1;
    }
    let changed = false;
    for (let c = 0; c < k; c++) {
      const nv = counts[c] ? sums[c] / counts[c] : centers[c];
      if (Math.abs(nv - centers[c]!) > 1e-9 * (maxV - minV || 1)) changed = true;
      centers[c] = nv;
    }
    if (!changed) break;
  }
  centers = [...centers].sort((a, b) => a - b);
  const breaks: number[] = [minV];
  for (let i = 1; i < k; i++) {
    breaks.push((centers[i - 1]! + centers[i]!) / 2);
  }
  breaks.push(maxV);
  for (let j = 1; j < breaks.length; j++) {
    if (breaks[j]! <= breaks[j - 1]!) breaks[j] = breaks[j - 1]! + 1e-9 * (maxV - minV || 1);
  }
  return breaks;
}

function stdDevBreaks(mean: number, std: number, minV: number, maxV: number, k: number): number[] {
  if (!Number.isFinite(std) || std <= 0 || k < 2) return equalIntervalBreaks(minV, maxV, k);
  const zMax = 2.5;
  const span = zMax * 2;
  const out: number[] = [];
  for (let i = 0; i <= k; i++) {
    const z = -zMax + (span * i) / k;
    const raw = mean + z * std;
    out.push(Math.max(minV, Math.min(maxV, raw)));
  }
  for (let j = 1; j < out.length; j++) {
    if (out[j]! <= out[j - 1]!) out[j] = out[j - 1]! + 1e-9 * (maxV - minV || 1);
  }
  return out;
}

export function siRasterSymbologyComputeBreaks(
  method: SiRasterSymbologyMethod,
  minV: number,
  maxV: number,
  classCount: number,
  sampleValues: number[],
  stats: { mean?: number; std?: number } | null,
): number[] {
  const k = Math.max(2, Math.min(15, Math.round(classCount)));
  if (!Number.isFinite(minV) || !Number.isFinite(maxV) || maxV <= minV) return equalIntervalBreaks(0, 1, k);
  switch (method) {
    case 'equal_interval':
      return equalIntervalBreaks(minV, maxV, k);
    case 'quantile':
      return quantileBreaks(sampleValues.length ? sampleValues : equalIntervalBreaks(minV, maxV, 50), k);
    case 'natural_breaks': {
      const samp =
        sampleValues.length >= k * 2
          ? sampleValues
          : Array.from({ length: 120 }, (_, i) => minV + ((maxV - minV) * (i + 0.5)) / 120);
      return naturalBreaksFromSample(samp, k);
    }
    case 'std_dev': {
      const mean = stats?.mean ?? (minV + maxV) / 2;
      const std = stats?.std ?? (maxV - minV) / 6;
      return stdDevBreaks(mean, std, minV, maxV, k);
    }
    case 'manual':
    default:
      return equalIntervalBreaks(minV, maxV, k);
  }
}

export function siRasterSymbologyRowsFromBreaks(
  breaks: number[],
  colors: string[],
): SiRasterSymbologyClassRow[] {
  const k = breaks.length - 1;
  const out: SiRasterSymbologyClassRow[] = [];
  for (let i = 0; i < k; i++) {
    const lo = breaks[i]!;
    const hi = breaks[i + 1]!;
    const color = colors[i] ?? colors[colors.length - 1] ?? '#22c55e';
    out.push({
      id: `c-${i}-${lo}-${hi}`,
      min: lo,
      max: hi,
      color,
      label: `Class ${i + 1}: ${lo.toFixed(2)} – ${hi.toFixed(2)}`,
    });
  }
  return out;
}

export function siRasterSymbologyRecomputeClasses(
  prev: SiRasterSymbologyState,
  minV: number,
  maxV: number,
  sampleValues: number[],
  stats: { mean?: number; std?: number } | null,
): SiRasterSymbologyState {
  if (prev.method === 'manual') return prev;
  const k = Math.max(2, Math.min(15, Math.round(prev.classCount)));
  const breaks = siRasterSymbologyComputeBreaks(prev.method, minV, maxV, k, sampleValues, stats);
  const rampColors = siRasterSymbologyRampColors(prev.rampId, prev.customStops, k);
  return {
    ...prev,
    classes: siRasterSymbologyRowsFromBreaks(breaks, rampColors),
  };
}

export function siRasterSymbologyDefaultState(targetLayerId: string): SiRasterSymbologyState {
  return {
    method: 'equal_interval',
    classCount: 5,
    opacity: 0.62,
    rampId: 'vegetation',
    customStops: ['#1e293b', '#94a3b8', '#f8fafc'],
    classes: [],
    targetLayerId,
    showOnMap: true,
    vizMode: 'classes',
    reclassifyApplied: false,
  };
}

/** Mapbox GL fill-color expression: step on clamped `v` property. */
export function siRasterSymbologyFillColorExpr(classes: SiRasterSymbologyClassRow[]): unknown[] | string {
  if (!classes.length) return '#00000000';
  const lo = classes[0]!.min;
  const hi = classes[classes.length - 1]!.max;
  const v: unknown[] = ['max', lo, ['min', hi, ['get', 'v']]];
  const expr: unknown[] = ['step', v, classes[0]!.color];
  for (let i = 1; i < classes.length; i++) {
    expr.push(classes[i]!.min, classes[i]!.color);
  }
  return expr;
}

/** Continuous ramp on AOI cell property `v`, clamped to [minV, maxV] — same raw field as class mode. */
export function siRasterSymbologyFillHeatmapExpr(
  minV: number,
  maxV: number,
  rampId: SiRasterSymbologyRampId,
  custom: [string, string, string],
): unknown[] | string {
  if (!Number.isFinite(minV) || !Number.isFinite(maxV) || maxV <= minV) return 'rgba(0,0,0,0)';
  const stops = siRasterSymbologyRampColors(rampId, custom, 7);
  const vClamped: unknown[] = ['max', minV, ['min', maxV, ['get', 'v']]];
  const span = maxV - minV;
  const t: unknown[] = ['/', ['-', vClamped, minV], span];
  const expr: unknown[] = ['interpolate', ['linear'], t, 0, stops[0]!];
  for (let i = 1; i < stops.length; i++) {
    expr.push(i / (stops.length - 1), stops[i]!);
  }
  return expr;
}

function cellPolygon(
  w: number,
  s: number,
  e: number,
  n: number,
): GeoJSON.Polygon {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  };
}

export function siRasterSymbologyBuildPreviewGrid(
  feature: GeoJSON.Feature | null,
  seed: string,
  mpcMin: number | null,
  mpcMax: number | null,
  drawnMin: number | null,
  drawnMax: number | null,
): GeoJSON.FeatureCollection {
  void seed;
  if (!feature?.geometry) return { type: 'FeatureCollection', features: [] };
  const geom = feature.geometry;
  if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') {
    return { type: 'FeatureCollection', features: [] };
  }
  const bounds = getDrawnFeatureLngLatBounds(feature);
  if (!bounds) return { type: 'FeatureCollection', features: [] };
  const [west, south, east, north] = bounds;
  if (![west, south, east, north].every(Number.isFinite) || east <= west || north <= south) {
    return { type: 'FeatureCollection', features: [] };
  }
  const width = east - west;
  const height = north - south;
  const aspect = width / Math.max(height, 1e-9);
  const cols = Math.max(22, Math.min(56, Math.round(34 * Math.max(0.6, Math.min(1.8, aspect)))));
  const rows = Math.max(22, Math.min(56, Math.round(34 / Math.max(0.6, Math.min(1.8, aspect)))));
  const dx = width / cols;
  const dy = height / rows;
  const fallbackMin = -1;
  const fallbackMax = 1;
  let minV =
    mpcMin != null && Number.isFinite(mpcMin) ? mpcMin : drawnMin != null && Number.isFinite(drawnMin) ? drawnMin : fallbackMin;
  let maxV =
    mpcMax != null && Number.isFinite(mpcMax) ? mpcMax : drawnMax != null && Number.isFinite(drawnMax) ? drawnMax : fallbackMax;
  if (!Number.isFinite(minV) || !Number.isFinite(maxV) || maxV <= minV) {
    minV = fallbackMin;
    maxV = fallbackMax;
  }
  const span = maxV - minV;
  const insideCells: Array<{ w: number; e: number; s: number; n: number }> = [];
  for (let yy = 0; yy < rows; yy += 1) {
    for (let xx = 0; xx < cols; xx += 1) {
      const cx = west + (xx + 0.5) * dx;
      const cy = south + (yy + 0.5) * dy;
      if (!pointInAoiGeometryLngLat(cx, cy, geom)) continue;
      const w = west + xx * dx;
      const e = west + (xx + 1) * dx;
      const s = south + yy * dy;
      const n = south + (yy + 1) * dy;
      insideCells.push({ w, e, s, n });
    }
  }
  const nCells = insideCells.length;
  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i < nCells; i++) {
    const cell = insideCells[i]!;
    /** Uniform quantiles in raw index range [minV,maxV] — one value per visible cell, no synthetic texture. */
    const u = nCells <= 1 ? 0.5 : (i + 0.5) / nCells;
    const v = minV + u * span;
    features.push({
      type: 'Feature',
      properties: { v: Number(v.toFixed(6)) },
      geometry: cellPolygon(cell.w, cell.s, cell.e, cell.n),
    });
  }
  return { type: 'FeatureCollection', features };
}

function walkCoordsLngLat2D(coords: unknown, points: [number, number][]) {
  if (coords == null) return;
  if (typeof coords === 'object' && Array.isArray(coords) && typeof coords[0] === 'number') {
    const a = coords as number[];
    if (typeof a[1] === 'number') points.push([a[0]!, a[1]!]);
    return;
  }
  if (Array.isArray(coords)) {
    (coords as unknown[]).forEach(c => walkCoordsLngLat2D(c, points));
  }
}

export function getDrawnFeatureLngLatBounds(feature: GeoJSON.Feature | null): [number, number, number, number] | null {
  if (!feature?.geometry) return null;
  const points: [number, number][] = [];
  walkCoordsLngLat2D((feature.geometry as GeoJSON.Polygon).coordinates, points);
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

export type SiRasterSymbologyPreset = {
  id: string;
  name: string;
  savedAt: string;
  state: SiRasterSymbologyState;
};

const PRESET_LS = 'si.rasterSymbology.presets.v1';

export function siRasterSymbologyLoadPresets(): SiRasterSymbologyPreset[] {
  try {
    const raw = localStorage.getItem(PRESET_LS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SiRasterSymbologyPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function siRasterSymbologySavePresets(presets: SiRasterSymbologyPreset[]) {
  try {
    localStorage.setItem(PRESET_LS, JSON.stringify(presets.slice(0, 40)));
  } catch {
    /* ignore */
  }
}
