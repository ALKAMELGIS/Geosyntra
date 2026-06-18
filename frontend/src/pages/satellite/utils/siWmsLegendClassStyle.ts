import type { SiIndexClassAnalytics, SiIndexClassRow } from './siIndexClassAnalytics';

export type SiWmsLegendClassAreaDisplay = {
  areaHa: number | null;
  areaM2: number | null;
};

function normLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function formatLegendAreaHa(ha: number | null | undefined): string {
  if (ha == null || !Number.isFinite(ha)) return '—';
  if (ha >= 100) return ha.toFixed(1);
  if (ha >= 10) return ha.toFixed(2);
  return ha.toFixed(3);
}

export function formatLegendAreaM2(m2: number | null | undefined): string {
  if (m2 == null || !Number.isFinite(m2)) return '—';
  return Math.round(m2).toLocaleString('en-US');
}

function classMidpoint(row: SiIndexClassRow): number {
  if (row.meanIndex != null && Number.isFinite(row.meanIndex)) return row.meanIndex;
  return (row.min + row.max) / 2;
}

function rowMid(from: number, to: number): number {
  return (from + to) / 2;
}

function findAnalyticsClassForLegendRow(
  from: number,
  to: number,
  label: string | null,
  classes: SiIndexClassRow[],
): SiIndexClassRow | null {
  if (label) {
    const n = normLabel(label);
    const byLabel = classes.find(c => normLabel(c.condition) === n || normLabel(c.condition).includes(n));
    if (byLabel) return byLabel;
  }
  const mid = rowMid(from, to);
  let best: SiIndexClassRow | null = null;
  let bestDist = Infinity;
  for (const c of classes) {
    if (mid >= c.min && mid <= c.max) return c;
    const d = Math.abs(classMidpoint(c) - mid);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/** Map legend row index → AOI class areas from raster analytics (when available). */
export function siWmsLegendAreasForRows(
  rows: ReadonlyArray<{ from: number; to: number }>,
  classLabels: readonly string[] | null,
  analytics: SiIndexClassAnalytics | null | undefined,
): SiWmsLegendClassAreaDisplay[] {
  if (!analytics?.classes?.length) {
    return rows.map(() => ({ areaHa: null, areaM2: null }));
  }
  const classes = analytics.classes;
  return rows.map((row, i) => {
    const label = classLabels?.[i] ?? null;
    const match = findAnalyticsClassForLegendRow(row.from, row.to, label, classes);
    if (!match) return { areaHa: null, areaM2: null };
    return {
      areaHa: Number.isFinite(match.areaHa) ? match.areaHa : null,
      areaM2: Number.isFinite(match.areaM2) ? match.areaM2 : null,
    };
  });
}
