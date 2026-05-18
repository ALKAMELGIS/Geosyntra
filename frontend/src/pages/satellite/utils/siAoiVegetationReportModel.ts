import { geodesicAreaHectares } from './siFieldGeodesicArea';
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
import type { SiPdfLngLatBounds } from './siAoiReportGeo';
import type { SiAoiReportLiveAnalysisSnapshot } from './siAoiReportLiveAnalysisSnapshot';
import {
  DEFAULT_SI_AOI_REPORT_STYLE_MODE,
  siAoiReportStyleModeInterpretationConfig,
  siAoiReportStyleModePdfLabels,
  type SiAoiReportStyleMode,
} from './siAoiReportStyleMode';

export type { SiAoiReportStyleMode } from './siAoiReportStyleMode';
export {
  DEFAULT_SI_AOI_REPORT_STYLE_MODE,
  SI_AOI_REPORT_STYLE_MODE_OPTIONS,
  SI_AOI_REPORT_STYLE_MODES,
} from './siAoiReportStyleMode';

import type {
  SiAoiClassificationPalette,
  SiAoiReportTableRow,
} from './siAoiReportCartographyTypes';

export type {
  SiAoiClassificationPalette,
  SiAoiReportCartographyInput,
  SiAoiReportTableRow,
} from './siAoiReportCartographyTypes';

export type SiAoiReportHealthKey = 'high' | 'medium' | 'low';

export type SiAoiReportTimePoint = { date: string; value: number };

export type SiAoiLegendBandCount = 5 | 10;

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

import {
  DEFAULT_SI_AOI_CLASSIFICATION_PALETTE,
  siAoiPaletteFromIndexRampStops,
  siAoiReportFeatureBBoxLngLat,
} from './siAoiReportGeo';

export {
  DEFAULT_SI_AOI_CLASSIFICATION_PALETTE,
  siAoiPaletteFromIndexRampStops,
  siAoiReportFeatureBBoxLngLat,
} from './siAoiReportGeo';

export type SiAoiReportModel = {
  indexId: StaticAoiChartLayerId;
  indexLabel: string;
  aoiName: string;
  dateStart: string;
  dateEnd: string;
  aoiAreaKm2: number;
  summaryLinesEn: string[];
  satelliteProviderName?: string;
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
  /** Narrative tone for Gemini text and PDF section labels. */
  reportStyleMode: SiAoiReportStyleMode;
  /** RS processing metadata echoed in summaries and Gemini payloads. */
  processingContext?: {
    cloudCoverMaxPct: number;
    temporalComposite: 'median' | 'max';
    crsNote?: string;
  };
  /** Frozen AOI-clipped raster analysis — sole source for Live Layer Analysis in preview/PDF. */
  liveLayerAnalysis?: SiAoiReportLiveAnalysisSnapshot | null;
};

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

/** Sample up to `maxFeatures` cells evenly from all in-AOI grid centers (avoids left-half-only caps). */
function sampleAoiGridCells(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  bounds: [number, number, number, number],
  nx: number,
  ny: number,
  maxFeatures: number,
): Array<{ cx: number; cy: number }> {
  const [w, s, e, n] = bounds;
  const spanX = Math.max(1e-9, e - w);
  const spanY = Math.max(1e-9, n - s);
  const dx = spanX / nx;
  const dy = spanY / ny;
  const candidates: Array<{ cx: number; cy: number }> = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const cx = w + (i + 0.5) * dx;
      const cy = s + (j + 0.5) * dy;
      if (pointInPolygonGeometry(cx, cy, geom)) candidates.push({ cx, cy });
    }
  }
  if (candidates.length <= maxFeatures) return candidates;
  const stride = candidates.length / maxFeatures;
  const out: Array<{ cx: number; cy: number }> = [];
  for (let k = 0; k < maxFeatures; k++) {
    out.push(candidates[Math.min(candidates.length - 1, Math.floor(k * stride))]!);
  }
  return out;
}

