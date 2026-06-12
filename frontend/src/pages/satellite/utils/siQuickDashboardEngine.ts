/** Quick Dashboard Pro — field detection, stats, chart suggestions, insights. */

import { computeSiAoiFieldMetrics } from '@/lib/siAoiFields';
import { pickQuickDashboardTheme, type SiQuickDashboardThemeId } from './siQuickDashboardTheme';

export type SiQuickFieldKind = 'number' | 'category' | 'date' | 'text';

export type SiQuickFieldMeta = {
  key: string;
  label: string;
  kind: SiQuickFieldKind;
  fillRate: number;
  suggestedChart?: SiQuickChartKind;
};

export type SiQuickNumericStats = {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  stdDev?: number;
};

export type SiQuickCategoryBucket = {
  label: string;
  count: number;
  pct: number;
};

export type SiQuickChartKind =
  | 'kpi'
  | 'bar'
  | 'stackedBar'
  | 'pie'
  | 'donut'
  | 'line'
  | 'area'
  | 'gauge'
  | 'progress'
  | 'table'
  | 'serial'
  | 'heatmap'
  | 'treemap'
  | 'scatter';

export type SiQuickDashboardWidget = {
  id: string;
  field: string;
  label: string;
  kind: SiQuickChartKind;
  filterField?: string;
  numeric?: SiQuickNumericStats;
  categories?: SiQuickCategoryBucket[];
  topValues?: SiQuickCategoryBucket[];
  series?: { label: string; value: number }[];
  tableRows?: { label: string; value: string }[];
  scatter?: { x: number; y: number; label?: string }[];
  heatmap?: { x: string; y: string; value: number }[];
  treemap?: { label: string; value: number }[];
  outlierCount?: number;
  growthPct?: number;
};

export type SiQuickKpi = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  icon?: string;
  tone?: 'primary' | 'success' | 'info' | 'warn';
};

export type SiQuickDashboardResult = {
  featureCount: number;
  totalAreaHa: number;
  fields: SiQuickFieldMeta[];
  widgets: SiQuickDashboardWidget[];
  kpis: SiQuickKpi[];
  insights: string[];
  themeId: SiQuickDashboardThemeId;
  growthRatePct?: number;
};

const SKIP_KEYS = /^mapbox_|^OBJECTID$|^FID$|^Shape_|^GlobalID$/i;

function isEmptyValue(raw: unknown): boolean {
  if (raw == null || raw === '') return true;
  const s = String(raw).trim();
  return !s || s === '—' || s === 'null' || s === 'undefined';
}

function parseNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw ?? '').trim().replace(/,/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDateMs(raw: unknown): number | null {
  if (typeof raw === 'number' && raw > 1e11) return raw;
  const ms = Date.parse(String(raw ?? ''));
  return Number.isFinite(ms) ? ms : null;
}

export function detectQuickDashboardFieldKind(key: string, samples: unknown[]): SiQuickFieldKind {
  const name = key.toLowerCase();
  if (/date|time|created|modified|timestamp|year|month/.test(name)) return 'date';

  let num = 0;
  let cat = 0;
  let dates = 0;
  for (const v of samples) {
    if (isEmptyValue(v)) continue;
    if (parseDateMs(v) != null && /date|time|year|month/.test(name)) {
      dates++;
      continue;
    }
    if (parseNumber(v) != null) num++;
    else cat++;
  }
  if (dates >= Math.max(2, num)) return 'date';
  if (num >= Math.max(3, cat * 2)) return 'number';
  const unique = new Set(samples.filter(v => !isEmptyValue(v)).map(v => String(v).trim()));
  if (unique.size <= 24 && unique.size > 0) return 'category';
  return 'text';
}

export function extractQuickDashboardFields(features: GeoJSON.Feature[]): SiQuickFieldMeta[] {
  if (!features.length) return [];
  const keys = new Set<string>();
  const sampleCap = Math.min(features.length, 400);
  for (let i = 0; i < sampleCap; i++) {
    const p = features[i]?.properties;
    if (!p || typeof p !== 'object') continue;
    for (const k of Object.keys(p as Record<string, unknown>)) {
      if (k && !SKIP_KEYS.test(k)) keys.add(k);
    }
  }

  const metas: SiQuickFieldMeta[] = [];
  for (const key of [...keys].sort((a, b) => a.localeCompare(b))) {
    const samples: unknown[] = [];
    let filled = 0;
    for (let i = 0; i < features.length && samples.length < 120; i++) {
      const p = features[i]?.properties as Record<string, unknown> | undefined;
      const v = p?.[key];
      if (!isEmptyValue(v)) {
        filled++;
        samples.push(v);
      }
    }
    const fillRate = features.length ? filled / features.length : 0;
    if (fillRate < 0.02) continue;
    const kind = detectQuickDashboardFieldKind(key, samples);
    metas.push({
      key,
      label: key.replace(/_/g, ' '),
      kind,
      fillRate,
      suggestedChart: suggestQuickDashboardChartKind({ key, label: key, kind, fillRate }),
    });
  }
  return metas;
}

function computeNumericStats(values: number[]): SiQuickNumericStats | null {
  if (!values.length) return null;
  let sum = 0;
  let min = values[0]!;
  let max = values[0]!;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const avg = sum / values.length;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  return { count: values.length, sum, avg, min, max, stdDev: Math.sqrt(variance) };
}

function bucketCategories(values: string[], limit = 8): SiQuickCategoryBucket[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const total = values.length || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({
      label,
      count,
      pct: (count / total) * 100,
    }));
}

