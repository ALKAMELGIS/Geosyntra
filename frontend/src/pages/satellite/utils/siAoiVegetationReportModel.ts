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
  /** Up to 12 ISO dates for change-detection map grid (evenly sampled from the series). */
  changeDetectionDates: string[];
  tableRows: SiAoiReportTableRow[];
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

/** Semi-transparent square “pixels” clipped to AOI for classification overlay (client-side demo). */
function buildPixelClassificationGrid(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  bounds: [number, number, number, number],
  seed: string,
  pHigh: number,
  pMed: number,
  pLow: number,
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
  const cap = 2800;
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

function classifyHealthPercents(
  indexId: StaticAoiChartLayerId,
  series: SiAoiReportTimePoint[],
): { high: number; med: number; low: number } {
  const vals = series.map(s => s.value).filter(Number.isFinite);
  if (!vals.length) return { high: 34, med: 33, low: 33 };
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const min = Math.min(...vals);
  const spread = Math.max(...vals) - min;
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
}): SiAoiReportModel | null {
  const { weekly, indexId, dateStart, dateEnd, aoiFeature, aoiName } = input;
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

  const bounds = siAoiReportFeatureBBoxLngLat(aoiFeature);
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

  const changeDetectionDates = buildChangeDetectionDates(timeSeries.map(t => t.date), 12);

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
    changeDetectionDates,
    tableRows,
  };
}

function addChangeDetectionPageGrid(doc: jsPDF, dates: string[], margin: number) {
  doc.addPage();
  let y = margin;
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('Time Series Change Detection Map', margin, y);
  y += 22;
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  const note = doc.splitTextToSize(
    'Twelve snapshot slots (3 × 4) for the analysis window. Connect STAC / your imagery pipeline to render true per-date rasters; this PDF lists dates and placeholders only.',
    520,
  );
  doc.text(note, margin, y);
  y += note.length * 11 + 14;

  const cols = 3;
  const rows = 4;
  const gap = 10;
  const usableW = 520;
  const usableH = 620 - y;
  const cellW = (usableW - gap * (cols - 1)) / cols;
  const cellH = (usableH - gap * (rows - 1)) / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const dt = dates[idx] ?? '—';
      const x = margin + c * (cellW + gap);
      const yy = y + r * (cellH + gap);
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.6);
      doc.roundedRect(x, yy, cellW, cellH, 4, 4, 'S');
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(x + 2, yy + 2, cellW - 4, cellH - 4, 3, 3, 'F');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text(dt, x + 8, yy + 18);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      const cap = doc.splitTextToSize('AOI + basemap + scene (integrate imagery service).', cellW - 16);
      doc.text(cap, x + 8, yy + 32);
    }
  }
}

export function exportSiAoiVegetationReportPdf(report: SiAoiReportModel, chartImageDataUrl?: string | null) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  let y = margin;

  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text('AOI Vegetation Intelligence Report', margin, y);
  y += 28;
  doc.setFontSize(10);
  doc.text(`AOI: ${report.aoiName}`, margin, y);
  y += 14;
  doc.text(`Index: ${report.indexLabel}   Period: ${report.dateStart} .. ${report.dateEnd}`, margin, y);
  y += 14;
  doc.text(`AOI area: ${report.aoiAreaKm2.toFixed(3)} km²`, margin, y);
  y += 22;

  doc.setFontSize(11);
  doc.text('Executive summary', margin, y);
  y += 16;
  doc.setFontSize(9);
  report.summaryLinesEn.forEach(line => {
    const wrapped = doc.splitTextToSize(line, 520);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 11 + 4;
  });
  y += 8;

  doc.setFontSize(11);
  doc.text('Scientific analysis', margin, y);
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
    styles: { fontSize: 9 },
    headStyles: { fillColor: [22, 101, 52] },
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  if (chartImageDataUrl) {
    try {
      doc.addImage(chartImageDataUrl, 'PNG', margin, y, 520, 200);
      y += 216;
    } catch {
      /* ignore chart embed */
    }
  }

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    'Map overlay: semi-transparent pixel-style classification grid clipped to the AOI (demo). Basemap in the app should match your active Satellite Intelligence style.',
    margin,
    Math.min(y, 740),
  );

  addChangeDetectionPageGrid(doc, report.changeDetectionDates, margin);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  doc.save(`aoi-vegetation-report-${stamp}.pdf`);
}
