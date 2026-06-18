import { propertyGetExpression } from '../../../lib/arcgisDrawingInfoMapbox';
import type {
  SiSymbologyAttributeRotation,
  SiSymbologyAttributeTransparency,
} from '../../../lib/gisLayerTypes';
import { readGeoJsonPropertyString } from '../symbologyHelpers';
import type { SiVectorStylePack } from '../siSymbolStyleStudio';

export const DEFAULT_SI_SYMBOLOGY_ATTRIBUTE_TRANSPARENCY: SiSymbologyAttributeTransparency = {
  enabled: false,
  field: '',
  dividedByField: '',
  valueMin: 0,
  valueMax: 1,
  highTransparency: 0,
  lowTransparency: 70,
  includeInLegend: false,
};

export const DEFAULT_SI_SYMBOLOGY_ATTRIBUTE_ROTATION: SiSymbologyAttributeRotation = {
  enabled: false,
  field: '',
  mode: 'geographic',
};

function clampPct(n: unknown, fallback = 0): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function numericFieldGet(field: string): unknown[] {
  return ['coalesce', ['to-number', propertyGetExpression(field)], 0];
}

export type SiFieldNumericStats = {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  count: number;
};

export function computeFieldNumericStats(geojson: unknown, field: string): SiFieldNumericStats {
  const empty: SiFieldNumericStats = { min: 0, max: 1, mean: 0.5, stdDev: 0.25, count: 0 };
  if (!field.trim()) return empty;
  const features = Array.isArray((geojson as { features?: unknown[] })?.features)
    ? ((geojson as { features: unknown[] }).features as { properties?: Record<string, unknown> }[])
    : [];
  const values: number[] = [];
  for (let i = 0; i < Math.min(features.length, 8000); i += 1) {
    const raw = readGeoJsonPropertyString(features[i]?.properties, field);
    const n = Number(raw);
    if (Number.isFinite(n)) values.push(n);
  }
  if (!values.length) return empty;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return { min, max, mean, stdDev, count: values.length };
}

export function sanitizeSiSymbologyAttributeTransparency(
  raw: unknown,
): SiSymbologyAttributeTransparency {
  const d = DEFAULT_SI_SYMBOLOGY_ATTRIBUTE_TRANSPARENCY;
  if (!raw || typeof raw !== 'object') return { ...d };
  const o = raw as Record<string, unknown>;
  const valueMin = Number(o.valueMin);
  const valueMax = Number(o.valueMax);
  return {
    enabled: Boolean(o.enabled),
    field: typeof o.field === 'string' ? o.field : d.field,
    dividedByField: typeof o.dividedByField === 'string' ? o.dividedByField : d.dividedByField,
    valueMin: Number.isFinite(valueMin) ? valueMin : d.valueMin,
    valueMax: Number.isFinite(valueMax) ? valueMax : d.valueMax,
    highTransparency: clampPct(o.highTransparency, d.highTransparency),
    lowTransparency: clampPct(o.lowTransparency, d.lowTransparency),
    includeInLegend: Boolean(o.includeInLegend),
  };
}

export function sanitizeSiSymbologyAttributeRotation(raw: unknown): SiSymbologyAttributeRotation {
  const d = DEFAULT_SI_SYMBOLOGY_ATTRIBUTE_ROTATION;
  if (!raw || typeof raw !== 'object') return { ...d };
  const o = raw as Record<string, unknown>;
  return {
    enabled: Boolean(o.enabled),
    field: typeof o.field === 'string' ? o.field : d.field,
    mode: o.mode === 'arithmetic' ? 'arithmetic' : 'geographic',
  };
}

export function buildAttributeTransparencyOpacityExpr(
  cfg: SiSymbologyAttributeTransparency,
): unknown[] | null {
  if (!cfg.enabled || !cfg.field.trim()) return null;
  let valueExpr: unknown[] = numericFieldGet(cfg.field);
  if (cfg.dividedByField.trim()) {
    const denom = ['max', 0.000001, numericFieldGet(cfg.dividedByField)] as unknown[];
    valueExpr = ['/', valueExpr, denom] as unknown[];
  }
  const min = cfg.valueMin;
  const max = cfg.valueMax === cfg.valueMin ? cfg.valueMin + 1 : cfg.valueMax;
  const lowOp = 1 - clampPct(cfg.lowTransparency) / 100;
  const highOp = 1 - clampPct(cfg.highTransparency) / 100;
  return ['interpolate', ['linear'], valueExpr, min, lowOp, max, highOp];
}

export function buildAttributeRotationExpr(cfg: SiSymbologyAttributeRotation): unknown[] | null {
  if (!cfg.enabled || !cfg.field.trim()) return null;
  const numGet = numericFieldGet(cfg.field);
  if (cfg.mode === 'arithmetic') {
    return ['-', 90, numGet] as unknown[];
  }
  return numGet;
}

function multiplyOpacityPaint(
  paint: Record<string, unknown>,
  key: string,
  attrExpr: unknown[],
): void {
  const base = paint[key];
  if (base === undefined) {
    paint[key] = attrExpr;
    return;
  }
  if (typeof base === 'number') {
    paint[key] = ['*', base, attrExpr];
    return;
  }
  paint[key] = ['*', base, attrExpr];
}

/** Apply attribute transparency / rotation onto an existing style pack. */
export function applyAttributeDriveToVectorStylePack(
  pack: SiVectorStylePack,
  symbology?: {
    attributeTransparency?: SiSymbologyAttributeTransparency;
    attributeRotation?: SiSymbologyAttributeRotation;
  },
): SiVectorStylePack {
  const transparency = symbology?.attributeTransparency
    ? sanitizeSiSymbologyAttributeTransparency(symbology.attributeTransparency)
    : DEFAULT_SI_SYMBOLOGY_ATTRIBUTE_TRANSPARENCY;
  const rotation = symbology?.attributeRotation
    ? sanitizeSiSymbologyAttributeRotation(symbology.attributeRotation)
    : DEFAULT_SI_SYMBOLOGY_ATTRIBUTE_ROTATION;

  const opacityExpr = buildAttributeTransparencyOpacityExpr(transparency);
  const rotateExpr = buildAttributeRotationExpr(rotation);

  if (!opacityExpr && !rotateExpr) return pack;

  const fillPaint = { ...pack.fillPaint };
  const linePaint = { ...pack.linePaint };
  const circlePaint = { ...pack.circlePaint };

  if (opacityExpr) {
    multiplyOpacityPaint(fillPaint, 'fill-opacity', opacityExpr);
    multiplyOpacityPaint(linePaint, 'line-opacity', opacityExpr);
    multiplyOpacityPaint(circlePaint, 'circle-opacity', opacityExpr);
    multiplyOpacityPaint(circlePaint, 'circle-stroke-opacity', opacityExpr);
  }

  if (rotateExpr) {
    circlePaint['circle-rotate'] = rotateExpr;
  }

  return {
    ...pack,
    fillPaint,
    linePaint,
    circlePaint,
  };
}

export function suggestAttributeTransparencyForField(
  geojson: unknown,
  field: string,
  prev?: SiSymbologyAttributeTransparency,
): SiSymbologyAttributeTransparency {
  const stats = computeFieldNumericStats(geojson, field);
  const base = sanitizeSiSymbologyAttributeTransparency(prev);
  return {
    ...base,
    field,
    valueMin: stats.min,
    valueMax: stats.max === stats.min ? stats.min + 1 : stats.max,
  };
}
