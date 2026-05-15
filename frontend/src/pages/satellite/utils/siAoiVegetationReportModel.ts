import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { geodesicAreaHectares } from '../components/fields/fieldsStore';
import {
  STATIC_AOI_CHART_LAYER_OPTIONS,
  staticAoiLayerMeanForWeek,
  type StaticAoiChartLayerId,
} from './staticAoiMultiChartData';
import {
  SI_NDMI_CLASSIFICATION_STOPS,
  SI_NDVI_CLASSIFICATION_STOPS,
  SI_NDWI_CLASSIFICATION_STOPS,
  type IndexRampStop,
  siThinLegendSegments,
} from '../../../lib/siWmsIndexClassificationRamp';

export type SiAoiReportHealthKey = 'high' | 'medium' | 'low';

export type SiAoiReportTimePoint = { date: string; value: number };

export type SiAoiLegendBandCount = 5 | 10;

export type SiAoiReportTableRow = {
  key: string;
  labelEn: string;
  pct: number;
  areaKm2: number;
  colorHex?: string;
};

/** Aggregated stats for one change-detection tile (from pixel grid inside AOI). */
export type SiAoiChangeSlotStats = {
  indexMean: number;
  indexMin: number;
  indexMax: number;
  pixelCount: number;
  highPct: number;
  medPct: number;
  lowPct: number;
};

/**
 * One timeline column: independent synthetic analysis for that date until STAC
 * scene URLs are supplied (`dataSource` + optional `sceneThumbUrl`).
 */
export type SiAoiChangeDetectionSlot = {
  date: string;
  /** Index value for this week from the same engine as the main chart. */
  indexMean: number;
  /** AOI-clipped pixel classification heatmap for this timestamp only. */
  heatmapCellsGeoJson: GeoJSON.FeatureCollection;
  stats: SiAoiChangeSlotStats;
  dataSource: 'client-synthetic' | 'stac-scene';
  /** Optional true-colour or analysis preview when wired to STAC. */
  sceneThumbUrl?: string;
};

export type SiAoiIndexInsightId = 'NDVI' | 'NDWI' | 'SAVI' | 'LST';

export type SiAoiIndexTableRow = {
  indexId: SiAoiIndexInsightId;
  label: string;
  min: number;
  max: number;
  mean: number;
  std: number;
  status: 'Healthy' | 'Moderate' | 'Risk';
};

export type SiAoiDashboardMetrics = {
  ndviAvg: number;
  ndwiStatusLabel: string;
  vegChangePct: number;
  heatRiskLabel: string;
  urbanExpansionPct: number;
  barSeries: Array<{ id: string; label: string; valueNorm: number }>;
  pieSlices: Array<{ label: string; pct: number; color: string }>;
  sparkNdvi: number[];
};

export type SiAoiDataInsightsBundle = {
  indexRows: SiAoiIndexTableRow[];
  dashboard: SiAoiDashboardMetrics;
  /** Reserved for client-side Gemini fill; PDF may override via export options. */
  executiveSummaryAi: string | null;
};

/** Colours for the three-class AOI heatmap / legend (aligned with Symbology ramp when provided). */
export type SiAoiClassificationPalette = {
  high: string;
  medium: string;
  low: string;
  aoiOutline: string;
};

export const DEFAULT_SI_AOI_CLASSIFICATION_PALETTE: SiAoiClassificationPalette = {
  high: '#22c55e',
  medium: '#eab308',
  low: '#ef4444',
  aoiOutline: '#38bdf8',
};

/**
 * Derive high / medium / low class colours from WMS symbology ramp stops (low index → first stop, high → last).
 */
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

export type SiAoiReportModel = {
  indexId: StaticAoiChartLayerId;
  indexLabel: string;
  aoiName: string;
  dateStart: string;
  dateEnd: string;
  aoiAreaKm2: number;
  summaryLinesEn: string[];
  analysisEn: string;
  stressNoteEn: string | null;
  timeSeries: SiAoiReportTimePoint[];
  /** Small square polygons inside the AOI — transparent classification “pixels” for map overlay. */
  heatmapCellsGeoJson: GeoJSON.FeatureCollection;
  aoiOutlineGeoJson: GeoJSON.FeatureCollection;
  /** Twelve independent temporal slots (3×4 grid): heatmap + stats per date. */
  changeDetectionSlots: SiAoiChangeDetectionSlot[];
  tableRows: SiAoiReportTableRow[];
  /** Enterprise dashboard payload (indices table + KPIs + chart series). */
  dataInsights: SiAoiDataInsightsBundle;
  /** Palette used for heatmaps, pie slices, and PDF legend (mirrors Symbology when passed into report build). */
  classificationPalette: SiAoiClassificationPalette;
  /** Number of legend-aligned area classes (5 or 10) used for table + map overlay. */
  legendBandCount: SiAoiLegendBandCount;
};

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

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0];
    const yi = ring[i]![1];
    const xj = ring[j]![0];
    const yj = ring[j]![1];
    const crosses = yi > lat !== yj > lat;
    if (!crosses) continue;
    const xInt = ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (lng < xInt) inside = !inside;
  }
  return inside;
}

function pointInPolygonGeometry(lng: number, lat: number, g: GeoJSON.Polygon | GeoJSON.MultiPolygon): boolean {
  if (g.type === 'Polygon') {
    const outer = g.coordinates[0];
    if (!outer || !pointInRing(lng, lat, outer)) return false;
    for (let h = 1; h < g.coordinates.length; h++) {
      const hole = g.coordinates[h];
      if (hole && pointInRing(lng, lat, hole)) return false;
    }
    return true;
  }
  for (const poly of g.coordinates) {
    const outer = poly[0];
    if (!outer || !pointInRing(lng, lat, outer)) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) {
      const hole = poly[h];
      if (hole && pointInRing(lng, lat, hole)) inHole = true;
    }
    if (!inHole) return true;
  }
  return false;
}

