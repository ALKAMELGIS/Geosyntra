/**
 * GeoAI Index Analytical Report — multi-sheet XLSX export for AOI static charts.
 *
 * Pixel grids use the same synthetic per-cell engine as {@link staticAoiLayerMeanForWeek}
 * (see staticAoiMultiChartData.ts). Swap the value sampler for a Processing-API / FIS
 * backend when production-accurate raster extractions are required.
 */
import * as XLSX from 'xlsx';
import { pointInPolygonGeometry } from '../drawingUtils';
import { staticAoiLayerMeanForWeek, type StaticAoiChartLayerId } from './staticAoiMultiChartData';

export type SiGeoAiWeeklyLite = {
  weekIndex: number;
  startDate: string;
  endDate: string;
  mean: number;
};

export type SiGeoAiChartDatasetLite = {
  id: string;
  label: string;
  data: number[];
  yAxisID?: string;
};

export type SiGeoAiIndexAnalyticalExportContext = {
  aoiKey: string | null;
  weekly: SiGeoAiWeeklyLite[];
  selectedDateIso: string;
  /** GeoJSON Feature with Polygon or MultiPolygon geometry */
  drawnFeature: GeoJSON.Feature | null;
};

export type LegendClass = { id: number; min: number; max: number; label: string };

const R_EARTH_M = 6371000;

function walkCoordsLngLat2D(coords: any, points: [number, number][]) {
  if (!coords) return;
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    points.push([coords[0] as number, coords[1] as number]);
    return;
  }
  if (Array.isArray(coords)) {
    coords.forEach((c: any) => walkCoordsLngLat2D(c, points));
  }
}