export function suggestQuickDashboardChartKind(field: Pick<SiQuickFieldMeta, 'kind' | 'key'>): SiQuickChartKind {
  if (field.kind === 'number') {
    if (/area|hectare|ha|sqm|acre/i.test(field.key)) return 'gauge';
    return 'bar';
  }
  if (field.kind === 'date') return 'area';
  if (field.kind === 'category') return 'donut';
  return 'table';
}

function formatNum(n: number): string {
  if (Math.abs(n) >= 1e6) return n.toExponential(2);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatAreaHa(ha: number): string {
  if (ha >= 1000) return `${formatNum(ha)} ha`;
  if (ha >= 1) return `${ha.toFixed(2)} ha`;
  return `${(ha * 10000).toFixed(0)} m²`;
}

export function computeFeaturesTotalAreaHa(features: GeoJSON.Feature[]): number {
  let total = 0;
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      total += computeSiAoiFieldMetrics(g).areaHa;
    }
  }
  return total;
}

function countOutliers(values: number[], stats: SiQuickNumericStats): number {
  if (!stats.stdDev || stats.stdDev === 0) return 0;
  const hi = stats.avg + stats.stdDev * 2;
  const lo = stats.avg - stats.stdDev * 2;
  return values.filter(v => v > hi || v < lo).length;
}

function computeGrowthRatePct(series: { label: string; value: number }[]): number | undefined {
  if (series.length < 2) return undefined;
  const first = series[0]!.value;
  const last = series[series.length - 1]!.value;
  if (first === 0) return last > 0 ? 100 : 0;
  return ((last - first) / Math.abs(first)) * 100;
}

function buildInsights(
  features: GeoJSON.Feature[],
  fields: SiQuickFieldMeta[],
  widgets: SiQuickDashboardWidget[],
  totalAreaHa: number,
): string[] {
  const insights: string[] = [];
  insights.push(`${features.length.toLocaleString()} features in current map scope.`);
  if (totalAreaHa > 0) insights.push(`Total mapped area ≈ ${formatAreaHa(totalAreaHa)}.`);

  const topCat = widgets.find(w => w.categories?.length);
  if (topCat?.categories?.[0]) {
    const b = topCat.categories[0];
    insights.push(`Dominant ${topCat.label}: "${b.label}" (${b.pct.toFixed(0)}%).`);
  }

  const numWidget = widgets.find(w => w.numeric && w.outlierCount);
  if (numWidget?.numeric && numWidget.outlierCount) {
    insights.push(`${numWidget.outlierCount} potential outliers in ${numWidget.label}.`);
  }

  const trend = widgets.find(w => w.growthPct != null && w.kind === 'area');
  if (trend?.growthPct != null) {
    const dir = trend.growthPct >= 0 ? 'up' : 'down';
    insights.push(`Temporal trend ${dir} ${Math.abs(trend.growthPct).toFixed(1)}% over range.`);
  }

  const sparse = fields.filter(f => f.fillRate < 0.35);
  if (sparse.length) insights.push(`${sparse.length} field(s) have low fill rate (<35%).`);

  return insights.slice(0, 5);
}

function buildScatterWidget(
  features: GeoJSON.Feature[],
  xField: SiQuickFieldMeta,
  yField: SiQuickFieldMeta,
): SiQuickDashboardWidget | null {
  const pts: { x: number; y: number; label?: string }[] = [];
  for (const f of features) {
    const p = f.properties as Record<string, unknown> | undefined;
    const x = parseNumber(p?.[xField.key]);
    const y = parseNumber(p?.[yField.key]);
    if (x != null && y != null) pts.push({ x, y });
  }
  if (pts.length < 3) return null;
  return {
    id: `scatter-${xField.key}-${yField.key}`,
    field: xField.key,
    filterField: yField.key,
    label: `${xField.label} × ${yField.label}`,
    kind: 'scatter',
    scatter: pts.slice(0, 120),
  };
}