function cellHash(lng: number, lat: number, seed: string): number {
  const s = `${seed}|${lng.toFixed(6)}|${lat.toFixed(6)}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 10000;
}

function weeksOverlappingRange(
  weekly: Array<{ startDate: string; endDate: string; mean: number }>,
  dateStart: string,
  dateEnd: string,
): Array<{ startDate: string; endDate: string; mean: number }> {
  const ds = dateStart.trim();
  const de = dateEnd.trim();
  return weekly.filter(w => w.endDate >= ds && w.startDate <= de);
}

function syntheticWeeksBetween(
  dateStart: string,
  dateEnd: string,
  maxWeeks: number,
): Array<{ startDate: string; endDate: string; mean: number }> {
  const a = new Date(`${dateStart}T12:00:00Z`);
  const b = new Date(`${dateEnd}T12:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return [];
  const out: Array<{ startDate: string; endDate: string; mean: number }> = [];
  const cur = new Date(a);
  let i = 0;
  while (cur <= b && i < maxWeeks) {
    const start = cur.toISOString().slice(0, 10);
    const endDt = new Date(cur);
    endDt.setUTCDate(endDt.getUTCDate() + 6);
    if (endDt > b) endDt.setTime(b.getTime());
    const end = endDt.toISOString().slice(0, 10);
    const t = (cur.getTime() - a.getTime()) / Math.max(1, b.getTime() - a.getTime());
    out.push({ startDate: start, endDate: end, mean: 0.35 + 0.25 * Math.sin(t * Math.PI * 2) });
    cur.setUTCDate(cur.getUTCDate() + 7);
    i += 1;
  }
  return out;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Sentinel-style classified ramp stops for the static chart layer id (legend-aligned AOI report). */
function stopsForStaticAoiIndex(indexId: StaticAoiChartLayerId): readonly IndexRampStop[] {
  switch (indexId) {
    case 'NDWI':
      return SI_NDWI_CLASSIFICATION_STOPS;
    case 'NDMI':
      return SI_NDMI_CLASSIFICATION_STOPS;
    case 'NDVI':
    case 'SAVI':
    case 'EVI':
    case 'NDSI':
      return SI_NDVI_CLASSIFICATION_STOPS;
    case 'LST':
      return [
        [15, 0x312e81],
        [20, 0x4338ca],
        [24, 0x2563eb],
        [28, 0x22c55e],
        [32, 0xeab308],
        [36, 0xf97316],
        [40, 0xef4444],
        [45, 0x7f1d1d],
      ] as const;
    default:
      return SI_NDVI_CLASSIFICATION_STOPS;
  }
}

function buildLegendBandTableRows(
  indexId: StaticAoiChartLayerId,
  aoiAreaKm2: number,
  bandCount: SiAoiLegendBandCount,
): SiAoiReportTableRow[] {
  const stops = stopsForStaticAoiIndex(indexId);
  const segments = siThinLegendSegments(stops, bandCount);
  const weights = segments.map(seg => Math.max(1e-9, Math.abs(seg.to - seg.from)));
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  return segments.map((seg, i) => {
    const pct = (100 * weights[i]!) / sumW;
    const a = Number(seg.from.toFixed(3));
    const b = Number(seg.to.toFixed(3));
    return {
      key: `lb${i}`,
      labelEn: `${a} – ${b}`,
      pct,
      areaKm2: (aoiAreaKm2 * pct) / 100,
      colorHex: seg.color,
    };
  });
}

/** Pixel grid with class shares matching legend table rows (cumulative pct thresholds). */
function buildWeightedClassPixelGrid(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  bounds: [number, number, number, number],
  seed: string,
  rows: SiAoiReportTableRow[],
  maxFeatures = 2800,
): GeoJSON.FeatureCollection {
  const [w, s, e, n] = bounds;
  const spanX = Math.max(1e-9, e - w);
  const spanY = Math.max(1e-9, n - s);
  const targetCells = 52;
  const nx = Math.min(64, Math.max(24, Math.round((spanX / spanY) * targetCells)));
  const ny = Math.min(64, Math.max(24, Math.round((spanY / spanX) * targetCells)));
  const dx = spanX / nx;
  const dy = spanY / ny;
  /** Half-cell extent so polygons tessellate (no deliberate gaps / “checkerboard” seams). */
  const hx = dx * 0.5;
  const hy = dy * 0.5;
  const thresholds: number[] = [0];
  let acc = 0;
  for (const r of rows) {
    acc += r.pct / 100;
    thresholds.push(Math.min(1, acc));
  }
  if (thresholds[thresholds.length - 1]! < 1) thresholds[thresholds.length - 1] = 1;
  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (features.length >= maxFeatures) break;
      const cx = w + (i + 0.5) * dx;
      const cy = s + (j + 0.5) * dy;
      if (!pointInPolygonGeometry(cx, cy, geom)) continue;
      const u = (cellHash(cx, cy, seed) % 10000) / 10000;
      let k = rows.length - 1;
      for (let t = 0; t < rows.length; t++) {
        if (u < thresholds[t + 1]!) {
          k = t;
          break;
        }
      }
      const row = rows[k]!;
      const fill = row.colorHex ?? '#22c55e';
      const poly: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [cx - hx, cy - hy],
            [cx + hx, cy - hy],
            [cx + hx, cy + hy],
            [cx - hx, cy + hy],
            [cx - hx, cy - hy],
          ],
        ],
      };
      features.push({
        type: 'Feature',
        properties: { cls: row.key, fill, opacity: 0.5 },
        geometry: poly,
      });
    }
    if (features.length >= maxFeatures) break;
  }
  if (features.length === 0) {
    const cx = (w + e) / 2;
    const cy = (s + n) / 2;
    if (pointInPolygonGeometry(cx, cy, geom) && rows.length) {
      const row = rows[Math.floor(rows.length / 2)]!;
      const fill = row.colorHex ?? '#22c55e';
      const hx2 = spanX * 0.08;
      const hy2 = spanY * 0.08;
      features.push({
        type: 'Feature',
        properties: { cls: row.key, fill, opacity: 0.45 },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [cx - hx2, cy - hy2],
              [cx + hx2, cy - hy2],
              [cx + hx2, cy + hy2],
              [cx - hx2, cy + hy2],
              [cx - hx2, cy - hy2],
            ],
          ],
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** Semi-transparent square “pixels” clipped to AOI for classification overlay (client-side demo). */
function buildPixelClassificationGrid(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  bounds: [number, number, number, number],
  seed: string,
  pHigh: number,
  pMed: number,
  pLow: number,
  palette: SiAoiClassificationPalette,
  maxFeatures = 2800,
): GeoJSON.FeatureCollection {
  const [w, s, e, n] = bounds;
  const spanX = Math.max(1e-9, e - w);
  const spanY = Math.max(1e-9, n - s);
  const targetCells = 52;
  const nx = Math.min(64, Math.max(24, Math.round((spanX / spanY) * targetCells)));
  const ny = Math.min(64, Math.max(24, Math.round((spanY / spanX) * targetCells)));
  const dx = spanX / nx;
  const dy = spanY / ny;
  /** Half-cell extent so polygons tessellate (no deliberate gaps / “checkerboard” seams). */
  const hx = dx * 0.5;
  const hy = dy * 0.5;
  const th1 = pHigh / 100;
  const th2 = (pHigh + pMed) / 100;
  const features: GeoJSON.Feature[] = [];
  const cap = maxFeatures;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (features.length >= cap) break;
      const cx = w + (i + 0.5) * dx;
      const cy = s + (j + 0.5) * dy;
      if (!pointInPolygonGeometry(cx, cy, geom)) continue;
      const u = (cellHash(cx, cy, seed) % 10000) / 10000;
      let cls: SiAoiReportHealthKey;
      if (u < th1) cls = 'high';
      else if (u < th2) cls = 'medium';
      else cls = 'low';
      const fill = cls === 'high' ? palette.high : cls === 'medium' ? palette.medium : palette.low;
      const poly: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [cx - hx, cy - hy],
            [cx + hx, cy - hy],
            [cx + hx, cy + hy],
            [cx - hx, cy + hy],
            [cx - hx, cy - hy],
          ],
        ],
      };
      features.push({
        type: 'Feature',
        properties: { cls, fill, opacity: 0.42 },
        geometry: poly,
      });
    }
    if (features.length >= cap) break;
  }
  return { type: 'FeatureCollection', features };
}

