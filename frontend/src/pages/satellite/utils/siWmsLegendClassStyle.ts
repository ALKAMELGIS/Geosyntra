import type { WmsAoiEvalProfile } from '../../../lib/sentinelHubWmsAoiClip';
import type { SiIndexClassAnalytics, SiIndexClassRow } from './siIndexClassAnalytics';

export type SiWmsLegendClassAreaDisplay = {
  areaHa: number | null;
  areaM2: number | null;
};

function normLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, ' ').trim();
}

function labelMatches(label: string, needles: string[]): boolean {
  const n = normLabel(label);
  return needles.some(k => n.includes(k));
}

/** Display swatch color — semantic AgroCloud palette (does not change map tiles). */
export function siWmsLegendSwatchColor(
  profile: WmsAoiEvalProfile,
  classLabel: string | null | undefined,
  fallbackHex: string,
): string {
  if (!classLabel) return fallbackHex;
  const label = classLabel;

  const isWaterLabel =
    profile === 'ndwi' &&
    labelMatches(label, ['water', 'aqua', 'cyan', 'teal', 'glint', 'shallow', 'turbid', 'bright water']) &&
    !labelMatches(label, ['dry', 'bare soil', 'sparse cover', 'low moisture', 'stressed canopy']);

  if (isWaterLabel || (profile !== 'ndvi' && labelMatches(label, ['open water', 'shallow water']))) {
    if (labelMatches(label, ['cyan', 'teal', 'clear', 'shallow'])) return '#06b6d4';
    if (labelMatches(label, ['turbid', 'bright', 'glint', 'white', 'high water'])) return '#38bdf8';
    return '#2563eb';
  }

  if (profile === 'ndvi' || profile === 'gndvi' || profile === 'evi' || profile === 'savi') {
    if (labelMatches(label, ['no vegetation', 'bare'])) return '#9a3412';
    if (labelMatches(label, ['very sparse'])) return '#c2410c';
    if (labelMatches(label, ['sparse', 'stressed'])) return '#ea580c';
    if (labelMatches(label, ['low vigor', 'low biomass'])) return '#eab308';
    if (labelMatches(label, ['moderate-low', 'moderate low'])) return '#facc15';
    if (labelMatches(label, ['moderate']) && !labelMatches(label, ['moderate-low'])) return '#86efac';
    if (labelMatches(label, ['healthy'])) return '#22c55e';
    if (labelMatches(label, ['dense', 'very dense', 'peak', 'maximum'])) return '#15803d';
  }

  if (profile === 'ndmi') {
    if (labelMatches(label, ['dry', 'very dry'])) return '#c2410c';
    if (labelMatches(label, ['moist', 'wet', 'saturated', 'maximum moisture'])) return '#22c55e';
  }

  if (profile === 'lst') {
    if (labelMatches(label, ['cool', 'very cool'])) return '#38bdf8';
    if (labelMatches(label, ['hot', 'very hot', 'extreme', 'maximum heat'])) return '#dc2626';
  }

  return fallbackHex;
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
