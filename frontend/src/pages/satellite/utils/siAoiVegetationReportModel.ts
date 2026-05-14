import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { geodesicAreaHectares } from '../components/fields/fieldsStore';
import {
  STATIC_AOI_CHART_LAYER_OPTIONS,
  staticAoiLayerMeanForWeek,
  type StaticAoiChartLayerId,
} from './staticAoiMultiChartData';

export type SiAoiReportHealthKey = 'high' | 'medium' | 'low';

export type SiAoiReportTimePoint = { date: string; value: number };

export type SiAoiReportTableRow = {
  key: SiAoiReportHealthKey;
  labelEn: string;
  pct: number;
  areaKm2: number;
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

/** Semi-transparent square “pixels” clipped to AOI for classification overlay (client-side demo). */
function buildPixelClassificationGrid(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  bounds: [number, number, number, number],
  seed: string,
  pHigh: number,
  pMed: number,
  pLow: number,
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
  const hx = dx * 0.45;
  const hy = dy * 0.45;
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
      const fill = cls === 'high' ? '#22c55e' : cls === 'medium' ? '#eab308' : '#ef4444';
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
}): SiAoiChangeDetectionSlot[] {
  const { dates, timeSeries, indexId, geom, bounds, aoiKey, seriesSpread } = input;
  const out: SiAoiChangeDetectionSlot[] = [];
  const maxPerTile = 1100;
  for (const date of dates) {
    const indexMean = valueForChangeSlotDate(date, timeSeries);
    const { high, med, low } = classifyPercentsFromMeanAndSpread(indexId, indexMean, seriesSpread);
    const seed = `${aoiKey}|${date}|${indexId}`;
    const heatmapCellsGeoJson = buildPixelClassificationGrid(geom, bounds, seed, high, med, low, maxPerTile);
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

  const high = classificationRows.find(t => t.key === 'high')?.pct ?? 33;
  const med = classificationRows.find(t => t.key === 'medium')?.pct ?? 34;
  const low = classificationRows.find(t => t.key === 'low')?.pct ?? 33;
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
      pieSlices: [
        { label: 'High vigor', pct: high, color: '#16a34a' },
        { label: 'Medium', pct: med, color: '#ca8a04' },
        { label: 'Low / stress', pct: low, color: '#dc2626' },
      ],
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
  /** Optional RS processing narrative appended to the executive summary block. */
  processingContext?: {
    cloudCoverMaxPct: number;
    temporalComposite: 'median' | 'max';
    crsNote?: string;
  };
}): SiAoiReportModel | null {
  const { weekly, indexId, dateStart, dateEnd, aoiFeature, aoiName, processingContext } = input;
  const g = aoiFeature.geometry as { type?: string } | undefined;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return null;

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
  const { high, med, low } = classifyHealthPercents(indexId, timeSeries);
  const tableRows: SiAoiReportTableRow[] = [
    {
      key: 'high',
      labelEn: 'High vegetation health',
      pct: high,
      areaKm2: (aoiAreaKm2 * high) / 100,
    },
    {
      key: 'medium',
      labelEn: 'Medium vegetation health',
      pct: med,
      areaKm2: (aoiAreaKm2 * med) / 100,
    },
    {
      key: 'low',
      labelEn: 'Low / degraded',
      pct: low,
      areaKm2: (aoiAreaKm2 * low) / 100,
    },
  ];

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
      ? buildPixelClassificationGrid(g as GeoJSON.Polygon | GeoJSON.MultiPolygon, bounds, aoiKey, high, med, low)
      : { type: 'FeatureCollection' as const, features: [] };

  const aoiOutlineGeoJson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [aoiFeature as GeoJSON.Feature],
  };

  const stressNoteEn = detectStressEn(indexId, timeSeries);

  const meanStr = mean.toFixed(3);
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
    'The temporal pattern indicates a general vegetation signal within the polygon boundary.',
    'Health shares (high / medium / low) are heuristics derived from the index trajectory and range.',
    stressNoteEn
      ? 'Alert: abrupt changes or outlier-like behaviour were flagged — confirm in the field if operational decisions depend on this view.'
      : 'No strong outlier pattern was flagged in this numeric sample.',
  ];

  const analysisEn = `${opt.label} (${opt.subtitle}): with a period mean of ${meanStr} and variability across the displayed weeks, the AOI area is apportioned approximately ${high.toFixed(
    1,
  )}% high health, ${med.toFixed(1)}% medium, and ${low.toFixed(
    1,
  )}% low / degraded (illustrative client-side split). Replace with true zonal statistics from your backend for enterprise reporting.`;

  const dataInsights = buildSiAoiDataInsightsBundle(weeks, aoiKey, tableRows);

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
  };
}

