/**
 * Shared symbology utilities aligned with GisMap.tsx (legend preview + normalization).
 */
import {
  arcgisDrawingInfoToLegendRows,
  arcgisLayerUsesServiceSymbology,
} from '../../lib/arcgisDrawingInfoMapbox';
import {
  arcLegendLabelForFieldValue,
  buildArcFieldsByLower,
  type ArcgisLayerDefLite,
} from '../../lib/arcgisAttributeDisplay';
import type {
  SymbologyCategoryStyle,
  SymbologyClassMethod,
  SymbologyColorRamp,
  SymbologyConfig,
  SymbologyStyle,
} from './components/LayerManager';
import { defaultCategorySymbolStyle, resolveCategoryStyleForKey } from './siCategorySymbolStyle';

export const clampInt = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(n)));

/** SVG / Mapbox dash string from per-category line dash style. */
export function categoryLineDashToSvg(dash?: SymbologyCategoryStyle['lineDash']): string {
  if (dash === 'dashed') return '8 4';
  if (dash === 'dotted') return '2 4';
  if (dash === 'dashdot') return '12 4 2 4';
  return '';
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const hexToRgb = (hex: string) => {
  const cleaned = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return { r, g, b };
};

const rgbToHex = (r: number, g: number, b: number) => {
  const to = (v: number) => clampInt(v, 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
};

export function darkenColor(hex: string, amount: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const t = Math.max(0, Math.min(1, amount));
  return rgbToHex(rgb.r * (1 - t), rgb.g * (1 - t), rgb.b * (1 - t));
}

export function getGeoJsonFields(data: any) {
  const features = Array.isArray(data?.features) ? (data.features as any[]) : [];
  const fields = new Set<string>();
  for (let i = 0; i < Math.min(features.length, 50); i += 1) {
    const props = features[i]?.properties;
    if (!props || typeof props !== 'object') continue;
    Object.keys(props).forEach(k => fields.add(k));
  }
  return Array.from(fields).sort((a, b) => a.localeCompare(b));
}

export function getNumericFields(data: any) {
  const features = Array.isArray(data?.features) ? (data.features as any[]) : [];
  const counts = new Map<string, { numeric: number; total: number }>();
  for (let i = 0; i < Math.min(features.length, 200); i += 1) {
    const props = features[i]?.properties;
    if (!props || typeof props !== 'object') continue;
    Object.entries(props).forEach(([k, v]) => {
      const cur = counts.get(k) ?? { numeric: 0, total: 0 };
      cur.total += 1;
      if (typeof v === 'number' && Number.isFinite(v)) cur.numeric += 1;
      counts.set(k, cur);
    });
  }
  return Array.from(counts.entries())
    .filter(([, v]) => v.total > 0 && v.numeric / v.total >= 0.6)
    .map(([k]) => k)
    .sort((a, b) => a.localeCompare(b));
}

const getGeometryKind = (geomType: any): 'point' | 'line' | 'polygon' | 'other' => {
  if (typeof geomType !== 'string') return 'other';
  if (geomType === 'Point' || geomType === 'MultiPoint') return 'point';
  if (geomType === 'LineString' || geomType === 'MultiLineString') return 'line';
  if (geomType === 'Polygon' || geomType === 'MultiPolygon') return 'polygon';
  return 'other';
};

export function getLayerGeometryKind(data: any): 'point' | 'line' | 'polygon' | 'other' {
  const features = Array.isArray(data?.features) ? (data.features as any[]) : [];
  for (let i = 0; i < Math.min(features.length, 50); i += 1) {
    const t = features[i]?.geometry?.type;
    const kind = getGeometryKind(t);
    if (kind !== 'other') return kind;
  }
  return 'other';
}

export function getGeometryCenter(geom: any): [number, number] | null {
  if (!geom || typeof geom !== 'object') return null;
  const t = geom.type;
  const c = geom.coordinates;
  const pickMid = (coords: any[]) => {
    if (!Array.isArray(coords) || coords.length === 0) return null;
    const mid = coords[Math.floor(coords.length / 2)];
    if (!Array.isArray(mid) || mid.length < 2) return null;
    return [mid[0], mid[1]] as [number, number];
  };
  if (t === 'Point') return Array.isArray(c) && c.length >= 2 ? ([c[0], c[1]] as [number, number]) : null;
  if (t === 'LineString') return pickMid(c);
  if (t === 'MultiLineString') return Array.isArray(c) && c.length ? pickMid(c[0]) : null;
  if (t === 'Polygon') return Array.isArray(c) && c.length ? pickMid(c[0]) : null;
  if (t === 'MultiPolygon') return Array.isArray(c) && c.length && c[0]?.length ? pickMid(c[0][0]) : null;
  return null;
}

const quantileAt = (sorted: number[], q: number) => {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = sorted[base];
  const b = sorted[Math.min(sorted.length - 1, base + 1)];
  return lerp(a, b, rest);
};

const jenksBreaks = (data: number[], nClasses: number) => {
  const sorted = [...data].filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return [0, 0];
  const k = clampInt(nClasses, 2, 12);
  const n = sorted.length;
  const mat1: number[][] = Array.from({ length: n + 1 }, () => Array(k + 1).fill(0));
  const mat2: number[][] = Array.from({ length: n + 1 }, () => Array(k + 1).fill(0));
  for (let i = 1; i <= k; i += 1) {
    mat1[0][i] = 1;
    mat2[0][i] = 0;
    for (let j = 1; j <= n; j += 1) mat2[j][i] = Infinity;
  }
  let v = 0;
  for (let l = 1; l <= n; l += 1) {
    let s1 = 0;
    let s2 = 0;
    let w = 0;
    for (let m = 1; m <= l; m += 1) {
      const i3 = l - m + 1;
      const val = sorted[i3 - 1];
      s2 += val * val;
      s1 += val;
      w += 1;
      v = s2 - (s1 * s1) / w;
      const i4 = i3 - 1;
      if (i4 !== 0) {
        for (let j = 2; j <= k; j += 1) {
          if (mat2[l][j] >= v + mat2[i4][j - 1]) {
            mat1[l][j] = i3;
            mat2[l][j] = v + mat2[i4][j - 1];
          }
        }
      }
    }
    mat1[l][1] = 1;
    mat2[l][1] = v;
  }
  const breaks: number[] = Array(k + 1).fill(0);
  breaks[k] = sorted[n - 1];
  breaks[0] = sorted[0];
  let countK = k;
  let kIdx = n;
  while (countK > 1) {
    const id = mat1[kIdx][countK] - 1;
    breaks[countK - 1] = sorted[id];
    kIdx = mat1[kIdx][countK] - 1;
    countK -= 1;
  }
  return breaks;
};

export function coerceSymbologyColorRamp(raw: unknown): SymbologyColorRamp {
  const allowed: SymbologyColorRamp[] = [
    'viridis',
    'blues',
    'greens',
    'plasma',
    'magma',
    'turbo',
    'inferno',
    'cividis',
    'spectral',
    'earth',
    'gray',
  ];
  return allowed.includes(raw as SymbologyColorRamp) ? (raw as SymbologyColorRamp) : 'viridis';
}

export function coerceSymbologyMethod(raw: unknown): SymbologyClassMethod {
  if (raw === 'jenks' || raw === 'quantile' || raw === 'equal_interval' || raw === 'standard_deviation' || raw === 'manual') {
    return raw;
  }
  if (raw === 'natural-breaks' || raw === 'natural_breaks') return 'jenks';
  if (raw === 'equal-interval') return 'equal_interval';
  return 'jenks';
}

export function computeBreaks(values: number[], classes: number, method: SymbologyClassMethod) {
  const cleaned = values.filter(v => Number.isFinite(v));
  if (cleaned.length === 0) return [0, 0];
  const k = clampInt(classes, 2, 12);
  const sorted = [...cleaned].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) return Array.from({ length: k + 1 }, (_, i) => (i === 0 ? min : max));
  if (method === 'equal_interval' || method === 'manual') {
    const step = (max - min) / k;
    return Array.from({ length: k + 1 }, (_, i) => (i === k ? max : min + step * i));
  }
  if (method === 'quantile') {
    const out: number[] = [min];
    for (let i = 1; i < k; i += 1) out.push(quantileAt(sorted, i / k));
    out.push(max);
    return out;
  }
  if (method === 'standard_deviation') {
    const mean = cleaned.reduce((a, x) => a + x, 0) / cleaned.length;
    const variance = cleaned.reduce((a, x) => a + (x - mean) ** 2, 0) / cleaned.length;
    const sd = Math.sqrt(Math.max(variance, 0)) || Math.abs(max - min) * 0.001 || 1e-9;
    const low = Math.max(min, mean - 2 * sd);
    const high = Math.min(max, mean + 2 * sd);
    if (!(high > low)) return jenksBreaks(sorted, k);
    const step = (high - low) / k;
    const out: number[] = [min];
    for (let i = 1; i < k; i += 1) {
      const v = low + step * i;
      out.push(Math.min(max, Math.max(min, v)));
    }
    out.push(max);
    for (let i = 1; i < out.length; i += 1) {
      if (out[i]! <= out[i - 1]!) {
        out[i] = Math.min(max, out[i - 1]! + (Math.abs(max - min) || 1) * 1e-6);
      }
    }
    out[0] = min;
    out[out.length - 1] = max;
    return out;
  }
  return jenksBreaks(sorted, k);
}

const getRampStops = (ramp: SymbologyColorRamp) => {
  switch (ramp) {
    case 'blues':
      return ['#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a'];
    case 'greens':
      return ['#f0fdf4', '#bbf7d0', '#4ade80', '#16a34a', '#14532d'];
    case 'plasma':
      return ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921'];
    case 'magma':
      return ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'];
    case 'turbo':
      return ['#30123b', '#3b4cc0', '#26a6d1', '#3de07e', '#f9e721', '#f20c0c'];
    case 'inferno':
      return ['#000004', '#420a68', '#932667', '#dd513a', '#fca50a', '#fcffa4'];
    case 'cividis':
      return ['#00224e', '#123570', '#3e4989', '#6788be', '#8fc8dc', '#eae29d'];
    case 'spectral':
      return ['#5e4fa2', '#3288bd', '#66c2a5', '#fee08b', '#f46d43', '#9e0142'];
    case 'earth':
      return ['#2c1158', '#4d2f89', '#7a5195', '#b3688f', '#e5988c', '#f6cdb0'];
    case 'gray':
      return ['#f8fafc', '#cbd5e1', '#94a3b8', '#64748b', '#334155', '#0f172a'];
    case 'viridis':
    default:
      return ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];
  }
};