function getFeatureLngLatBounds(feature: GeoJSON.Feature | null): [number, number, number, number] | null {
  if (!feature) return null;
  const points: [number, number][] = [];
  const g = feature.geometry;
  if (g && (g.type === 'Polygon' || g.type === 'MultiPolygon')) {
    walkCoordsLngLat2D(g.coordinates, points);
  }
  if (points.length === 0) return null;
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

/** Planar polygon area (m²) in local equirectangular frame at polygon centroid — adequate for small AOIs. */
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

function featureAoiAreaSqMeters(feature: GeoJSON.Feature): number {
  const g = feature.geometry;
  if (!g) return 0;
  if (g.type === 'Polygon') {
    const outer = g.coordinates[0];
    return outer ? ringAreaSqMeters(outer) : 0;
  }
  if (g.type === 'MultiPolygon') {
    let t = 0;
    for (const poly of g.coordinates) {
      const outer = poly?.[0];
      if (outer) t += ringAreaSqMeters(outer);
    }
    return t;
  }
  return 0;
}

function normalizeIndexId(id: string): string {
  return String(id || '')
    .trim()
    .toUpperCase();
}

/** NDVI — 10 classes per product spec (half-open except last interval inclusive max). */
const NDVI_LEGEND: LegendClass[] = [
  { id: 1, min: -1, max: -0.75, label: 'Water' },
  { id: 2, min: -0.75, max: -0.5, label: 'Deep Water / Shadows' },
  { id: 3, min: -0.5, max: -0.25, label: 'Bare Soil / Built-up (Low Reflectance)' },
  { id: 4, min: -0.25, max: 0, label: 'Urban / Bare Ground' },
  { id: 5, min: 0, max: 0.1, label: 'Very Low Vegetation' },
  { id: 6, min: 0.1, max: 0.25, label: 'Sparse Vegetation' },
  { id: 7, min: 0.25, max: 0.4, label: 'Low Vegetation' },
  { id: 8, min: 0.4, max: 0.6, label: 'Moderate Vegetation' },
  { id: 9, min: 0.6, max: 0.75, label: 'Dense Vegetation' },
  { id: 10, min: 0.75, max: 1, label: 'Very Dense / Healthy Vegetation' },
];

/** NDWI — water-oriented 10 bins on −1…1 (dynamic legend companion to NDVI). */
const NDWI_LEGEND: LegendClass[] = [
  { id: 1, min: -1, max: -0.75, label: 'Very dry / sealed surface' },
  { id: 2, min: -0.75, max: -0.5, label: 'Dry soil / sparse canopy' },
  { id: 3, min: -0.5, max: -0.25, label: 'Moisture-stressed vegetation' },
  { id: 4, min: -0.25, max: 0, label: 'Transition / mixed pixel' },
  { id: 5, min: 0, max: 0.1, label: 'Low canopy water signal' },
  { id: 6, min: 0.1, max: 0.25, label: 'Moderate wetness (canopy / soil)' },
  { id: 7, min: 0.25, max: 0.4, label: 'Elevated moisture' },
  { id: 8, min: 0.4, max: 0.6, label: 'High moisture / turbid water' },
  { id: 9, min: 0.6, max: 0.75, label: 'Open water (moderate)' },
  { id: 10, min: 0.75, max: 1, label: 'Open water (strong)' },
];

/** Built-up / urban index style bins (used for NDBI and as a proxy for built-up reads on NDMI). */
const BUILT_LEGEND: LegendClass[] = [
  { id: 1, min: -1, max: -0.75, label: 'Deep shadow / water' },
  { id: 2, min: -0.75, max: -0.5, label: 'Vegetation dominant' },
  { id: 3, min: -0.5, max: -0.25, label: 'Soil / sparse vegetation' },
  { id: 4, min: -0.25, max: 0, label: 'Mixed rural' },
  { id: 5, min: 0, max: 0.1, label: 'Low built-up' },
  { id: 6, min: 0.1, max: 0.25, label: 'Sparse urban fabric' },
  { id: 7, min: 0.25, max: 0.4, label: 'Suburban / roads' },
  { id: 8, min: 0.4, max: 0.6, label: 'Dense urban' },
  { id: 9, min: 0.6, max: 0.75, label: 'Commercial / industrial' },
  { id: 10, min: 0.75, max: 1, label: 'Bright urban / bare built' },
];

function equalIntervalLegend(min: number, max: number, prefix: string): LegendClass[] {
  const n = 10;
  const span = max - min || 1;
  const step = span / n;
  const out: LegendClass[] = [];
  for (let i = 0; i < n; i++) {
    const a = min + i * step;
    const b = i === n - 1 ? max : min + (i + 1) * step;
    out.push({ id: i + 1, min: a, max: b, label: `${prefix} ${i + 1} (${a.toFixed(3)}–${b.toFixed(3)})` });
  }
  return out;
}

export function legendClassesForIndex(indexId: string): LegendClass[] {
  const id = normalizeIndexId(indexId);
  if (id === 'NDVI') return NDVI_LEGEND;
  if (id === 'NDWI') return NDWI_LEGEND;
  if (id === 'NDBI' || id === 'NDMI') return BUILT_LEGEND;
  if (id === 'EVI' || id === 'SAVI') return equalIntervalLegend(-1, 1, id);
  if (id === 'NDSI') return equalIntervalLegend(-1, 1, 'NDSI class');
  if (id === 'LST') return equalIntervalLegend(15, 45, 'LST °C bin');
  return equalIntervalLegend(-1, 1, `${id} class`);
}

export function classifyValue(value: number, classes: LegendClass[]): { id: number; name: string } {
  if (!Number.isFinite(value)) return { id: 0, name: 'NoData' };
  const sorted = [...classes].sort((a, b) => a.min - b.min);
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i]!;
    const last = i === sorted.length - 1;
    if (value >= c.min && (last ? value <= c.max : value < c.max)) return { id: c.id, name: c.label };
  }
  const lastC = sorted[sorted.length - 1]!;
  if (value >= lastC.max) return { id: lastC.id, name: lastC.label };
  const firstC = sorted[0]!;
  if (value < firstC.min) return { id: firstC.id, name: firstC.label };
  return { id: 0, name: 'Unclassified' };
}

function stdDevPop(xs: number[]): number {
  const vals = xs.filter(Number.isFinite);
  if (vals.length < 2) return NaN;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v = vals.reduce((s, x) => s + (x - m) ** 2, 0) / vals.length;
  return Math.sqrt(v);
}

function resolveWeekIndex(weekly: SiGeoAiWeeklyLite[], selectedIso: string): number {
  if (!weekly.length) return 0;
  const iso = selectedIso.slice(0, 10);
  let ix = weekly.findIndex(w => iso >= w.startDate.slice(0, 10) && iso <= w.endDate.slice(0, 10));
  if (ix < 0) ix = weekly.length - 1;
  return ix;
}

