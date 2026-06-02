/** Fixed decimal formatting for statistical charts (axes, R², tooltips, OLS legend). */
import type { Plugin } from 'chart.js';

export function formatStatDecimal(value: number, fractionDigits = 2): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(fractionDigits);
}

export function chartStatTickLabel(value: string | number, fractionDigits = 2): string {
  const n = typeof value === 'number' ? value : Number(value);
  return formatStatDecimal(n, fractionDigits);
}

export function formatScatterR2(r2: number): string {
  return formatStatDecimal(r2, 2);
}

/** OLS legend line: `NDVI = 0.01 × SAR + 0.29 · R² = 0.01` (image-2 style, no scientific notation). */
export function formatOlsRegressionLegend(opts: {
  yLabel: string;
  xLabel: string;
  slope: number;
  intercept: number;
  r2: number;
}): string {
  const { yLabel, xLabel, slope, intercept, r2 } = opts;
  const r2Part = Number.isFinite(r2) ? ` · R² = ${formatScatterR2(r2)}` : '';
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) {
    return r2Part ? `OLS${r2Part}` : 'OLS';
  }
  const sign = intercept >= 0 ? '+' : '−';
  const b = formatStatDecimal(Math.abs(intercept));
  return `${yLabel} = ${formatStatDecimal(slope)} × ${xLabel} ${sign} ${b}${r2Part}`;
}

/** Upper-right chart annotation (reference scatter style): equation + R² on separate lines. */
export function formatOlsAnnotationLines(opts: {
  yLabel: string;
  xLabel: string;
  slope: number;
  intercept: number;
  r2: number;
}): [string, string] {
  const { yLabel, xLabel, slope, intercept, r2 } = opts;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) {
    return ['OLS fit', `R² = ${formatScatterR2(r2)}`];
  }
  const sign = intercept >= 0 ? '+' : '−';
  const b = formatStatDecimal(Math.abs(intercept));
  return [
    `${yLabel} = ${formatStatDecimal(slope)} × ${xLabel} ${sign} ${b}`,
    `R² = ${formatScatterR2(r2)}`,
  ];
}

/** Zoom axes to data spread so clusters are readable (not forced −1…1). */
export function scatterAxisBounds(
  values: number[],
  mode: 'spectral' | 'lst' = 'spectral',
): { min: number; max: number } {
  const finite = values.filter(n => Number.isFinite(n));
  if (!finite.length) {
    return mode === 'lst' ? { min: 14, max: 30 } : { min: -1, max: 1 };
  }
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (min === max) {
    const bump = mode === 'lst' ? 1.5 : 0.06;
    min -= bump;
    max += bump;
  } else {
    const pad = (max - min) * 0.12;
    min -= pad;
    max += pad;
  }
  if (mode === 'lst') {
    min = Math.max(0, Math.floor(min - 0.5));
    max = Math.ceil(max + 0.5);
  }
  return { min, max };
}

/** Visible scatter markers (image-2 style: clear dots even when n is large). */
export function scatterPointRadiusForCount(n: number): {
  radius: number;
  hover: number;
  borderWidth: number;
} {
  if (n > 2000) return { radius: 3.2, hover: 5.5, borderWidth: 0.9 };
  if (n > 1200) return { radius: 3.8, hover: 6.5, borderWidth: 1 };
  if (n > 600) return { radius: 4.5, hover: 7.5, borderWidth: 1.1 };
  if (n > 200) return { radius: 5.5, hover: 8.5, borderWidth: 1.2 };
  return { radius: 6.5, hover: 10, borderWidth: 1.4 };
}

/** Dark blue / purple points with enough contrast on dark or light charts. */
export function scatterPixelColors(isLight: boolean, dense: boolean): { fill: string; stroke: string } {
  if (isLight) {
    return dense
      ? { fill: 'rgba(30, 58, 138, 0.42)', stroke: 'rgba(30, 64, 175, 0.72)' }
      : { fill: 'rgba(30, 58, 138, 0.58)', stroke: 'rgba(30, 64, 175, 0.88)' };
  }
  return dense
    ? { fill: 'rgba(96, 165, 250, 0.5)', stroke: 'rgba(191, 219, 254, 0.85)' }
    : { fill: 'rgba(125, 211, 252, 0.62)', stroke: 'rgba(224, 242, 254, 0.95)' };
}

/** OLS regression line — dark red like reference LST/NDVI scatter. */
export const SI_SCATTER_OLS_LINE_COLOR = '#b91c1c';
export const SI_SCATTER_OLS_LINE_WIDTH = 2.75;

export type SiScatterOlsAnnotationOptions = {
  lines?: string[];
  color?: string;
};

/** Draw equation + R² in the upper-right of the plot area. */
export const siScatterOlsAnnotationPlugin: Plugin<'scatter'> = {
  id: 'siScatterOlsAnnotation',
  afterDatasetsDraw(chart, _args, opts) {
    const pluginOpts = (opts ?? {}) as SiScatterOlsAnnotationOptions;
    const lines = pluginOpts.lines;
    if (!lines?.length) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const color = pluginOpts.color ?? '#0f172a';
    ctx.save();
    ctx.fillStyle = color;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    let y = chartArea.top + 12;
    const x = chartArea.right - 12;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      ctx.font =
        i === 0
          ? '600 13px system-ui, -apple-system, Segoe UI, sans-serif'
          : '500 12px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.fillText(line, x, y);
      y += i === 0 ? 20 : 17;
    }
    ctx.restore();
  },
};