export function sampleRamp(ramp: SymbologyColorRamp, n: number) {
  const count = clampInt(n, 2, 12);
  const stops = getRampStops(ramp).map(c => hexToRgb(c)).filter(Boolean) as Array<{ r: number; g: number; b: number }>;
  if (stops.length < 2) return Array.from({ length: count }, () => '#38bdf8');
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    const pos = t * (stops.length - 1);
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = stops[idx];
    const b = stops[Math.min(stops.length - 1, idx + 1)];
    out.push(rgbToHex(lerp(a.r, b.r, frac), lerp(a.g, b.g, frac), lerp(a.b, b.b, frac)));
  }
  return out;
}

export type SymbologyContext = {
  cfg: Required<SymbologyConfig>;
  geometryKind: 'point' | 'line' | 'polygon' | 'other';
  values: number[];
  breaks: number[];
  colors: string[];
  widths: number[];
  categories: string[];
  categoryColors: Record<string, string>;
  categoryOutlines: Record<string, string>;
  categoryFillOpacity: Record<string, number>;
  categoryOutlineWidth: Record<string, number>;
  categoryOutlineOpacity: Record<string, number>;
  categoryMarkerSize: Record<string, number>;
  uniqueDashes: Record<string, string>;
  dotDashes: string[];
  otherColor: string;
  threshold: number;
  thresholdPoints?: any;
};