/** Per-timestamp classification shares from that week’s index mean + full-series spread. */
function classifyPercentsFromMeanAndSpread(
  indexId: StaticAoiChartLayerId,
  mean: number,
  spread: number,
): { high: number; med: number; low: number } {
  let high = 40;
  let med = 35;
  let low = 25;
  if (indexId === 'LST') {
    if (mean > 32) {
      high = 25;
      med = 35;
      low = 40;
    } else if (mean < 22) {
      high = 45;
      med = 35;
      low = 20;
    }
  } else {
    if (mean > 0.45) {
      high = 48;
      med = 32;
      low = 20;
    } else if (mean < 0.22) {
      high = 18;
      med = 32;
      low = 50;
    }
    if (spread > 0.35) {
      med += 5;
      high -= 3;
      low -= 2;
    }
  }
  const sum = high + med + low;
  return {
    high: (100 * high) / sum,
    med: (100 * med) / sum,
    low: (100 * low) / sum,
  };
}

function aggregateSlotStats(
  features: GeoJSON.Feature[],
  indexMean: number,
  indexId: StaticAoiChartLayerId,
  date: string,
): SiAoiChangeSlotStats {
  let nh = 0;
  let nm = 0;
  let nl = 0;
  for (const f of features) {
    const cls = (f.properties as { cls?: string } | undefined)?.cls;
    if (cls === 'high') nh += 1;
    else if (cls === 'medium') nm += 1;
    else nl += 1;
  }
  const n = nh + nm + nl || 1;
  const meta = STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === indexId) ?? STATIC_AOI_CHART_LAYER_OPTIONS[0]!;
  const [r0, r1] = meta.range;
  const j = (hashStr(`${date}|${indexId}`) % 500) / 10000;
  const rawMin = indexMean - 0.15 - j;
  const rawMax = indexMean + 0.13 + j * 0.8;
  const indexMin = Math.max(r0, Math.min(r1, Math.min(rawMin, rawMax)));
  const indexMax = Math.max(r0, Math.min(r1, Math.max(rawMin, rawMax)));
  return {
    indexMean,
    indexMin,
    indexMax,
    pixelCount: features.length,
    highPct: (100 * nh) / n,
    medPct: (100 * nm) / n,
    lowPct: (100 * nl) / n,
  };
}

function valueForChangeSlotDate(date: string, timeSeries: SiAoiReportTimePoint[]): number {
  if (!date || date === '—') return 0;
  const exact = timeSeries.find(t => t.date === date);
  if (exact) return exact.value;
  const target = Date.parse(`${date}T12:00:00Z`);
  if (Number.isNaN(target)) return timeSeries[0]?.value ?? 0;
  let best = timeSeries[0]?.value ?? 0;
  let bestDiff = Infinity;
  for (const t of timeSeries) {
    const d = Math.abs(Date.parse(`${t.date}T12:00:00Z`) - target);
    if (d < bestDiff) {
      bestDiff = d;
      best = t.value;
    }
  }
  return best;
}

function buildChangeDetectionSlots(input: {
  dates: string[];
  timeSeries: SiAoiReportTimePoint[];
  indexId: StaticAoiChartLayerId;
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  bounds: [number, number, number, number];
  aoiKey: string;
  /** Full-series spread for classification rule parity with summary table. */
  seriesSpread: number;
  palette: SiAoiClassificationPalette;
}): SiAoiChangeDetectionSlot[] {
  const { dates, timeSeries, indexId, geom, bounds, aoiKey, seriesSpread, palette } = input;
  const out: SiAoiChangeDetectionSlot[] = [];
  const maxPerTile = 1100;
  for (const date of dates) {
    const indexMean = valueForChangeSlotDate(date, timeSeries);
    const { high, med, low } = classifyPercentsFromMeanAndSpread(indexId, indexMean, seriesSpread);
    const seed = `${aoiKey}|${date}|${indexId}`;
    const heatmapCellsGeoJson = buildPixelClassificationGrid(geom, bounds, seed, high, med, low, palette, maxPerTile);
    const stats = aggregateSlotStats(heatmapCellsGeoJson.features, indexMean, indexId, date);
    out.push({
      date,
      indexMean,
      heatmapCellsGeoJson,
      stats,
      dataSource: 'client-synthetic',
    });
  }
  return out;
}

function classifyHealthPercents(
  indexId: StaticAoiChartLayerId,
  series: SiAoiReportTimePoint[],
): { high: number; med: number; low: number } {
  const vals = series.map(s => s.value).filter(Number.isFinite);
  if (!vals.length) return { high: 34, med: 33, low: 33 };
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const spread = Math.max(...vals) - Math.min(...vals);
  return classifyPercentsFromMeanAndSpread(indexId, mean, spread);
}

function detectStressEn(indexId: StaticAoiChartLayerId, series: SiAoiReportTimePoint[]): string | null {
  const vals = series.map(s => s.value);
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  let maxDrop = 0;
  for (let i = 1; i < vals.length; i++) {
    maxDrop = Math.max(maxDrop, vals[i - 1]! - vals[i]!);
  }
  if (indexId !== 'LST' && (min < 0.12 || maxDrop > 0.18)) {
    return 'Possible vegetation stress or a sharp index drop was detected in this window — validate with field checks and reference areas.';
  }
  if (indexId === 'LST' && min > 38) {
    return 'Elevated canopy temperature may indicate heat stress — review irrigation timing and soil moisture.';
  }
  return null;
}

function stdDevPopulation(vals: number[]): number {
  const v = vals.filter(Number.isFinite);
  if (v.length < 2) return 0;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / v.length);
}