const MAX_GRID_CELLS = 9000;

function buildInteriorGrid(feature: GeoJSON.Feature, maxCells: number): { lng: number; lat: number }[] {
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
  const pts: { lng: number; lat: number }[] = [];
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

function pickPrimaryDatasetId(datasets: SiGeoAiChartDatasetLite[]): string {
  const firstOptical = datasets.find(d => d.yAxisID !== 'yLST' && normalizeIndexId(d.id) !== 'LST');
  return (firstOptical ?? datasets[0])?.id ?? 'NDVI';
}

export function buildGeoAiIndexAnalyticalWorkbook(opts: {
  chartTitle: string;
  labels: string[];
  datasets: SiGeoAiChartDatasetLite[];
  exportLngLatPerRow?: { lng: number; lat: number }[] | undefined;
  analytics: SiGeoAiIndexAnalyticalExportContext | null | undefined;
}): XLSX.WorkBook {
  const { chartTitle, labels, datasets, exportLngLatPerRow, analytics } = opts;
  const wb = XLSX.utils.book_new();

  const chartHeader = ['Date', 'Longitude', 'Latitude', ...datasets.map(ds => ds.label)];
  const chartRows: (string | number)[][] = [chartHeader];
  for (let i = 0; i < labels.length; i++) {
    const row: (string | number)[] = [labels[i] ?? ''];
    const pt = exportLngLatPerRow?.[i];
    row.push(pt != null && Number.isFinite(pt.lng) ? Number(pt.lng).toFixed(6) : '');
    row.push(pt != null && Number.isFinite(pt.lat) ? Number(pt.lat).toFixed(6) : '');
    for (const ds of datasets) {
      const v = ds.data[i];
      row.push(Number.isFinite(v) ? Number(v).toFixed(4) : '');
    }
    chartRows.push(row);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(chartRows), 'Chart_Data');

  const weekly = analytics?.weekly ?? [];
  const drawn = analytics?.drawnFeature;
  const aoiKey = analytics?.aoiKey ?? null;
  const weekIdx = resolveWeekIndex(weekly, analytics?.selectedDateIso ?? '');
  const nWeeks = Math.max(1, weekly.length);
  const anchor = weekly[weekIdx]?.mean ?? 0.45;

  if (!drawn?.geometry || weekly.length === 0) {
    const note = [
      ['Note'],
      [
        'Draw a closed polygon or multi-polygon AOI and ensure the weekly timeline is loaded to populate Data_Raw, Data_Classified, Summary_AOI, and Class_Statistics.',
      ],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(note), 'Data_Raw');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['See Data_Raw note']]), 'Data_Classified');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['See Data_Raw note']]), 'Summary_AOI');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['See Data_Raw note']]), 'Class_Statistics');
    return wb;
  }

  const grid = buildInteriorGrid(drawn, MAX_GRID_CELLS);
  const opticalDatasets = datasets.filter(d => d.yAxisID !== 'yLST' && normalizeIndexId(d.id) !== 'LST');
  const lstDataset = datasets.find(d => d.yAxisID === 'yLST' || normalizeIndexId(d.id) === 'LST');
  const valueDatasets = lstDataset ? [...opticalDatasets, lstDataset] : opticalDatasets;
  const primaryId = pickPrimaryDatasetId(datasets);
  const primaryLegend = legendClassesForIndex(primaryId);

  const rawHeader = ['Pixel ID', 'Latitude', 'Longitude', ...valueDatasets.map(d => d.label)];
  const rawRows: (string | number)[][] = [rawHeader];
  const classifiedHeader = ['Pixel ID', 'Latitude', 'Longitude', 'Index Value', 'Class ID', 'Class Name'];
  const classifiedRows: (string | number)[][] = [classifiedHeader];

  let pid = 1;
  const primaryValues: number[] = [];
  const perIndexCols: Record<string, number[]> = {};
  for (const d of valueDatasets) perIndexCols[d.id] = [];

  for (const p of grid) {
    const ck = cellKeyForPixel(aoiKey, p.lng, p.lat);
    const row: (string | number)[] = [pid, Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))];
    for (const d of valueDatasets) {
      const v = staticAoiLayerMeanForWeek(d.id as StaticAoiChartLayerId, weekIdx, nWeeks, ck, anchor);
      row.push(v);
      perIndexCols[d.id]!.push(v);
    }
    rawRows.push(row);

    const pv = staticAoiLayerMeanForWeek(primaryId as StaticAoiChartLayerId, weekIdx, nWeeks, ck, anchor);
    primaryValues.push(pv);
    const cls = classifyValue(pv, primaryLegend);
    classifiedRows.push([pid, Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)), pv, cls.id, cls.name]);
    pid++;
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rawRows), 'Data_Raw');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(classifiedRows), 'Data_Classified');

  const aoiAreaM2 = featureAoiAreaSqMeters(drawn);
  const approxM2PerPixel = grid.length > 0 ? aoiAreaM2 / grid.length : 0;
  const wk = weekly[weekIdx];

  const summaryLines: (string | number)[][] = [
    ['GeoAI Index Analytical Report — AOI summary'],
    [],
    ['Report title', chartTitle],
    ['Primary index (classification)', primaryId],
    ['Week window', wk ? `${wk.startDate} → ${wk.endDate}` : ''],
    ['AOI area (approx, m²)', Number.isFinite(aoiAreaM2) ? Math.round(aoiAreaM2) : ''],
    ['Approx. mean pixel footprint (m²)', approxM2PerPixel > 0 ? approxM2PerPixel.toFixed(2) : ''],
    ['Sampled interior pixels', grid.length],
    ['Note', 'Pixel values use the same deterministic demo engine as the on-map AOI chart; connect Sentinel Hub statistics for production.'],
    [],
  ];

  for (const d of valueDatasets) {
    const xs = perIndexCols[d.id] ?? [];
    const finite = xs.filter(Number.isFinite);
    if (!finite.length) continue;
    const mn = Math.min(...finite);
    const mx = Math.max(...finite);
    const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
    const sd = stdDevPop(finite);
    summaryLines.push([`Index ${d.label}`, 'min', mn]);
    summaryLines.push(['', 'max', mx]);
    summaryLines.push(['', 'mean', Number(mean.toFixed(4))]);
    summaryLines.push(['', 'std_dev', Number.isFinite(sd) ? Number(sd.toFixed(4)) : '']);
    summaryLines.push([]);
  }

  summaryLines.push(['Class distribution (primary index)', 'Class ID', 'Class name', 'Pixel count', 'Area m² (approx)']);
  const counts = new Map<number, { name: string; n: number }>();
  for (const c of primaryLegend) counts.set(c.id, { name: c.label, n: 0 });
  for (const v of primaryValues) {
    const { id } = classifyValue(v, primaryLegend);
    const cur = counts.get(id);
    if (cur) cur.n++;
    else counts.set(id, { name: 'Other', n: 1 });
  }
  for (const [cid, { name, n }] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    summaryLines.push(['', cid, name, n, approxM2PerPixel > 0 ? Math.round(n * approxM2PerPixel) : '']);
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryLines), 'Summary_AOI');

  const classStatsHeader = ['Class ID', 'Class name', 'Pixel count', 'Pct of AOI pixels', 'Mean index in class'];
  const classStats: (string | number)[][] = [classStatsHeader];
  const total = Math.max(1, primaryValues.length);
  for (const c of primaryLegend) {
    const vals = primaryValues.filter((v, i) => {
      void i;
      return classifyValue(v, primaryLegend).id === c.id;
    });
    const n = vals.length;
    const pct = (100 * n) / total;
    const mnc = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
    classStats.push([c.id, c.label, n, `${pct.toFixed(2)}%`, Number.isFinite(mnc) ? Number(mnc.toFixed(4)) : '']);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(classStats), 'Class_Statistics');

  return wb;
}

export function downloadGeoAiIndexAnalyticalReportXlsx(opts: Parameters<typeof buildGeoAiIndexAnalyticalWorkbook>[0]) {
  const wb = buildGeoAiIndexAnalyticalWorkbook(opts);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  XLSX.writeFile(wb, `GeoAI Index Analytical Report ${stamp}.xlsx`);
}