export function describeArcGisRendererVisualization(renderer: any): string {
  const type = renderer?.type;
  if (type === 'uniqueValue') {
    const f1 = typeof renderer?.field1 === 'string' && renderer.field1 ? renderer.field1 : 'attribute';
    return `Unique symbols (${f1})`;
  }
  if (type === 'classBreaks') {
    const f = typeof renderer?.field === 'string' && renderer.field ? renderer.field : 'numeric field';
    return `Class breaks (${f})`;
  }
  if (type === 'simple') return 'Single symbol';
  if (type === 'heatmap') return 'Heatmap';
  if (type && typeof type === 'string') return `Renderer: ${type}`;
  return 'No renderer loaded';
}

export function inferVisualizationFromArcgisRenderer(renderer: any): Partial<Required<SymbologyConfig>> {
  const type = renderer?.type;
  if (type === 'uniqueValue') {
    const f1 = typeof renderer?.field1 === 'string' ? renderer.field1 : '';
    const n = Array.isArray(renderer?.uniqueValueInfos) ? renderer.uniqueValueInfos.length : 0;
    const classes = clampInt(n > 0 ? Math.min(Math.max(n, 2), 12) : 12, 2, 12);
    return { style: 'unique', field: f1, classes };
  }
  if (type === 'classBreaks') {
    const f = typeof renderer?.field === 'string' ? renderer.field : '';
    const n = Array.isArray(renderer?.classBreakInfos) ? renderer.classBreakInfos.length : 0;
    const classes = clampInt(n > 0 ? Math.min(Math.max(n, 2), 12) : 5, 2, 12);
    return { style: 'color', field: f, classes };
  }
  return { style: 'color', field: '', classes: 5 };
}