function classifyInsightStatus(id: SiAoiIndexInsightId, mean: number): 'Healthy' | 'Moderate' | 'Risk' {
  if (id === 'LST') {
    if (mean <= 28) return 'Healthy';
    if (mean <= 32) return 'Moderate';
    return 'Risk';
  }
  if (id === 'NDWI') {
    if (mean >= -0.08) return 'Healthy';
    if (mean >= -0.28) return 'Moderate';
    return 'Risk';
  }
  if (mean >= 0.38) return 'Healthy';
  if (mean >= 0.22) return 'Moderate';
  return 'Risk';
}

export function buildSiAoiDataInsightsBundle(
  weeks: Array<{ startDate: string; endDate: string; mean: number }>,
  aoiKey: string,
  classificationRows: SiAoiReportTableRow[],
  palette: SiAoiClassificationPalette,
): SiAoiDataInsightsBundle {
  const n = Math.max(1, weeks.length);
  const ids: SiAoiIndexInsightId[] = ['NDVI', 'NDWI', 'SAVI', 'LST'];
  const indexRows: SiAoiIndexTableRow[] = ids.map(id => {
    const vals = weeks.map((w, i) => staticAoiLayerMeanForWeek(id, i, n, aoiKey, w.mean));
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = stdDevPopulation(vals);
    const meta = STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === id)!;
    return {
      indexId: id,
      label: meta.label,
      min,
      max,
      mean,
      std,
      status: classifyInsightStatus(id, mean),
    };
  });

  const ndviVals = weeks.map((w, i) => staticAoiLayerMeanForWeek('NDVI', i, n, aoiKey, w.mean));
  const vegChange =
    ndviVals.length >= 2
      ? ((ndviVals[ndviVals.length - 1]! - ndviVals[0]!) / Math.max(0.06, Math.abs(ndviVals[0]!))) * 100
      : 0;

  const lstMean = indexRows.find(r => r.indexId === 'LST')!.mean;
  const heatRiskLabel = lstMean > 33 ? 'High' : lstMean > 28 ? 'Moderate' : 'Low';

  const barSeries = indexRows.map(r => ({
    id: r.indexId,
    label: r.label,
    valueNorm:
      r.indexId === 'LST' ? Math.max(0, Math.min(1, (r.mean - 15) / 30)) : Math.max(0, Math.min(1, (r.mean + 1) / 2)),
  }));

  const high = classificationRows.find(t => t.key === 'high')?.pct;
  const med = classificationRows.find(t => t.key === 'medium')?.pct;
  const low = classificationRows.find(t => t.key === 'low')?.pct;
  const pieSlices =
    high != null && med != null && low != null
      ? [
          {
            label: classificationRows.find(t => t.key === 'high')?.labelEn ?? 'High vigor',
            pct: high,
            color: palette.high,
          },
          {
            label: classificationRows.find(t => t.key === 'medium')?.labelEn ?? 'Medium',
            pct: med,
            color: palette.medium,
          },
          {
            label: classificationRows.find(t => t.key === 'low')?.labelEn ?? 'Low / stress',
            pct: low,
            color: palette.low,
          },
        ]
      : classificationRows.map(r => ({
          label: r.labelEn.length > 36 ? `${r.labelEn.slice(0, 34)}…` : r.labelEn,
          pct: r.pct,
          color: r.colorHex ?? palette.high,
        }));
  const ndwi = indexRows.find(r => r.indexId === 'NDWI')!;

  return {
    indexRows,
    dashboard: {
      ndviAvg: indexRows.find(r => r.indexId === 'NDVI')!.mean,
      ndwiStatusLabel: ndwi.status,
      vegChangePct: Number(Math.max(-99, Math.min(99, vegChange)).toFixed(1)),
      heatRiskLabel,
      urbanExpansionPct: Number((Math.max(0, -vegChange) * 0.22 + 2.5).toFixed(1)),
      barSeries,
      pieSlices,
      sparkNdvi: ndviVals,
    },
    executiveSummaryAi: null,
  };
}

function buildChangeDetectionDates(weekDates: string[], max = 12): string[] {
  const uniq = [...new Set(weekDates)].sort();
  if (uniq.length === 0) {
    return Array.from({ length: max }, () => '—');
  }
  if (uniq.length >= max) {
    const out: string[] = [];
    for (let i = 0; i < max; i++) {
      const idx = Math.round((i / (max - 1)) * (uniq.length - 1));
      out.push(uniq[idx]!);
    }
    return out;
  }
  const out = [...uniq];
  const last = uniq[uniq.length - 1]!;
  while (out.length < max) {
    out.push(last);
  }
  return out.slice(0, max);
}

/**
 * Client-side AOI vegetation report (demo analytics) aligned with the static chart engine.
 * Replace with API-backed zonal stats for production.
 */
