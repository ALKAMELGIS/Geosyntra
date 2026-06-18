/**
 * Professional contour classification — breaks, ramps, Mapbox expressions, legend rows.
 */
import type { SymbologyClassMethod, SymbologyColorRamp } from '../layerTypes';
import { clampInt, computeBreaks, sampleRamp } from '../symbologyHelpers';
import { siClassColorKey } from './siSymbologyLegendItems';

/** Settings slice used for contour classification (keeps module free of terrain runtime imports). */
export type SiContourClassificationSettings = {
  contourClassificationEnabled: boolean;
  contourSurfaceType: SiContourSurfaceType;
  contourClassCount: number;
  contourClassMethod: SymbologyClassMethod;
  contourColorRamp: SymbologyColorRamp;
  contourClassColors: Record<string, string>;
  contourIntervalLineWidth: number;
};

export type SiContourSurfaceType = 'elevation' | 'slope' | 'temperature' | 'rainfall';

export type SiContourClassificationLegendItem = {
  label: string;
  color: string;
  valueKey: string;
  lower: number;
  upper: number;
};

export const SI_CONTOUR_SURFACE_OPTIONS: Array<{
  id: SiContourSurfaceType;
  label: string;
  hint: string;
}> = [
  { id: 'elevation', label: 'Elevation', hint: 'Terrain height (m)' },
  { id: 'slope', label: 'Slope', hint: 'Steepness (°)' },
  { id: 'temperature', label: 'Temperature', hint: 'Surface temp (°C)' },
  { id: 'rainfall', label: 'Rainfall', hint: 'Annual precip (mm)' },
];

export const SI_CONTOUR_CLASS_METHOD_OPTIONS: Array<{
  value: SymbologyClassMethod;
  label: string;
}> = [
  { value: 'jenks', label: 'Natural breaks' },
  { value: 'quantile', label: 'Quantile' },
  { value: 'equal_interval', label: 'Equal interval' },
  { value: 'standard_deviation', label: 'Std dev' },
];

const SURFACE_RANGE: Record<SiContourSurfaceType, { min: number; max: number; unit: string }> = {
  elevation: { min: 0, max: 3200, unit: 'm' },
  slope: { min: 0, max: 55, unit: '°' },
  temperature: { min: -25, max: 48, unit: '°C' },
  rainfall: { min: 0, max: 2400, unit: 'mm' },
};

export function normalizeSiContourSurfaceType(raw: string | undefined): SiContourSurfaceType {
  if (raw === 'slope' || raw === 'temperature' || raw === 'rainfall' || raw === 'elevation') return raw;
  return 'elevation';
}

/** Representative samples for break algorithms when contour features are not queried client-side. */
export function sampleValuesForContourSurface(surface: SiContourSurfaceType, count = 240): number[] {
  const { min, max } = SURFACE_RANGE[surface];
  const span = max - min || 1;
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / Math.max(1, count - 1);
    const skew = t * t * 0.55 + t * 0.45;
    out.push(min + span * skew);
  }
  return out;
}

export function buildContourClassColorsFromRamp(
  ramp: SymbologyColorRamp,
  classCount: number,
  existing?: Record<string, string>,
): Record<string, string> {
  const n = clampInt(classCount, 2, 12);
  const palette = sampleRamp(ramp, n);
  const out: Record<string, string> = {};
  for (let i = 0; i < n; i += 1) {
    const key = siClassColorKey(i);
    out[key] = existing?.[key] ?? palette[i] ?? palette[0] ?? '#38bdf8';
  }
  return out;
}

export function resolveContourClassColors(settings: SiContourClassificationSettings): string[] {
  const n = clampInt(settings.contourClassCount, 2, 12);
  const fromRamp = buildContourClassColorsFromRamp(
    settings.contourColorRamp,
    n,
    settings.contourClassColors,
  );
  return Array.from({ length: n }, (_, i) => fromRamp[siClassColorKey(i)] ?? '#38bdf8');
}