export function normalizeSymbologyForLayer(
  geojson: any,
  source: string | undefined,
  cfg?: SymbologyConfig,
  arcgisOnlineSupported = false,
): Required<SymbologyConfig> {
  const allFields = getGeoJsonFields(geojson);
  const numericFields = getNumericFields(geojson);
  const baseUseArcGisOnline = source === 'arcgis' || arcgisOnlineSupported;
  const style = (cfg?.style as SymbologyStyle) || 'color';
  const cfgField = typeof cfg?.field === 'string' ? cfg.field : '';
  const field =
    style === 'unique'
      ? cfgField || allFields[0] || numericFields[0] || ''
      : numericFields.includes(cfgField)
        ? cfgField
        : numericFields[0] || '';
  const next: Required<SymbologyConfig> = {
    useArcGisOnline: baseUseArcGisOnline
      ? typeof cfg?.useArcGisOnline === 'boolean'
        ? cfg.useArcGisOnline
        : false
      : false,
    style,
    field,
    classes: clampInt(typeof cfg?.classes === 'number' ? cfg.classes : style === 'unique' ? 12 : 5, 2, 12),
    method: coerceSymbologyMethod(cfg?.method),
    colorRamp: coerceSymbologyColorRamp(cfg?.colorRamp),
    threshold: typeof cfg?.threshold === 'number' && Number.isFinite(cfg.threshold) ? cfg.threshold : Number.NaN,
  };
  return next;
}