export function buildSiAoiVegetationReport(input: {
  weekly: Array<{ startDate: string; endDate: string; mean: number }>;
  indexId: StaticAoiChartLayerId;
  dateStart: string;
  dateEnd: string;
  aoiFeature: GeoJSON.Feature;
  aoiName: string;
  /** Optional override merged onto default class colours (from Symbology ramp). */
  classificationPalette?: Partial<SiAoiClassificationPalette>;
  /** Optional RS processing narrative appended to the executive summary block. */
  processingContext?: {
    cloudCoverMaxPct: number;
    temporalComposite: 'median' | 'max';
    crsNote?: string;
  };
  /** Legend-aligned class count for the area table and map overlay (5 or 10). */
  legendBandCount?: SiAoiLegendBandCount;
}): SiAoiReportModel | null {
  const {
    weekly,
    indexId,
    dateStart,
    dateEnd,
    aoiFeature,
    aoiName,
    processingContext,
    classificationPalette: paletteIn,
    legendBandCount: legendBandCountIn,
  } = input;
  const legendBandCount: SiAoiLegendBandCount = legendBandCountIn === 10 ? 10 : 5;
  const g = aoiFeature.geometry as { type?: string } | undefined;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return null;

  const palette: SiAoiClassificationPalette = { ...DEFAULT_SI_AOI_CLASSIFICATION_PALETTE, ...paletteIn };

  const areaHa = geodesicAreaHectares(aoiFeature.geometry as any);
  const aoiAreaKm2 = areaHa / 100;
  const opt = STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === indexId) ?? STATIC_AOI_CHART_LAYER_OPTIONS[0]!;

  let weeks = weeksOverlappingRange(weekly, dateStart, dateEnd);
  if (!weeks.length) {
    weeks = syntheticWeeksBetween(dateStart, dateEnd, 24);
  }
  const n = weeks.length || 1;
  const aoiKey = JSON.stringify(aoiFeature.geometry).slice(0, 240);

  const timeSeries: SiAoiReportTimePoint[] = weeks.map((w, i) => ({
    date: w.startDate,
    value: staticAoiLayerMeanForWeek(indexId, i, n, aoiKey, w.mean),
  }));

  const mean = timeSeries.reduce((a, t) => a + t.value, 0) / Math.max(1, timeSeries.length);
  const tableRows = buildLegendBandTableRows(indexId, aoiAreaKm2, legendBandCount);

  const changeDetectionDates = buildChangeDetectionDates(timeSeries.map(t => t.date), 12);
  const seriesVals = timeSeries.map(s => s.value).filter(Number.isFinite);
  const seriesSpread = seriesVals.length ? Math.max(...seriesVals) - Math.min(...seriesVals) : 0;

  const bounds = siAoiReportFeatureBBoxLngLat(aoiFeature);
  const changeDetectionSlots: SiAoiChangeDetectionSlot[] =
    bounds && (g.type === 'Polygon' || g.type === 'MultiPolygon')
      ? buildChangeDetectionSlots({
          dates: changeDetectionDates,
          timeSeries,
          indexId,
          geom: g as GeoJSON.Polygon | GeoJSON.MultiPolygon,
          bounds,
          aoiKey,
          seriesSpread,
          palette,
        })
      : changeDetectionDates.map(date => ({
          date,
          indexMean: valueForChangeSlotDate(date, timeSeries),
          heatmapCellsGeoJson: { type: 'FeatureCollection' as const, features: [] },
          stats: {
            indexMean: valueForChangeSlotDate(date, timeSeries),
            indexMin: valueForChangeSlotDate(date, timeSeries),
            indexMax: valueForChangeSlotDate(date, timeSeries),
            pixelCount: 0,
            highPct: 0,
            medPct: 0,
            lowPct: 0,
          },
          dataSource: 'client-synthetic' as const,
        }));

  const heatmapCellsGeoJson =
    bounds && (g.type === 'Polygon' || g.type === 'MultiPolygon')
      ? buildWeightedClassPixelGrid(g as GeoJSON.Polygon | GeoJSON.MultiPolygon, bounds, aoiKey, tableRows)
      : { type: 'FeatureCollection' as const, features: [] };

  const aoiOutlineGeoJson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [aoiFeature as GeoJSON.Feature],
  };

  const stressNoteEn = detectStressEn(indexId, timeSeries);

  const meanStr = indexId === 'LST' ? mean.toFixed(1) : mean.toFixed(3);
  const summaryLinesEn = [
    `Area of interest "${aoiName}" was analyzed using ${opt.label} between ${dateStart} and ${dateEnd}.`,
    `Period mean index ≈ ${meanStr} (client-side demo values tied to the timeline until a zonal-stats service is connected).`,
    ...(processingContext
      ? [
          `RS processing context: cloud screening ≤ ${processingContext.cloudCoverMaxPct}% (MAXCC-style cap for ordering / metadata); temporal stack: ${
            processingContext.temporalComposite === 'median'
              ? 'median-of-weekly composites (robust to short spikes)'
              : 'weekly maximum composite (stress / peak signal emphasis)'
          }; CRS ${processingContext.crsNote ?? 'EPSG:4326 (WGS84 geographic)'}.`,
        ]
      : []),
    `The temporal pattern indicates a general vegetation signal within the polygon boundary.`,
    `Classification table and map overlay use ${legendBandCount} bands thinned from the same index legend ramp as the WMS classified view (by value-interval width, demo apportionment).`,
    stressNoteEn
      ? 'Alert: abrupt changes or outlier-like behaviour were flagged — confirm in the field if operational decisions depend on this view.'
      : 'No strong outlier pattern was flagged in this numeric sample.',
  ];

  const pctSummary = tableRows.map(r => `${r.pct.toFixed(1)}%`).join(' · ');
  const analysisEn = `${opt.label} (${opt.subtitle}): period mean index ≈ ${meanStr}. AOI area shares across ${tableRows.length} legend-aligned bands (${legendBandCount}-band ramp): ${pctSummary}. This matches the classified ramp band widths (client-side demo until zonal statistics are connected).`;

  const dataInsights = buildSiAoiDataInsightsBundle(weeks, aoiKey, tableRows, palette);

  return {
    indexId,
    indexLabel: opt.label,
    aoiName,
    dateStart,
    dateEnd,
    aoiAreaKm2,
    summaryLinesEn,
    analysisEn,
    stressNoteEn,
    timeSeries,
    heatmapCellsGeoJson,
    aoiOutlineGeoJson,
    changeDetectionSlots,
    tableRows,
    dataInsights,
    classificationPalette: palette,
    legendBandCount,
  };
}

export type SiAoiPdfExportMode = 'AOI_ANALYSIS' | 'TIME_SERIES_CHANGE_DETECTION';

export type SiAoiPdfExportOptions = {
  mode: SiAoiPdfExportMode;
  /** Timeline chart raster (optional; primary timeline in AOI PDF is vector). */
  chartImageDataUrl?: string | null;
  /** Main AOI analysis map snapshot. */
  aoiMapImageDataUrl?: string | null;
  /** Per-slot map captures for the 3×4 change-detection grid (same order as `changeDetectionSlots`). */
  changeSlotMapImageDataUrls?: (string | null | undefined)[] | null;
  /** Optional Gemini executive summary (plain text) for the Data & Insights PDF block. */
  executiveSummaryAi?: string | null;
};