function buildHeatmapWidget(
  features: GeoJSON.Feature[],
  catA: SiQuickFieldMeta,
  catB: SiQuickFieldMeta,
): SiQuickDashboardWidget | null {
  const grid = new Map<string, number>();
  for (const f of features) {
    const p = f.properties as Record<string, unknown> | undefined;
    const a = p?.[catA.key];
    const b = p?.[catB.key];
    if (isEmptyValue(a) || isEmptyValue(b)) continue;
    const k = `${String(a).trim()}|||${String(b).trim()}`;
    grid.set(k, (grid.get(k) ?? 0) + 1);
  }
  if (grid.size < 4) return null;
  const heatmap = [...grid.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 36)
    .map(([k, value]) => {
      const [x, y] = k.split('|||');
      return { x: x!, y: y!, value };
    });
  return {
    id: `heat-${catA.key}-${catB.key}`,
    field: catA.key,
    filterField: catB.key,
    label: `${catA.label} × ${catB.label}`,
    kind: 'heatmap',
    heatmap,
  };
}

export function buildQuickDashboard(
  features: GeoJSON.Feature[],
  selectedFieldKeys: string[],
): SiQuickDashboardResult {
  const fields = extractQuickDashboardFields(features);
  const picked =
    selectedFieldKeys.length > 0
      ? fields.filter(f => selectedFieldKeys.includes(f.key))
      : fields.filter(f => f.kind === 'number' || f.kind === 'category' || f.kind === 'date').slice(0, 8);

  const widgets: SiQuickDashboardWidget[] = [];
  const numericFields = fields.filter(f => f.kind === 'number');
  const categoryFields = fields.filter(f => f.kind === 'category');

  for (const field of picked) {
    const chartKind = field.suggestedChart ?? suggestQuickDashboardChartKind(field);
    const values: unknown[] = [];
    for (const f of features) {
      const p = f.properties as Record<string, unknown> | undefined;
      const v = p?.[field.key];
      if (!isEmptyValue(v)) values.push(v);
    }

    if (field.kind === 'number') {
      const nums = values.map(parseNumber).filter((n): n is number => n != null);
      const stats = computeNumericStats(nums);
      if (!stats) continue;
      const uniqueCount = new Set(nums.map(n => formatNum(n))).size;
      const kind: SiQuickChartKind =
        chartKind === 'gauge' || uniqueCount <= 8 ? (uniqueCount <= 6 ? 'donut' : 'bar') : 'bar';
      widgets.push({
        id: `num-${field.key}`,
        field: field.key,
        label: field.label,
        kind,
        numeric: stats,
        outlierCount: countOutliers(nums, stats),
        series: bucketCategories(nums.map(n => formatNum(n)), 12).map(b => ({
          label: b.label,
          value: b.count,
        })),
      });
      continue;
    }

    if (field.kind === 'date') {
      const ms = values.map(parseDateMs).filter((n): n is number => n != null).sort((a, b) => a - b);
      if (ms.length < 2) continue;
      const byMonth = new Map<string, number>();
      for (const t of ms) {
        const d = new Date(t);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        byMonth.set(k, (byMonth.get(k) ?? 0) + 1);
      }
      const series = [...byMonth.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, value]) => ({ label, value }));
      widgets.push({
        id: `date-${field.key}`,
        field: field.key,
        label: field.label,
        kind: 'area',
        series,
        growthPct: computeGrowthRatePct(series),
      });
      continue;
    }

    if (field.kind === 'category') {
      const cats = values.map(v => String(v).trim());
      const buckets = bucketCategories(cats, 10);
      const kind: SiQuickChartKind = buckets.length <= 6 ? 'donut' : 'bar';
      widgets.push({
        id: `cat-${field.key}`,
        field: field.key,
        label: field.label,
        kind,
        categories: buckets,
        topValues: buckets.slice(0, 5),
        treemap: buckets.map(b => ({ label: b.label, value: b.count })),
      });
      continue;
    }

    widgets.push({
      id: `txt-${field.key}`,
      field: field.key,
      label: field.label,
      kind: 'table',
      tableRows: bucketCategories(values.map(v => String(v).trim()), 8).map(b => ({
        label: b.label,
        value: String(b.count),
      })),
    });
  }

  if (numericFields.length >= 2 && picked.length >= 2) {
    const scatter = buildScatterWidget(features, numericFields[0]!, numericFields[1]!);
    if (scatter && !widgets.some(w => w.id === scatter.id)) widgets.push(scatter);
  }
  if (categoryFields.length >= 2) {
    const heat = buildHeatmapWidget(features, categoryFields[0]!, categoryFields[1]!);
    if (heat && !widgets.some(w => w.id === heat.id)) widgets.push(heat);
  }

  const totalAreaHa = computeFeaturesTotalAreaHa(features);
  const theme = pickQuickDashboardTheme(fields, totalAreaHa > 0);

  const primaryNumeric = numericFields[0];
  let primaryStats: SiQuickNumericStats | null = null;
  if (primaryNumeric) {
    const vals: number[] = [];
    for (const f of features) {
      const n = parseNumber((f.properties as Record<string, unknown>)?.[primaryNumeric.key]);
      if (n != null) vals.push(n);
    }
    primaryStats = computeNumericStats(vals);
  }

  const kpis: SiQuickKpi[] = [
    {
      id: 'count',
      label: 'Records',
      value: String(features.length),
      icon: 'fa-layer-group',
      tone: 'primary',
    },
  ];

  if (totalAreaHa > 0) {
    kpis.push({
      id: 'area',
      label: 'Total area',
      value: formatAreaHa(totalAreaHa),
      icon: 'fa-vector-square',
      tone: 'success',
    });
  }

  if (primaryStats) {
    kpis.push(
      {
        id: 'sum',
        label: `Sum ${primaryNumeric!.label}`,
        value: formatNum(primaryStats.sum),
        icon: 'fa-sigma',
        tone: 'info',
      },
      {
        id: 'avg',
        label: 'Average',
        value: formatNum(primaryStats.avg),
        icon: 'fa-chart-line',
        tone: 'info',
      },
      {
        id: 'min',
        label: 'Minimum',
        value: formatNum(primaryStats.min),
        icon: 'fa-arrow-down',
      },
      {
        id: 'max',
        label: 'Maximum',
        value: formatNum(primaryStats.max),
        icon: 'fa-arrow-up',
      },
    );
    if (primaryStats.max > primaryStats.min) {
      const spanPct = ((primaryStats.avg - primaryStats.min) / (primaryStats.max - primaryStats.min)) * 100;
      kpis.push({
        id: 'pct-range',
        label: 'Avg position',
        value: `${spanPct.toFixed(0)}%`,
        hint: 'Within min–max range',
        icon: 'fa-percent',
      });
    }
  }

  if (categoryFields.length) {
    const topField = categoryFields[0]!;
    const vals: string[] = [];
    for (const f of features) {
      const v = (f.properties as Record<string, unknown>)?.[topField.key];
      if (!isEmptyValue(v)) vals.push(String(v).trim());
    }
    const buckets = bucketCategories(vals, 1);
    if (buckets[0]) {
      kpis.push({
        id: 'top-cat',
        label: `Top ${topField.label}`,
        value: `${buckets[0].pct.toFixed(0)}%`,
        hint: buckets[0].label,
        icon: 'fa-chart-pie',
        tone: 'warn',
      });
    }
  }

  const dateWidget = widgets.find(w => w.growthPct != null);
  const growthRatePct = dateWidget?.growthPct;

  if (growthRatePct != null) {
    kpis.push({
      id: 'growth',
      label: 'Growth rate',
      value: `${growthRatePct >= 0 ? '+' : ''}${growthRatePct.toFixed(1)}%`,
      icon: 'fa-arrow-trend-up',
      tone: growthRatePct >= 0 ? 'success' : 'warn',
    });
  }

  const insights = buildInsights(features, fields, widgets, totalAreaHa);

  return {
    featureCount: features.length,
    totalAreaHa,
    fields,
    widgets,
    kpis,
    insights,
    themeId: theme.id,
    growthRatePct,
  };
}

export function exportQuickDashboardCsv(result: SiQuickDashboardResult): string {
  const lines = ['Section,Label,Value'];
  for (const k of result.kpis) {
    lines.push(`KPI,${k.label.replace(/,/g, ' ')},${k.value.replace(/,/g, ' ')}`);
  }
  for (const w of result.widgets) {
    if (w.categories) {
      for (const c of w.categories) {
        lines.push(`${w.label},${c.label},${c.count}`);
      }
    } else if (w.series) {
      for (const s of w.series) {
        lines.push(`${w.label},${s.label},${s.value}`);
      }
    } else if (w.numeric) {
      lines.push(`${w.label},Sum,${w.numeric.sum}`);
      lines.push(`${w.label},Avg,${w.numeric.avg}`);
      lines.push(`${w.label},Min,${w.numeric.min}`);
      lines.push(`${w.label},Max,${w.numeric.max}`);
    }
  }
  return lines.join('\n');
}