function uniqueValueKeysFromArcgisRenderer(renderer: any): string[] {
  if (!renderer || String(renderer.type || '') !== 'uniqueValue') return [];
  const infos = Array.isArray(renderer.uniqueValueInfos) ? renderer.uniqueValueInfos : [];
  const keys: string[] = [];
  for (const uvi of infos) {
    const v = uvi?.value;
    if (v !== null && v !== undefined && String(v).trim() !== '') keys.push(String(v));
    const label = typeof uvi?.label === 'string' ? uvi.label.trim() : '';
    if (label) keys.push(label);
  }
  return Array.from(new Set(keys));
}

export function buildSymbologyContext(
  geojson: any,
  cfg: Required<SymbologyConfig> & Pick<SymbologyConfig, 'categoryColors' | 'categoryStyles'>,
  arcgisDrawingInfo?: Record<string, unknown> | null,
  layerDefaults?: { fillOpacity?: number; outlineWidth?: number },
): SymbologyContext {
  const dashPatterns = ['', '8 4', '2 3', '10 3 2 3', '1 4', '14 4', '4 2 1 2', '12 2 4 2'];
  const toWidths = (k: number) => {
    const minW = 1.5;
    const maxW = 6;
    const out: number[] = [];
    for (let i = 0; i < k; i += 1) out.push(lerp(minW, maxW, k === 1 ? 0 : i / (k - 1)));
    return out;
  };
  const dotDashes = (k: number) => {
    const presets = ['1 10', '1 7', '1 5', '1 3.5', '1 2.5', '1 2', '1 1.6', '1 1.3', '1 1.1'];
    return presets.slice(0, clampInt(k, 3, 9));
  };

  const geometryKind = getLayerGeometryKind(geojson);
  const features = Array.isArray(geojson?.features) ? (geojson.features as any[]) : [];
  const values: number[] = [];
  if (cfg.field && cfg.style !== 'unique') {
    for (let i = 0; i < Math.min(features.length, 5000); i += 1) {
      const v = features[i]?.properties?.[cfg.field];
      if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
    }
  }
  const classes = clampInt(cfg.classes, 2, 12);
  const breaks = values.length ? computeBreaks(values, classes, cfg.method) : [0, 0];
  const colors = sampleRamp(cfg.colorRamp, classes);
  if (cfg.categoryColors && typeof cfg.categoryColors === 'object' && cfg.style !== 'unique') {
    for (let i = 0; i < colors.length; i += 1) {
      const override = cfg.categoryColors[`__si_class_${i}`];
      if (typeof override === 'string' && override.trim()) colors[i] = override.trim();
    }
  }
  const widths = toWidths(classes);
  const otherColor = '#94a3b8';
  const categories: string[] = [];
  const categoryColors: Record<string, string> = {};
  const categoryOutlines: Record<string, string> = {};
  const categoryFillOpacity: Record<string, number> = {};
  const categoryOutlineWidth: Record<string, number> = {};
  const categoryOutlineOpacity: Record<string, number> = {};
  const categoryMarkerSize: Record<string, number> = {};
  const uniqueDashes: Record<string, string> = {};
  const baseFillOp =
    typeof layerDefaults?.fillOpacity === 'number' && Number.isFinite(layerDefaults.fillOpacity)
      ? Math.max(0, Math.min(1, layerDefaults.fillOpacity))
      : 0.35;
  const baseOutlineW =
    typeof layerDefaults?.outlineWidth === 'number' && Number.isFinite(layerDefaults.outlineWidth)
      ? Math.max(0.25, Math.min(12, layerDefaults.outlineWidth))
      : 2;
  if (cfg.style === 'unique' && cfg.field) {
    const counts = new Map<string, number>();
    for (let i = 0; i < Math.min(features.length, 5000); i += 1) {
      const raw = features[i]?.properties?.[cfg.field];
      if (raw === null || raw === undefined || raw === '') continue;
      const key = String(raw);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const maxCats = clampInt(cfg.classes, 2, 12);
    let sortedCats = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k]) => k)
      .slice(0, maxCats);
    if (!sortedCats.length && arcgisDrawingInfo) {
      const ren = (arcgisDrawingInfo as { renderer?: unknown })?.renderer;
      const arcKeys = uniqueValueKeysFromArcgisRenderer(ren);
      if (arcKeys.length) sortedCats = arcKeys.slice(0, maxCats);
    }
    categories.push(...sortedCats);
    const palette = sampleRamp(cfg.colorRamp, Math.max(2, sortedCats.length));
    sortedCats.forEach((v, idx) => {
      const fill = palette[idx % palette.length] ?? otherColor;
      categoryColors[v] = fill;
      const st = resolveCategoryStyleForKey(v, fill, cfg, {
        fillOpacity: baseFillOp,
        outlineWidth: baseOutlineW,
      });
      categoryOutlines[v] = st.outline;
      categoryFillOpacity[v] = st.fillOpacity;
      categoryOutlineWidth[v] = st.outlineWidth;
      categoryOutlineOpacity[v] = st.outlineOpacity;
      if (typeof st.markerSize === 'number' && Number.isFinite(st.markerSize)) {
        categoryMarkerSize[v] = st.markerSize;
      }
      if (geometryKind === 'line') {
        if (st.lineDash) {
          uniqueDashes[v] = st.lineDash === 'solid' ? '' : categoryLineDashToSvg(st.lineDash);
        } else {
          uniqueDashes[v] = dashPatterns[idx % dashPatterns.length] ?? '';
        }
      }
    });
    const legacyOverrides = cfg.categoryColors;
    if (legacyOverrides && typeof legacyOverrides === 'object') {
      for (const [k, hex] of Object.entries(legacyOverrides)) {
        if (!k || typeof hex !== 'string' || !hex.trim()) continue;
        const fill = hex.trim();
        categoryColors[k] = fill;
        if (!categoryOutlines[k]) categoryOutlines[k] = darkenColor(fill, 0.28);
      }
    }
    const styleOverrides = cfg.categoryStyles;
    if (styleOverrides && typeof styleOverrides === 'object') {
      for (const [k, raw] of Object.entries(styleOverrides)) {
        if (!k || !raw || typeof raw !== 'object') continue;
        const st = defaultCategorySymbolStyle(
          typeof (raw as SymbologyCategoryStyle).fill === 'string' ? (raw as SymbologyCategoryStyle).fill : categoryColors[k] ?? otherColor,
          raw as SymbologyCategoryStyle,
        );
        categoryColors[k] = st.fill;
        categoryOutlines[k] = st.outline;
        categoryFillOpacity[k] = st.fillOpacity;
        categoryOutlineWidth[k] = st.outlineWidth;
        categoryOutlineOpacity[k] = st.outlineOpacity;
        if (typeof st.markerSize === 'number' && Number.isFinite(st.markerSize)) {
          categoryMarkerSize[k] = st.markerSize;
        }
        if (st.lineDash) {
          uniqueDashes[k] = st.lineDash === 'solid' ? '' : categoryLineDashToSvg(st.lineDash);
        }
      }
    }
  }
  const dots = dotDashes(classes);
  let threshold = cfg.threshold;
  if (!Number.isFinite(threshold) && values.length) {
    const sorted = [...values].sort((a, b) => a - b);
    threshold = quantileAt(sorted, 0.8);
  }
  const ctx: SymbologyContext = {
    cfg,
    geometryKind,
    values,
    breaks,
    colors,
    widths,
    categories,
    categoryColors,
    categoryOutlines,
    categoryFillOpacity,
    categoryOutlineWidth,
    categoryOutlineOpacity,
    categoryMarkerSize,
    uniqueDashes,
    dotDashes: dots,
    otherColor,
    threshold: Number.isFinite(threshold) ? threshold : 0,
  };
  if (cfg.style === 'threshold_markers' && cfg.field && values.length) {
    const pts: any[] = [];
    for (let i = 0; i < Math.min(features.length, 5000); i += 1) {
      const ft = features[i];
      const v = ft?.properties?.[cfg.field];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < ctx.threshold) continue;
      const center = getGeometryCenter(ft?.geometry);
      if (!center) continue;
      pts.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: center },
        properties: { __value: v },
      });
    }
    ctx.thresholdPoints = { type: 'FeatureCollection', features: pts };
  }
  return ctx;
}