function addChangeDetectionPageGrid(
  doc: jsPDF,
  slots: SiAoiChangeDetectionSlot[],
  indexLabel: string,
  margin: number,
  opts?: {
    insertPageBreakBefore?: boolean;
    startY?: number;
    compactHeader?: boolean;
    slotMapImages?: (string | null | undefined)[] | null;
    indexId?: StaticAoiChartLayerId;
  },
) {
  const textW = doc.internal.pageSize.getWidth() - margin * 2;
  const insertBreak = opts?.insertPageBreakBefore !== false;
  if (insertBreak) doc.addPage();
  let y = opts?.startY ?? margin;
  if (!opts?.compactHeader) {
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('Time series change detection', margin, y);
    y += 20;
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const hdr = doc.splitTextToSize(
      `Per-date ${indexLabel}: AOI-clipped classification overlay and class shares per tile. Map thumbnails embed when captured from the report preview.`,
      textW,
    );
    doc.text(hdr, margin, y);
    y += hdr.length * 10 + 12;
  }
  const cols = 3;
  const rows = 4;
  const gap = 8;
  const usableW = textW;
  const usableH = Math.max(280, 700 - y - margin);
  const cellW = (usableW - gap * (cols - 1)) / cols;
  const cellH = (usableH - gap * (rows - 1)) / rows;
  const fmtMean = (v: number) => (opts?.indexId === 'LST' ? v.toFixed(1) : v.toFixed(3));
  const fmtBound = (v: number) => (opts?.indexId === 'LST' ? v.toFixed(1) : v.toFixed(2));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const slot = slots[idx];
      const x = margin + c * (cellW + gap);
      const yy = y + r * (cellH + gap);
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.55);
      doc.roundedRect(x, yy, cellW, cellH, 3, 3, 'S');
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x + 1.5, yy + 1.5, cellW - 3, cellH - 3, 2, 2, 'F');
      if (!slot) continue;
      let ly = yy + 11;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(slot.date, x + 6, ly);
      ly += 10;
      const thumb = opts?.slotMapImages?.[idx];
      const imgH = Math.min(76, Math.max(36, cellH - 62));
      if (thumb && String(thumb).startsWith('data:image')) {
        try {
          doc.addImage(thumb, 'PNG', x + 4, ly, cellW - 8, imgH, undefined, 'SLOW');
        } catch {
          /* ignore bad snapshot */
        }
        ly += imgH + 4;
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(51, 65, 85);
      doc.text(
        `${indexLabel} mean ${fmtMean(slot.stats.indexMean)}   range ${fmtBound(slot.stats.indexMin)}–${fmtBound(slot.stats.indexMax)}`,
        x + 6,
        ly,
      );
      ly += 9;
      doc.text(
        `Class H/M/L: ${slot.stats.highPct.toFixed(0)} / ${slot.stats.medPct.toFixed(0)} / ${slot.stats.lowPct.toFixed(0)} %`,
        x + 6,
        ly,
      );
      ly += 9;
      doc.text(`AOI pixels: ${slot.stats.pixelCount}`, x + 6, ly);
      ly += 9;
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      const src =
        slot.dataSource === 'stac-scene' ? 'STAC scene' : 'Synthetic timeline (connect STAC for true imagery)';
      const srcLines = doc.splitTextToSize(src, cellW - 12);
      doc.text(srcLines, x + 6, ly);
    }
  }
}

function pdfPageBottom(doc: jsPDF, margin: number) {
  return doc.internal.pageSize.getHeight() - margin;
}

function pdfEnsureSpace(doc: jsPDF, y: number, margin: number, need: number): number {
  if (y + need > pdfPageBottom(doc, margin)) {
    doc.addPage();
    return margin;
  }
  return y;
}

function normalizeExecSummaryPdfText(raw: string): string {
  let s = raw.replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * jsPDF: never pass `maxWidth` together with an array from `splitTextToSize` — it
 * letter-spreads each line to fill the width (broken “A r e a …” rendering).
 */
function pdfTextBodyLines(
  doc: jsPDF,
  lines: string[],
  x: number,
  yTop: number,
  lineHeightFactor: number,
): number {
  if (!lines.length) return yTop;
  doc.text(lines, x, yTop, { lineHeightFactor, align: 'left' });
  return yTop + lines.length * doc.getFontSize() * lineHeightFactor;
}

function pdfInitBodyTypography(doc: jsPDF) {
  try {
    doc.setCharSpace(0);
  } catch {
    /* older jsPDF */
  }
  try {
    doc.setR2L(false);
  } catch {
    /* optional */
  }
}

function hexToRgbTriplet(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return [34, 197, 94];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function timelineAccentRgb(indexId: StaticAoiChartLayerId): [number, number, number] {
  switch (indexId) {
    case 'NDWI':
      return [59, 130, 246];
    case 'SAVI':
      return [202, 138, 4];
    case 'LST':
      return [249, 115, 22];
    default:
      return [16, 185, 129];
  }
}

/** Vector timeline (axes + polyline + markers) for sharp PDF output. */
function drawIndexTimelineVectorPdf(
  doc: jsPDF,
  series: SiAoiReportTimePoint[],
  indexId: StaticAoiChartLayerId,
  x: number,
  yTop: number,
  w: number,
  h: number,
) {
  const pts = series.filter(p => Number.isFinite(p.value));
  if (pts.length < 2) return;
  const vals = pts.map(p => p.value);
  let vMin = Math.min(...vals);
  let vMax = Math.max(...vals);
  const pad = Math.max(1e-6, (vMax - vMin) * 0.1);
  vMin -= pad;
  vMax += pad;
  const span = Math.max(1e-6, vMax - vMin);
  const padL = 36;
  const padR = 10;
  const padT = 14;
  const padB = 30;
  const innerX = x + padL;
  const innerW = Math.max(40, w - padL - padR);
  const innerY = yTop + padT;
  const innerH = Math.max(40, h - padT - padB);
  const [acR, acG, acB] = timelineAccentRgb(indexId);

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.roundedRect(x, yTop, w, h, 3, 3, 'S');

  const gridLines = 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  for (let g = 0; g <= gridLines; g++) {
    const t = g / gridLines;
    const yy = innerY + innerH * (1 - t);
    doc.setDrawColor(241, 245, 249);
    doc.line(innerX, yy, innerX + innerW, yy);
    const tickVal = vMin + t * span;
    const lab = indexId === 'LST' ? tickVal.toFixed(1) : tickVal.toFixed(2);
    doc.text(lab, x + 4, yy + 2);
  }

  const px = (i: number) => innerX + (i / Math.max(1, pts.length - 1)) * innerW;
  const py = (v: number) => innerY + innerH - ((v - vMin) / span) * innerH;

  doc.setDrawColor(acR, acG, acB);
  doc.setLineWidth(1.05);
  for (let i = 1; i < pts.length; i++) {
    doc.line(px(i - 1), py(pts[i - 1]!.value), px(i), py(pts[i]!.value));
  }

  doc.setFillColor(acR, acG, acB);
  for (let i = 0; i < pts.length; i++) {
    doc.circle(px(i), py(pts[i]!.value), 1.35, 'F');
  }

  const labelSlots = Math.min(4, pts.length);
  doc.setFontSize(6.2);
  doc.setTextColor(71, 85, 105);
  for (let i = 0; i < labelSlots; i++) {
    const idx = Math.round((i / Math.max(1, labelSlots - 1)) * (pts.length - 1));
    const lab = pts[idx]!.date.slice(0, 10);
    const tx = px(idx);
    const lx = Math.min(innerX + innerW - 44, Math.max(innerX + 2, tx - 18));
    doc.text(lab, lx, innerY + innerH + 12);
  }
}

function drawPieSlicesPdf(
  doc: jsPDF,
  slices: Array<{ label: string; pct: number; color: string }>,
  cx: number,
  cy: number,
  r: number,
) {
  const total = slices.reduce((a, s) => a + Math.max(0, s.pct), 0) || 1;
  let a0 = -Math.PI / 2;
  const segs = 22;
  for (const s of slices) {
    const sweep = (Math.max(0, s.pct) / total) * Math.PI * 2;
    const a1 = a0 + sweep;
    const [R, G, B] = hexToRgbTriplet(s.color);
    doc.setFillColor(R, G, B);
    for (let k = 0; k < segs; k++) {
      const t0 = a0 + (sweep * k) / segs;
      const t1 = a0 + (sweep * (k + 1)) / segs;
      doc.triangle(
        cx,
        cy,
        cx + r * Math.cos(t0),
        cy + r * Math.sin(t0),
        cx + r * Math.cos(t1),
        cy + r * Math.sin(t1),
        'F',
      );
    }
    a0 = a1;
  }
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.45);
  doc.circle(cx, cy, r, 'S');
}

function drawBarSeriesPdf(
  doc: jsPDF,
  series: Array<{ id: string; label: string; valueNorm: number }>,
  x: number,
  yTop: number,
  w: number,
  h: number,
) {
  const n = series.length || 1;
  const axisH = 24;
  const rowH = (h - axisH) / n;
  const labelColW = Math.min(78, Math.max(56, w * 0.28));
  const barX = x + labelColW + 4;
  const barW = Math.max(40, w - labelColW - 10);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, yTop, w, h, 2, 2, 'S');
  for (let i = 0; i < series.length; i++) {
    const s = series[i]!;
    const yy = yTop + i * rowH + 3;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    doc.text(s.label, x + 4, yy + rowH * 0.48);
    const t = Math.max(0, Math.min(1, s.valueNorm));
    const [R, G, B] = hexToRgbTriplet('#0f766e');
    doc.setFillColor(R, G, B);
    doc.roundedRect(barX, yy, Math.max(1.5, t * barW), rowH - 6, 1, 1, 'F');
  }
  const axisY = yTop + h - axisH + 4;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.35);
  doc.line(barX, axisY, barX + barW, axisY);
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('0', barX - 1, axisY + 10);
  doc.text('0.5', barX + barW * 0.5 - 6, axisY + 10);
  doc.text('1', barX + barW - 8, axisY + 10);
  doc.setFontSize(6);
  doc.text('Normalized index weight (0–1)', barX, axisY + 20);
}