/** Pixel grid with class shares matching legend table rows (cumulative pct thresholds). */
function buildWeightedClassPixelGrid(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  bounds: [number, number, number, number],
  seed: string,
  rows: SiAoiReportTableRow[],
  maxFeatures = 3200,
): GeoJSON.FeatureCollection {
  const [w, s, e, n] = bounds;
  const spanX = Math.max(1e-9, e - w);
  const spanY = Math.max(1e-9, n - s);
  const targetCells = 56;
  const nx = Math.min(72, Math.max(28, Math.round((spanX / spanY) * targetCells)));
  const ny = Math.min(72, Math.max(28, Math.round((spanY / spanX) * targetCells)));
  const dx = spanX / nx;
  const dy = spanY / ny;
  const hx = dx * 0.5;
  const hy = dy * 0.5;
  const thresholds: number[] = [0];
  let acc = 0;
  for (const r of rows) {
    acc += r.pct / 100;
    thresholds.push(Math.min(1, acc));
  }
  if (thresholds[thresholds.length - 1]! < 1) thresholds[thresholds.length - 1] = 1;
  const cells = sampleAoiGridCells(geom, bounds, nx, ny, maxFeatures);
  const features: GeoJSON.Feature[] = [];
  for (const { cx, cy } of cells) {
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
    features.push({
      type: 'Feature',
      properties: { cls: row.key, fill, opacity: 0.52 },
      geometry: {
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
      },
    });
  }
  if (features.length === 0 && rows.length) {
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
  rows: SiAoiReportTableRow[],
  maxFeatures = 3200,
): GeoJSON.FeatureCollection {
  return buildWeightedClassPixelGrid(geom, bounds, seed, rows, maxFeatures);
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
  bandRows: SiAoiReportTableRow[],
): SiAoiChangeSlotStats {
  const counts = new Map<string, number>();
  for (const row of bandRows) counts.set(row.key, 0);
  for (const f of features) {
    const cls = String((f.properties as { cls?: string } | undefined)?.cls ?? '');
    counts.set(cls, (counts.get(cls) ?? 0) + 1);
  }
  const n = features.length || 1;
  const sorted = [...bandRows].sort((a, b) => (counts.get(b.key) ?? 0) - (counts.get(a.key) ?? 0));
  const top = sorted[0];
  const second = sorted[1];
  const third = sorted[2];
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
    highPct: top ? (100 * (counts.get(top.key) ?? 0)) / n : 0,
    medPct: second ? (100 * (counts.get(second.key) ?? 0)) / n : 0,
    lowPct: third ? (100 * (counts.get(third.key) ?? 0)) / n : 0,
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
  seriesSpread: number;
  tableRows: SiAoiReportTableRow[];
}): SiAoiChangeDetectionSlot[] {
  const { dates, timeSeries, indexId, geom, bounds, aoiKey, seriesSpread, tableRows } = input;
  const out: SiAoiChangeDetectionSlot[] = [];
  const maxPerTile = 3200;
  for (const date of dates) {
    const indexMean = valueForChangeSlotDate(date, timeSeries);
    const shiftedRows = tableRows.map((row, i) => {
      const wobble = ((hashStr(`${date}|${indexId}|${i}`) % 200) - 100) / 800;
      return { ...row, pct: Math.max(0.5, row.pct + wobble * seriesSpread) };
    });
    const sum = shiftedRows.reduce((a, r) => a + r.pct, 0) || 1;
    const normRows = shiftedRows.map(r => ({ ...r, pct: (100 * r.pct) / sum }));
    const seed = `${aoiKey}|${date}|${indexId}`;
    const heatmapCellsGeoJson = buildPixelClassificationGrid(geom, bounds, seed, normRows, maxPerTile);
    const stats = aggregateSlotStats(heatmapCellsGeoJson.features, indexMean, indexId, date, normRows);
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
  /** Satellite imagery provider shown in PDF / Excel / metadata. */
  satelliteProviderLabel?: string;
  /** Optional RS processing narrative appended to the executive summary block. */
  processingContext?: {
    cloudCoverMaxPct: number;
    temporalComposite: 'median' | 'max';
    crsNote?: string;
  };
  /** Legend-aligned class count for the area table and map overlay (5 or 10). */
  legendBandCount?: SiAoiLegendBandCount;
  reportStyleMode?: SiAoiReportStyleMode;
}): SiAoiReportModel | null {
  const {
    weekly,
    indexId,
    dateStart,
    dateEnd,
    aoiFeature,
    aoiName,
    processingContext,
    satelliteProviderLabel,
    classificationPalette: paletteIn,
    legendBandCount: legendBandCountIn,
    reportStyleMode: reportStyleModeIn,
  } = input;
  const reportStyleMode = reportStyleModeIn ?? DEFAULT_SI_AOI_REPORT_STYLE_MODE;
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
          tableRows,
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
    ...(satelliteProviderLabel?.trim()
      ? [`Satellite provider: ${satelliteProviderLabel.trim()} (layer catalog and timeline scoped to this source).`]
      : []),
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
    satelliteProviderName: satelliteProviderLabel?.trim() || undefined,
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
    reportStyleMode,
    processingContext,
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
  /** Five interpretation bullets (Gemini or client fallback) for page 3. */
  interpretationPoints?: string[] | null;
  /** Map extent for scale bar (defaults from AOI outline). */
  aoiMapLngLatBounds?: SiPdfLngLatBounds | null;
  /** Overrides `report.reportStyleMode` for PDF titles and section labels. */
  reportStyleMode?: SiAoiReportStyleMode;
};