export type SiLayerLegendRow = { label: string; color: string };

/** Legend rows that mirror what `siLayerMapboxStylePack` / ArcGIS drawingInfo paints on the map. */
export function buildSiLayerLegendRows(
  layer: {
    name?: string;
    geojson?: any;
    source?: string;
    symbology?: SymbologyConfig;
    color?: string;
    fillColor?: string;
    useArcGisSymbology?: boolean;
    arcgisDrawingInfo?: Record<string, unknown> | null;
    arcgisLayerDefinition?: ArcgisLayerDefLite | null;
  },
  opts?: { maxItems?: number },
): SiLayerLegendRow[] {
  const max = opts?.maxItems ?? 24;
  const baseStroke = layer.color || '#22c55e';
  const baseFill = layer.fillColor || baseStroke;

  if (arcgisLayerUsesServiceSymbology(layer)) {
    const arcDef = layer.arcgisLayerDefinition ?? null;
    const fieldsByLower = buildArcFieldsByLower(arcDef);
    return arcgisDrawingInfoToLegendRows(layer.arcgisDrawingInfo, {
      maxItems: max,
      resolveLabel: (field, raw, uviLabel) => {
        let label = uviLabel;
        if (arcDef && field && raw !== '') {
          const resolved = arcLegendLabelForFieldValue(field, raw, arcDef, fieldsByLower);
          if (resolved !== raw) label = resolved;
        }
        return label;
      },
    });
  }

  const canUseArcGisOnline =
    layer.source === 'arcgis' ||
    Boolean(layer.arcgisDrawingInfo) ||
    Boolean((layer.arcgisLayerDefinition as { drawingInfo?: unknown } | null | undefined)?.drawingInfo);
  const cfg = normalizeSymbologyForLayer(layer.geojson, layer.source, layer.symbology, canUseArcGisOnline);
  const ctx = buildSymbologyContext(
    layer.geojson,
    {
      ...cfg,
      categoryColors: layer.symbology?.categoryColors,
      categoryStyles: layer.symbology?.categoryStyles,
    },
    layer.arcgisDrawingInfo,
    { fillOpacity: layer.polygonFillAlpha, outlineWidth: layer.weight },
  );

  if (cfg.style === 'unique' && ctx.categories.length > 0) {
    if (ctx.geometryKind === 'line') {
      return ctx.categories.map(v => ({ label: v, color: baseStroke }));
    }
    return ctx.categories.map(v => ({
      label: v,
      color: ctx.categoryOutlines[v] ?? darkenColor(ctx.categoryColors[v] ?? ctx.otherColor, 0.28),
    }));
  }

  if (cfg.style !== 'single' && cfg.style !== 'unique' && ctx.breaks.length > 1) {
    const rows: SiLayerLegendRow[] = [];
    const n = Math.min(cfg.classes, ctx.breaks.length - 1);
    for (let i = 0; i < n; i += 1) {
      const a = ctx.breaks[i];
      const b = ctx.breaks[i + 1];
      rows.push({
        label: `${a.toFixed(2)} – ${b.toFixed(2)}`,
        color: ctx.colors[i] ?? baseStroke,
      });
    }
    if (rows.length) return rows;
  }

  if (cfg.style === 'threshold_markers') {
    return [
      { label: 'Base', color: baseStroke },
      { label: `Marker ≥ ${ctx.threshold.toFixed(2)}`, color: '#ef4444' },
    ];
  }

  return [{ label: layer.name?.trim() || 'Layer', color: baseFill }];
}