function appendDataInsightsPdf(doc: jsPDF, report: SiAoiReportModel, opts: SiAoiPdfExportOptions, margin: number, y0: number): number {
  let y = y0;
  const di = report.dataInsights;
  const textW = doc.internal.pageSize.getWidth() - margin * 2;
  const bodyLh = 1.36;
  const rawExec =
    (opts.executiveSummaryAi && opts.executiveSummaryAi.trim()) ||
    (di.executiveSummaryAi && di.executiveSummaryAi.trim()) ||
    report.summaryLinesEn.join(' ');
  const execText = normalizeExecSummaryPdfText(rawExec);

  y = pdfEnsureSpace(doc, y, margin, 72);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Data & insights', margin, y);
  y += 20;

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Executive summary', margin, y);
  y += 13;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const execWrap = doc.splitTextToSize(execText, textW);
  const execBlockH = execWrap.length * doc.getFontSize() * bodyLh + 10;
  y = pdfEnsureSpace(doc, y, margin, execBlockH);
  y = pdfTextBodyLines(doc, execWrap, margin, y, bodyLh) + 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Index data (NDVI / NDWI / SAVI / LST)', margin, y);
  y += 13;

  const fmt = (id: SiAoiIndexInsightId, v: number) => (id === 'LST' ? v.toFixed(2) : v.toFixed(3));

  autoTable(doc, {
    startY: y,
    head: [['Index', 'Min', 'Max', 'Mean', 'Std dev', 'Status']],
    body: di.indexRows.map(r => [
      r.label,
      fmt(r.indexId, r.min),
      fmt(r.indexId, r.max),
      fmt(r.indexId, r.mean),
      fmt(r.indexId, r.std),
      r.status,
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
      lineColor: [226, 232, 240],
      lineWidth: 0.25,
      textColor: [30, 41, 59],
      halign: 'left',
      valign: 'middle',
    },
    headStyles: { fillColor: [21, 94, 50], textColor: 255, fontStyle: 'bold', halign: 'left' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      5: { cellWidth: 58 },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 5) {
        const s = String(data.cell.raw ?? '');
        if (s === 'Healthy') data.cell.styles.fillColor = [220, 252, 231];
        else if (s === 'Moderate') data.cell.styles.fillColor = [254, 249, 195];
        else if (s === 'Risk') data.cell.styles.fillColor = [254, 226, 226];
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 18;

  const d = di.dashboard;
  y = pdfEnsureSpace(doc, y, margin, 120);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('3. AOI summary dashboard (KPIs)', margin, y);
  y += 13;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const kpis = [
    `NDVI average: ${d.ndviAvg.toFixed(3)}`,
    `NDWI status class: ${d.ndwiStatusLabel}`,
    `Vegetation change (period): ${d.vegChangePct >= 0 ? '+' : ''}${d.vegChangePct.toFixed(1)} %`,
    `Heat risk (LST-based): ${d.heatRiskLabel}`,
    `Urban expansion proxy: ${d.urbanExpansionPct.toFixed(1)} % (heuristic from NDVI trend)`,
  ];
  for (const line of kpis) {
    const wrapped = doc.splitTextToSize(line, textW);
    const blockH = wrapped.length * doc.getFontSize() * bodyLh + 6;
    y = pdfEnsureSpace(doc, y, margin, blockH);
    y = pdfTextBodyLines(doc, wrapped, margin, y, bodyLh) + 4;
  }
  y += 10;

  const chartGap = 14;
  const halfW = (textW - chartGap) / 2;
  const chartRowH = 118;
  y = pdfEnsureSpace(doc, y, margin, chartRowH + 36);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('4. Index comparison (bars)', margin, y);
  doc.text('5. Class distribution (pie)', margin + halfW + chartGap, y);
  y += 13;
  const rowTop = y;
  drawBarSeriesPdf(doc, d.barSeries, margin, rowTop, halfW, chartRowH);

  const col2 = margin + halfW + chartGap;
  const pieR = 40;
  const pieCx = col2 + pieR + 8;
  const pieCy = rowTop + pieR + 8;
  drawPieSlicesPdf(doc, d.pieSlices, pieCx, pieCy, pieR);
  const pieLegendX = pieCx + pieR + 12;
  let lyLeg = rowTop + 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  const legendTextW = Math.max(80, halfW - pieR * 2 - 32);
  for (const sl of d.pieSlices) {
    const [R, G, B] = hexToRgbTriplet(sl.color);
    doc.setFillColor(R, G, B);
    doc.roundedRect(pieLegendX, lyLeg - 4, 8, 8, 1, 1, 'F');
    const labLines = doc.splitTextToSize(`${sl.label}: ${sl.pct.toFixed(1)}%`, legendTextW);
    doc.text(labLines, pieLegendX + 12, lyLeg + 2, { lineHeightFactor: 1.28, align: 'left' });
    lyLeg += Math.max(13, labLines.length * 9.5);
  }
  y = rowTop + chartRowH + 24;

  return y;
}

/**
 * AOI-only PDF: narrative, table, high-res chart + optional map snapshot. No timeline grid page.
 */
function buildAoiAnalysisPdfDocument(doc: jsPDF, report: SiAoiReportModel, opts: SiAoiPdfExportOptions) {
  const margin = 48;
  const textW = doc.internal.pageSize.getWidth() - margin * 2;
  let y = margin;

  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 44, 'F');
  doc.setTextColor(248, 250, 252);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('AOI analysis report', margin, 28);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text('Geosyntra · Satellite intelligence (export)', margin, 40);

  y = 58;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(`AOI: ${report.aoiName}`, margin, y);
  y += 14;
  doc.text(`Index: ${report.indexLabel}   Period: ${report.dateStart} .. ${report.dateEnd}`, margin, y);
  y += 14;
  doc.text(`AOI area: ${report.aoiAreaKm2.toFixed(3)} km²`, margin, y);
  y += 22;

  y = appendDataInsightsPdf(doc, report, opts, margin, y);
  y += 10;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Scientific analysis', margin, y);
  doc.setFont('helvetica', 'normal');
  y += 15;
  doc.setFontSize(9);
  const analysisLh = 1.36;
  const analysisWrap = doc.splitTextToSize(report.analysisEn, textW);
  y = pdfEnsureSpace(doc, y, margin, analysisWrap.length * doc.getFontSize() * analysisLh + 12);
  y = pdfTextBodyLines(doc, analysisWrap, margin, y, analysisLh) + 10;
  if (report.stressNoteEn) {
    doc.setTextColor(154, 52, 18);
    const st = doc.splitTextToSize(`Stress note: ${report.stressNoteEn}`, textW);
    y = pdfEnsureSpace(doc, y, margin, st.length * doc.getFontSize() * analysisLh + 12);
    y = pdfTextBodyLines(doc, st, margin, y, analysisLh) + 12;
    doc.setTextColor(15, 23, 42);
  }

  autoTable(doc, {
    startY: y,
    head: [['Class', 'Area (km²)', 'Share %']],
    body: report.tableRows.map(r => [r.labelEn, r.areaKm2.toFixed(3), r.pct.toFixed(1)]),
    styles: { fontSize: 9, cellPadding: 3.5, lineColor: [226, 232, 240], lineWidth: 0.25 },
    headStyles: { fillColor: [21, 128, 61], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  y = (doc as any).lastAutoTable.finalY + 18;

  if (report.timeSeries.length >= 2) {
    const tlH = 168;
    y = pdfEnsureSpace(doc, y, margin, tlH + 28);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${report.indexLabel} timeline`, margin, y);
    y += 14;
    drawIndexTimelineVectorPdf(doc, report.timeSeries, report.indexId, margin, y, textW, tlH);
    y += tlH + 12;
  }

  if (opts.aoiMapImageDataUrl) {
    try {
      const mapH = 204;
      if (y + mapH > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('AOI map — basemap, classification, AOI, north, scale, legend', margin, y);
      y += 12;
      doc.addImage(opts.aoiMapImageDataUrl, 'PNG', margin, y, textW, mapH, undefined, 'SLOW');
      y += mapH + 14;
    } catch {
      /* ignore map embed */
    }
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  const foot = doc.splitTextToSize(
    'Raster map figures embed at 2× resolution when captured from the live preview. Timeline and chart geometry in this export are vector paths for sharp printing. For acquisition-true imagery, connect STAC in the main Satellite workspace.',
    textW,
  );
  const footLh = 1.34;
  const footH = foot.length * doc.getFontSize() * footLh + 8;
  if (y + footH > doc.internal.pageSize.getHeight() - margin) {
    doc.addPage();
    y = margin;
  }
  pdfTextBodyLines(doc, foot, margin, y, footLh);
}

function buildTimeSeriesChangeDetectionPdfDocument(doc: jsPDF, report: SiAoiReportModel, opts: SiAoiPdfExportOptions) {
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 52, 'F');
  doc.setTextColor(248, 250, 252);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('Time series change detection', margin + 6, 26);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(`${report.indexLabel} · ${report.aoiName}`, margin + 6, 40);
  doc.text(`Period ${report.dateStart} .. ${report.dateEnd}   ·   AOI area ${report.aoiAreaKm2.toFixed(3)} km²`, margin + 6, 50);

  addChangeDetectionPageGrid(doc, report.changeDetectionSlots, report.indexLabel, margin, {
    insertPageBreakBefore: false,
    startY: 62,
    compactHeader: true,
    slotMapImages: opts.changeSlotMapImageDataUrls,
    indexId: report.indexId,
  });

  if (report.timeSeries.length >= 2) {
    doc.addPage();
    const textW = pageW - margin * 2;
    let yt = margin;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${report.indexLabel} timeline`, margin, yt);
    yt += 22;
    drawIndexTimelineVectorPdf(doc, report.timeSeries, report.indexId, margin, yt, textW, 150);
    yt += 162;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Classification legend', margin, yt);
    yt += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    const pal = report.classificationPalette;
    for (const row of report.tableRows) {
      const col =
        row.colorHex ??
        (row.key === 'high' ? pal.high : row.key === 'medium' ? pal.medium : pal.low);
      const [R, G, B] = hexToRgbTriplet(col);
      doc.setFillColor(R, G, B);
      doc.roundedRect(margin, yt - 5, 10, 10, 1, 1, 'F');
      doc.text(`${row.labelEn} (${row.pct.toFixed(1)}%)`, margin + 16, yt + 3);
      yt += 18;
    }
    const [rA, gA, bA] = hexToRgbTriplet(pal.aoiOutline);
    doc.setFillColor(rA, gA, bA);
    doc.roundedRect(margin, yt - 5, 10, 10, 1, 1, 'F');
    doc.text('AOI outline', margin + 16, yt + 3);
  }

  doc.addPage();
  let y = margin;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Data & insights (appendix)', margin, y);
  y += 20;
  appendDataInsightsPdf(doc, report, opts, margin, y);
}

export function exportSiAoiVegetationReportPdf(report: SiAoiReportModel, options: SiAoiPdfExportOptions) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  pdfInitBodyTypography(doc);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  if (options.mode === 'TIME_SERIES_CHANGE_DETECTION') {
    buildTimeSeriesChangeDetectionPdfDocument(doc, report, options);
    doc.save(`aoi-timeseries-change-detection-${stamp}.pdf`);
    return;
  }

  buildAoiAnalysisPdfDocument(doc, report, options);
  doc.save(`aoi-analysis-report-${stamp}.pdf`);
}