export function computeSiContourClassBreaks(settings: SiContourClassificationSettings): number[] {
  const surface = normalizeSiContourSurfaceType(settings.contourSurfaceType);
  const classes = clampInt(settings.contourClassCount, 2, 12);
  const method = settings.contourClassMethod;
  const samples = sampleValuesForContourSurface(surface);
  return computeBreaks(samples, classes, method);
}

function formatBreakValue(n: number, unit: string): string {
  const abs = Math.abs(n);
  if (unit === 'm' || unit === 'mm') return `${Math.round(n)} ${unit}`;
  if (abs >= 100) return `${Math.round(n)} ${unit}`;
  if (abs >= 10) return `${n.toFixed(1)} ${unit}`;
  return `${n.toFixed(2)} ${unit}`;
}

export function buildSiContourClassificationLegendItems(
  settings: SiContourClassificationSettings,
): SiContourClassificationLegendItem[] {
  if (!settings.contourClassificationEnabled) return [];
  const surface = normalizeSiContourSurfaceType(settings.contourSurfaceType);
  const { unit } = SURFACE_RANGE[surface];
  const breaks = computeSiContourClassBreaks(settings);
  const colors = resolveContourClassColors(settings);
  const items: SiContourClassificationLegendItem[] = [];
  for (let i = 0; i < colors.length; i += 1) {
    const lower = breaks[i] ?? breaks[0] ?? 0;
    const upper = breaks[i + 1] ?? breaks[breaks.length - 1] ?? lower;
    items.push({
      valueKey: siClassColorKey(i),
      color: colors[i]!,
      lower,
      upper,
      label: `${formatBreakValue(lower, unit)} – ${formatBreakValue(upper, unit)}`,
    });
  }
  return items;
}

/** Mapbox `step` on terrain `ele` (meters) using surface-scaled class breaks. */
export function buildSiContourClassifiedColorExpression(settings: SiContourClassificationSettings): unknown {
  const surface = normalizeSiContourSurfaceType(settings.contourSurfaceType);
  const { min, max } = SURFACE_RANGE[surface];
  const span = max - min || 1;
  const breaks = computeSiContourClassBreaks(settings);
  const colors = resolveContourClassColors(settings);
  const ele: unknown[] = ['round', ['get', 'ele']];
  const elevMax = SURFACE_RANGE.elevation.max;
  const toEleStop = (surfaceValue: number) => {
    const t = (surfaceValue - min) / span;
    return Math.max(0, Math.min(elevMax, Math.round(t * elevMax)));
  };

  const expr: unknown[] = ['step', ele, colors[0] ?? '#38bdf8'];
  for (let i = 1; i < colors.length && i < breaks.length; i += 1) {
    expr.push(toEleStop(breaks[i]!), colors[i]);
  }
  return expr;
}

/** Optional per-class line width (uniform base width when classes share one width). */
export function buildSiContourClassifiedWidthExpression(
  settings: SiContourClassificationSettings,
  baseWidth: number,
): unknown {
  if (!settings.contourClassificationEnabled) return baseWidth;
  const surface = normalizeSiContourSurfaceType(settings.contourSurfaceType);
  const { min, max } = SURFACE_RANGE[surface];
  const span = max - min || 1;
  const breaks = computeSiContourClassBreaks(settings);
  const ele: unknown[] = ['round', ['get', 'ele']];
  const widths = Array.from({ length: clampInt(settings.contourClassCount, 2, 12) }, () => baseWidth);
  const elevMax = SURFACE_RANGE.elevation.max;
  const toEleStop = (surfaceValue: number) => {
    const t = (surfaceValue - min) / span;
    return Math.max(0, Math.min(elevMax, Math.round(t * elevMax)));
  };
  const expr: unknown[] = ['step', ele, widths[0] ?? baseWidth];
  for (let i = 1; i < widths.length && i < breaks.length; i += 1) {
    expr.push(toEleStop(breaks[i]!), widths[i]);
  }
  return expr;
}