export type SiAoiPdfExportMode = 'AOI_ANALYSIS' | 'TIME_SERIES_CHANGE_DETECTION';

export type SiAoiPdfExportOptions = {
  mode: SiAoiPdfExportMode;
  /** Timeline chart raster (use 2× canvas for sharp PDF). */
  chartImageDataUrl?: string | null;
  /** Main AOI analysis map snapshot (AOI_ANALYSIS mode only). */
  aoiMapImageDataUrl?: string | null;
  /** Optional Gemini executive summary (plain text) for the Data & Insights PDF block. */
  executiveSummaryAi?: string | null;
};

function addChangeDetectionPageGrid(
  doc: jsPDF,
  slots: SiAoiChangeDetectionSlot[],
  indexLabel: string,
  margin: number,
  opts?: { insertPageBreakBefore?: boolean; startY?: number; compactHeader?: boolean },
) {
  const insertBreak = opts?.insertPageBreakBefore !== false;
  if (insertBreak) doc.addPage();
  let y = opts?.startY ?? margin;
  if (!opts?.compactHeader) {
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('Time Series Change Detection Map', margin, y);
    y += 20;
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const hdr = doc.splitTextToSize(
      `Per-date ${indexLabel}: AOI-clipped pixel classification, class shares, and index range per tile (vector text). Client-side preview until STAC scene URLs are attached per timestamp.`,
      520,
    );
    doc.text(hdr, margin, y);
    y += hdr.length * 10 + 12;
  }
  const cols = 3;
  const rows = 4;
  const gap = 8;
  const usableW = 520;
  const usableH = Math.max(280, 700 - y - margin);
  const cellW = (usableW - gap * (cols - 1)) / cols;
  const cellH = (usableH - gap * (rows - 1)) / rows;

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
      let ly = yy + 12;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(slot.date, x + 6, ly);
      ly += 11;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(51, 65, 85);
      doc.text(
        `${indexLabel} mean ${slot.stats.indexMean.toFixed(3)}   range ${slot.stats.indexMin.toFixed(2)}–${slot.stats.indexMax.toFixed(2)}`,
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

function drawNdviSparklinePdf(doc: jsPDF, vals: number[], x: number, yTop: number, w: number, h: number) {
  const xs = vals.filter(Number.isFinite);
  if (xs.length < 2) return;
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const span = Math.max(1e-6, hi - lo);
  doc.setDrawColor(22, 163, 74);
  doc.setLineWidth(0.7);
  for (let i = 1; i < xs.length; i++) {
    const t0 = (i - 1) / (xs.length - 1);
    const t1 = i / (xs.length - 1);
    const px0 = x + t0 * w;
    const px1 = x + t1 * w;
    const py0 = yTop + h - ((xs[i - 1]! - lo) / span) * h;
    const py1 = yTop + h - ((xs[i]! - lo) / span) * h;
    doc.line(px0, py0, px1, py1);
  }
}

function appendDataInsightsPdf(doc: jsPDF, report: SiAoiReportModel, opts: SiAoiPdfExportOptions, margin: number, y0: number): number {
  let y = y0;
  const di = report.dataInsights;
  const execText =
    (opts.executiveSummaryAi && opts.executiveSummaryAi.trim()) ||
    (di.executiveSummaryAi && di.executiveSummaryAi.trim()) ||
    report.summaryLinesEn.join(' ');

  y = pdfEnsureSpace(doc, y, margin, 72);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Data & insights', margin, y);
  y += 18;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Executive summary (AI-assisted)', margin, y);
  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const execWrap = doc.splitTextToSize(execText, 520);
  y = pdfEnsureSpace(doc, y, margin, execWrap.length * 10 + 6);
  doc.text(execWrap, margin, y);
  y += execWrap.length * 10 + 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Index data (NDVI / NDWI / SAVI / LST)', margin, y);
  y += 12;

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
    styles: { fontSize: 8.5, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.25, textColor: [30, 41, 59] },
    headStyles: { fillColor: [21, 94, 50], textColor: 255, fontStyle: 'bold' },
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
  y = (doc as any).lastAutoTable.finalY + 16;

  const d = di.dashboard;
  y = pdfEnsureSpace(doc, y, margin, 120);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('3. AOI summary dashboard (KPIs)', margin, y);
  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const kpis = [
    `NDVI average: ${d.ndviAvg.toFixed(3)}`,
    `NDWI status class: ${d.ndwiStatusLabel}`,
    `Vegetation change (period): ${d.vegChangePct >= 0 ? '+' : ''}${d.vegChangePct.toFixed(1)} %`,
    `Heat risk (LST-based): ${d.heatRiskLabel}`,
    `Urban expansion proxy: ${d.urbanExpansionPct.toFixed(1)} % (heuristic from NDVI trend)`,
  ];
  for (const line of kpis) {
    const w = doc.splitTextToSize(line, 520);
    y = pdfEnsureSpace(doc, y, margin, w.length * 10 + 4);
    doc.text(w, margin, y);
    y += w.length * 10 + 2;
  }
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('NDVI trend (vector polyline)', margin, y);
  y += 10;
  y = pdfEnsureSpace(doc, y, margin, 52);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.35);
  doc.roundedRect(margin, y, 240, 44, 2, 2, 'S');
  drawNdviSparklinePdf(doc, d.sparkNdvi, margin + 6, y + 6, 228, 32);
  y += 52;

  return y;
}

/**
 * AOI-only PDF: narrative, table, high-res chart + optional map snapshot. No timeline grid page.
 */
function buildAoiAnalysisPdfDocument(doc: jsPDF, report: SiAoiReportModel, opts: SiAoiPdfExportOptions) {
  const margin = 48;
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
  y += 14;
  doc.setFontSize(9);
  const analysisWrap = doc.splitTextToSize(report.analysisEn, 520);
  doc.text(analysisWrap, margin, y);
  y += analysisWrap.length * 11 + 6;
  if (report.stressNoteEn) {
    doc.setTextColor(154, 52, 18);
    const st = doc.splitTextToSize(`Stress note: ${report.stressNoteEn}`, 520);
    doc.text(st, margin, y);
    y += st.length * 11 + 8;
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

  if (opts.chartImageDataUrl) {
    try {
      const chartH = 200;
      y = pdfEnsureSpace(doc, y, margin, chartH + 24);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('Index timeline', margin, y);
      y += 12;
      doc.addImage(opts.chartImageDataUrl, 'PNG', margin, y, 520, chartH, undefined, 'SLOW');
      y += chartH + 14;
    } catch {
      /* ignore chart embed */
    }
  }

  if (opts.aoiMapImageDataUrl) {
    try {
      const mapH = 190;
      if (y + mapH > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('AOI map (basemap + classification overlay)', margin, y);
      y += 12;
      doc.addImage(opts.aoiMapImageDataUrl, 'PNG', margin, y, 520, mapH, undefined, 'SLOW');
      y += mapH + 14;
    } catch {
      /* ignore map embed */
    }
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const foot = doc.splitTextToSize(
    'Raster figures embed at 2× resolution where available; vector text and table geometry stay sharp in PDF viewers. For acquisition-true imagery, connect STAC in the main Satellite workspace.',
    520,
  );
  if (y + foot.length * 10 > doc.internal.pageSize.getHeight() - margin) {
    doc.addPage();
    y = margin;
  }
  doc.text(foot, margin, y);
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
  });

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
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  if (options.mode === 'TIME_SERIES_CHANGE_DETECTION') {
    buildTimeSeriesChangeDetectionPdfDocument(doc, report, options);
    doc.save(`aoi-timeseries-change-detection-${stamp}.pdf`);
    return;
  }

  buildAoiAnalysisPdfDocument(doc, report, options);
  doc.save(`aoi-analysis-report-${stamp}.pdf`);
}
