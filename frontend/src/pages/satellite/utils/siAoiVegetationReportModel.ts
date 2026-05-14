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
  labelAr: string;
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
  summaryLinesAr: string[];
  analysisAr: string;
  tableRows: SiAoiReportTableRow[];
  stressNoteAr: string | null;
  timeSeries: SiAoiReportTimePoint[];
  mapZonesGeoJson: GeoJSON.FeatureCollection;
  aoiOutlineGeoJson: GeoJSON.FeatureCollection;
};

/** Bounding box [west, south, east, north] in WGS84 for map fit / zone stripes. */
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
  let [minX, minY] = points[0];
  let [maxX, maxY] = points[0];
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
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

function buildZoneStripesInBounds(
  bounds: [number, number, number, number],
  pHigh: number,
  pMed: number,
  pLow: number,
): GeoJSON.FeatureCollection {
  const [w, s, e, n] = bounds;
  const dy = n - s;
  let y0 = s;
  const zones: GeoJSON.Feature[] = [];
  const push = (zone: SiAoiReportHealthKey, pct: number, fill: string) => {
    const h = (dy * pct) / 100;
    const y1 = y0 + h;
    const poly: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [w, y0],
          [e, y0],
          [e, y1],
          [w, y1],
          [w, y0],
        ],
      ],
    };
    zones.push({
      type: 'Feature',
      properties: { zone, health: zone, fill, pct: Number(pct.toFixed(1)) },
      geometry: poly,
    });
    y0 = y1;
  };
  const sum = pHigh + pMed + pLow || 1;
  const h = (100 * pHigh) / sum;
  const m = (100 * pMed) / sum;
  const l = (100 * pLow) / sum;
  push('low', l, '#991b1b');
  push('medium', m, '#ca8a04');
  push('high', h, '#15803d');
  return { type: 'FeatureCollection', features: zones };
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
  const s = high + med + low;
  return {
    high: (100 * high) / s,
    med: (100 * med) / s,
    low: (100 * low) / s,
  };
}

function detectStressAr(indexId: StaticAoiChartLayerId, series: SiAoiReportTimePoint[]): string | null {
  const vals = series.map(s => s.value);
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  let maxDrop = 0;
  for (let i = 1; i < vals.length; i++) {
    maxDrop = Math.max(maxDrop, vals[i - 1]! - vals[i]!);
  }
  if (indexId !== 'LST' && (min < 0.12 || maxDrop > 0.18)) {
    return 'يُرصد احتمال إجهاد نباتي أو تراجع حاد في المؤشر خلال الفترة؛ يُنصح بمراجعة مشاهد ميدانية ومقارنة مع مناطق مرجعية.'
  }
  if (indexId === 'LST' && min > 38) {
    return 'ارتفاع محتمل في درجة حرارة الغطاء قد يرتبط بضغط حراري؛ راقب توقيت الري وحالة التربة.'
  }
  return null;
}

/**
 * Builds a client-side AOI vegetation report (sample analytics) aligned with the static chart synthetic engine.
 * Replace with API-backed zonal stats when a backend is available.
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
      labelAr: 'صحة نباتية عالية',
      pct: high,
      areaKm2: (aoiAreaKm2 * high) / 100,
    },
    {
      key: 'medium',
      labelEn: 'Medium vegetation health',
      labelAr: 'صحة نباتية متوسطة',
      pct: med,
      areaKm2: (aoiAreaKm2 * med) / 100,
    },
    {
      key: 'low',
      labelEn: 'Low / degraded',
      labelAr: 'منخفضة / متدهورة',
      pct: low,
      areaKm2: (aoiAreaKm2 * low) / 100,
    },
  ];

  const bounds = siAoiReportFeatureBBoxLngLat(aoiFeature);
  const mapZonesGeoJson = bounds
    ? buildZoneStripesInBounds(bounds, high, med, low)
    : { type: 'FeatureCollection' as const, features: [] };

  const aoiOutlineGeoJson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [aoiFeature as GeoJSON.Feature],
  };

  const stressNoteAr = detectStressAr(indexId, timeSeries);

  const meanStr = mean.toFixed(3);
  const summaryLinesAr = [
    `تم تحليل منطقة الاهتمام «${aoiName}» باستخدام مؤشر ${opt.label} بين ${dateStart} و${dateEnd}.`,
    `متوسط المؤشر على مستوى الفترة ≈ ${meanStr} (قيم تجريبية مرتبطة بالمخطط الزمني حتى ربط الخادم).`,
    'يُظهر التوزيع الزمني اتجاهاً عاماً لحالة الغطاء النباتي داخل حدود المضلع.',
    'فئات الصحة (عالية / متوسطة / منخفضة) تُقدَّر نسبياً من شكل السلسلة الزمنية ونطاق المؤشر.',
    stressNoteAr
      ? 'تنبيه: رُصدت قيم شاذة أو تغيرات حادة تستدعي تدقيقاً ميدانياً.'
      : 'لم تُسجَّل مؤشرات شاذة قوية ضمن هذه العينة الرقمية.',
  ];

  const analysisAr = `تحليل مؤشر ${opt.label}: ${opt.subtitle}. بناءً على المتوسط ${meanStr} والتباين خلال الأسابيع المعروضة، تُصنَّف مساحة المضلع تقريبياً إلى صحة عالية (${high.toFixed(
    1,
  )}%) ومتوسطة (${med.toFixed(1)}%) ومنخفضة (${low.toFixed(
    1,
  )}%). هذه النتائج مولَّدة على العميل للعرض التجريبي ويجب استبدالها بإحصاءات زونية حقيقية عند الاتصال بالخدمة الخلفية.`;

  return {
    indexId,
    indexLabel: opt.label,
    aoiName,
    dateStart,
    dateEnd,
    aoiAreaKm2,
    summaryLinesAr,
    analysisAr,
    tableRows,
    stressNoteAr,
    timeSeries,
    mapZonesGeoJson,
    aoiOutlineGeoJson,
  };
}

export function exportSiAoiVegetationReportPdf(report: SiAoiReportModel, chartImageDataUrl?: string | null) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  let y = margin;

  doc.setFontSize(16);
  doc.text('AOI vegetation report (sample analytics)', margin, y);
  y += 28;
  doc.setFontSize(10);
  doc.text(`AOI: ${report.aoiName}`, margin, y);
  y += 14;
  doc.text(`Index: ${report.indexLabel}   Period: ${report.dateStart} .. ${report.dateEnd}`, margin, y);
  y += 14;
  doc.text(`AOI area: ${report.aoiAreaKm2.toFixed(3)} km²`, margin, y);
  y += 22;

  doc.setFontSize(11);
  doc.text('Summary (preview — Arabic in web UI)', margin, y);
  y += 16;
  doc.setFontSize(9);
  report.summaryLinesAr.forEach(line => {
    const wrapped = doc.splitTextToSize(line, 520);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 11 + 4;
  });
  y += 8;

  doc.setFontSize(10);
  const analysisEn = doc.splitTextToSize(
    'Scientific note: values are client-side placeholders tied to the AOI static chart engine. Connect a zonal-stats API for operational reporting.',
    520,
  );
  doc.text(analysisEn, margin, y);
  y += analysisEn.length * 11 + 12;

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
  doc.text('Map: classified bands are illustrative within the AOI bounding box.', margin, Math.min(y, 760));

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  doc.save(`aoi-vegetation-report-${stamp}.pdf`);
}
