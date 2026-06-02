import type { SymbologyStyle } from '../layerTypes';
import type { SiSymbologyStyleOption } from '../components/siSymbologyStudioConstants';
import { SI_SYMBOLOGY_STYLE_OPTIONS } from '../components/siSymbologyStudioConstants';

export type SiFieldKind = 'numeric' | 'text' | 'date';

const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function samplePropertyValues(geojson: unknown, field: string, max = 120): unknown[] {
  const features = Array.isArray((geojson as { features?: unknown[] })?.features)
    ? (geojson as { features: unknown[] }).features
    : [];
  const out: unknown[] = [];
  for (let i = 0; i < Math.min(features.length, max); i += 1) {
    const props = (features[i] as { properties?: Record<string, unknown> })?.properties;
    if (!props || typeof props !== 'object') continue;
    out.push(props[field]);
  }
  return out;
}

export function inferFieldKind(geojson: unknown, field: string): SiFieldKind {
  const values = samplePropertyValues(geojson, field);
  if (!values.length) return 'text';
  let numeric = 0;
  let dates = 0;
  let nonEmpty = 0;
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    nonEmpty += 1;
    if (typeof v === 'number' && Number.isFinite(v)) numeric += 1;
    else if (typeof v === 'string') {
      const s = v.trim();
      if (ISO_DATE_RE.test(s)) dates += 1;
      else if (s !== '' && Number.isFinite(Number(s))) numeric += 1;
    }
  }
  if (nonEmpty === 0) return 'text';
  if (dates / nonEmpty >= 0.55) return 'date';
  if (numeric / nonEmpty >= 0.6) return 'numeric';
  return 'text';
}

export function getFieldKindMap(geojson: unknown, fields: string[]): Record<string, SiFieldKind> {
  const out: Record<string, SiFieldKind> = {};
  for (const f of fields) out[f] = inferFieldKind(geojson, f);
  return out;
}

export function fieldKindIcon(kind: SiFieldKind): string {
  switch (kind) {
    case 'numeric':
      return '123';
    case 'date':
      return 'Dt';
    default:
      return 'Aa';
  }
}

export function fieldKindLabel(kind: SiFieldKind): string {
  switch (kind) {
    case 'numeric':
      return 'Numeric';
    case 'date':
      return 'Date';
    default:
      return 'Text';
  }
}

export function suggestSymbologyStyleForField(
  kind: SiFieldKind,
  geometryKind: 'point' | 'line' | 'polygon' | 'other',
  uniqueCount?: number,
): SymbologyStyle {
  if (kind === 'text' || kind === 'date') return 'unique';
  if (geometryKind === 'line') return 'color';
  if (typeof uniqueCount === 'number' && uniqueCount <= 12) return 'unique';
  if (geometryKind === 'point') return 'color_size';
  return 'color';
}

export function filterStyleOptionsForSmartMapping(
  options: SiSymbologyStyleOption[],
  kind: SiFieldKind,
  geometryKind: 'point' | 'line' | 'polygon' | 'other',
): SiSymbologyStyleOption[] {
  const numericOnly = new Set<SymbologyStyle>([
    'color',
    'size',
    'color_size',
    'dot_density',
    'threshold_markers',
  ]);
  return options.filter(opt => {
    if (geometryKind === 'line' && (opt.value === 'color_size' || opt.value === 'dot_density')) {
      return false;
    }
    if (kind === 'numeric') return true;
    if (numericOnly.has(opt.value)) return false;
    return true;
  });
}

export function orderStyleOptionsForSuggestions(
  options: SiSymbologyStyleOption[],
  suggested: SymbologyStyle,
): SiSymbologyStyleOption[] {
  const copy = [...options];
  copy.sort((a, b) => {
    if (a.value === suggested) return -1;
    if (b.value === suggested) return 1;
    return 0;
  });
  return copy;
}

export function smartMappingHintForField(kind: SiFieldKind): string {
  switch (kind) {
    case 'numeric':
      return 'Counts and amounts, color ramps, and graduated symbols work well for this field.';
    case 'date':
      return 'Treat dates as categories (unique values) or map them as ordered numeric epochs.';
    default:
      return 'Types (unique values) is the best match for text categories.';
  }
}

export { SI_SYMBOLOGY_STYLE_OPTIONS };
