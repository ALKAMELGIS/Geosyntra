/**
 * Satellite Intelligence — vector symbol appearance + Mapbox paint helpers
 * (aligned with GisMap / LayerManager field names for persistence).
 */
import { propertyGetExpression } from '../../lib/arcgisDrawingInfoMapbox';
import type { SymbologyCategoryStyle, SymbologyConfig, SymbologyStyle } from './components/LayerManager';
import { syncCategoryColorsFromStyles } from './siCategorySymbolStyle';
import {
  buildSymbologyContext,
  darkenColor,
  getLayerGeometryKind,
  normalizeSymbologyForLayer,
} from './symbologyHelpers';

export const SI_MAPBOX_STYLE_CLIPBOARD_LS = 'agri-si-style-clipboard-v1';
export const SI_MAPBOX_STYLE_STUDIO_PREFS_LS = 'agri-si-style-studio-prefs-v1';

export type SiStrokeStyle = 'solid' | 'dashed' | 'dotted' | 'dashdot';
export type SiFillStyle = 'solid' | 'pattern' | 'hatch' | 'gradient';
export type SiBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

export type SiLayerAppearancePersisted = {
  color: string;
  fillColor: string;
  weight: number;
  opacity: number;
  strokeStyle: SiStrokeStyle;
  polygonFillAlpha: number;
  pointRadius: number;
  fillStyle: SiFillStyle;
  blendMode: SiBlendMode;
};

export type SiSymbologyAppearance = SiLayerAppearancePersisted & { previewCornerRadius: number };

export type SiStudioSectionState = {
  visualization: boolean;
  appearance: boolean;
  templates: boolean;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const defaultSiSymbologyAppearance = (): SiSymbologyAppearance => ({
  color: '#94a3b8',
  fillColor: '#38bdf8',
  weight: 2,
  opacity: 1,
  strokeStyle: 'solid',
  polygonFillAlpha: 0.35,
  pointRadius: 6,
  fillStyle: 'solid',
  blendMode: 'normal',
  previewCornerRadius: 8,
});

export function appearanceFromSiCustomLayerFields(layer: {
  color?: string;
  fillColor?: string;
  weight?: number;
  mapOpacity?: number;
  strokeStyle?: string;
  polygonFillAlpha?: number;
  pointRadius?: number;
  fillStyle?: string;
  blendMode?: string;
}): SiSymbologyAppearance {
  const mo =
    typeof layer.mapOpacity === 'number' && Number.isFinite(layer.mapOpacity)
      ? clamp01(layer.mapOpacity)
      : 1;
  const ss = layer.strokeStyle;
  const strokeStyle: SiStrokeStyle =
    ss === 'dashed' || ss === 'dotted' || ss === 'dashdot' || ss === 'solid' ? ss : 'solid';
  const fs = layer.fillStyle;
  const fillStyle: SiFillStyle =
    fs === 'pattern' || fs === 'hatch' || fs === 'gradient' || fs === 'solid' ? fs : 'solid';
  const bm = layer.blendMode;
  const blendMode: SiBlendMode =
    bm === 'multiply' || bm === 'screen' || bm === 'overlay' || bm === 'darken' || bm === 'lighten' || bm === 'normal'
      ? bm
      : 'normal';
  const pfa =
    typeof layer.polygonFillAlpha === 'number' && Number.isFinite(layer.polygonFillAlpha)
      ? clamp01(layer.polygonFillAlpha)
      : 0.35;
  const pr =
    typeof layer.pointRadius === 'number' && Number.isFinite(layer.pointRadius)
      ? Math.max(3, Math.min(24, layer.pointRadius))
      : 6;
  const w =
    typeof layer.weight === 'number' && Number.isFinite(layer.weight) ? Math.max(0.5, Math.min(16, layer.weight)) : 2;
  return {
    color: typeof layer.color === 'string' && layer.color.trim() ? layer.color.trim() : '#15803d',
    fillColor:
      typeof layer.fillColor === 'string' && layer.fillColor.trim()
        ? layer.fillColor.trim()
        : typeof layer.color === 'string' && layer.color.trim()
          ? layer.color.trim()
          : '#22c55e',
    weight: w,
    opacity: mo,
    strokeStyle,
    polygonFillAlpha: pfa,
    pointRadius: pr,
    fillStyle,
    blendMode,
    previewCornerRadius: 8,
  };
}

export function persistedSiAppearance(a: SiSymbologyAppearance): SiLayerAppearancePersisted {
  const { previewCornerRadius: _p, ...rest } = a;
  return rest;
}

export { siLayerPrefersCustomSymbology } from './siLayerSymbologyEngine';

export type SiSymbologyDraftLike = Required<SymbologyConfig> & {
  categoryColors?: Record<string, string>;
  categoryStyles?: Record<string, SymbologyCategoryStyle>;
};

/** Mapbox layer remount key from symbology + appearance (live studio preview). */
export function siSymbologyStyleKeyFromConfig(
  sym: SymbologyConfig | undefined,
  appearance: Pick<
    SiSymbologyAppearance,
    'color' | 'fillColor' | 'weight' | 'polygonFillAlpha' | 'strokeStyle' | 'pointRadius'
  >,
  mapOpacity?: number,
): string {
  const catKey =
    sym?.categoryStyles && typeof sym.categoryStyles === 'object'
      ? JSON.stringify(sym.categoryStyles)
      : sym?.categoryColors && typeof sym.categoryColors === 'object'
        ? JSON.stringify(sym.categoryColors)
        : '';
  return [
    'c',
    sym?.style ?? '',
    sym?.field ?? '',
    sym?.colorRamp ?? '',
    String(sym?.classes ?? ''),
    String(sym?.method ?? ''),
    String(sym?.threshold ?? ''),
    String(sym?.useArcGisOnline ?? ''),
    catKey,
    appearance.color ?? '',
    appearance.fillColor ?? '',
    String(appearance.weight ?? ''),
    String(appearance.polygonFillAlpha ?? ''),
    String(mapOpacity ?? 1),
    appearance.strokeStyle ?? '',
    String(appearance.pointRadius ?? ''),
    appearance.fillStyle ?? '',
    appearance.blendMode ?? '',
  ].join('|');
}

/**
 * Build Mapbox paints directly from the symbology studio draft (not persisted layer state).
 * Skips ArcGIS drawingInfo so service defaults cannot override user edits during preview.
 */
export function buildSiMapStylePackFromSymbologyDraft(
  layer: {
    geojson: any;
    source?: string;
    arcgisDrawingInfo?: Record<string, unknown> | null;
    arcgisLayerDefinition?: { drawingInfo?: unknown } | null;
    sourceUrl?: string;
  },
  draft: SiSymbologyDraftLike,
  appearance: SiSymbologyAppearance,
): SiVectorStylePack {
  const canUseArcGisOnline =
    layer.source === 'arcgis' ||
    Boolean(layer.arcgisDrawingInfo) ||
    Boolean(layer.arcgisLayerDefinition?.drawingInfo) ||
    Boolean(layer.sourceUrl?.trim());
  const normalized = normalizeSymbologyForLayer(layer.geojson, layer.source, draft, canUseArcGisOnline);
  const symCfg: SymbologyConfig = {
    useArcGisOnline: false,
    style: normalized.style,
    field: normalized.field,
    classes: normalized.classes,
    method: normalized.method,
    colorRamp: normalized.colorRamp,
    threshold: normalized.threshold,
    categoryColors: draft.categoryColors ?? syncCategoryColorsFromStyles(draft.categoryStyles),
    categoryStyles: draft.categoryStyles,
  };
  const ap = persistedSiAppearance(appearance);
  return buildSiCustomVectorStylePack({
    geojson: layer.geojson,
    source: layer.source,
    symbology: symCfg,
    arcgisDrawingInfo: null,
    color: ap.color,
    fillColor: ap.fillColor,
    weight: ap.weight,
    strokeStyle: ap.strokeStyle,
    polygonFillAlpha: ap.polygonFillAlpha,
    pointRadius: ap.pointRadius,
    fillStyle: ap.fillStyle,
    canUseArcGisOnline: false,
  });
}

export function mapboxLineDashFromStrokeStyle(style?: SiStrokeStyle): number[] | undefined {
  if (style === 'dashed') return [6, 4]
  if (style === 'dotted') return [2, 5]
  if (style === 'dashdot') return [10, 4, 2, 4]
  return undefined
}

export function strokeDashSvgFromStyle(style?: SiStrokeStyle): string {
  if (style === 'dashed') return '8 4'
  if (style === 'dotted') return '2 4'
  if (style === 'dashdot') return '12 4 2 4'
  return ''
}

export function fillOpacityFactorForSiFillStyle(fillStyle: SiFillStyle | undefined): number {
  if (fillStyle === 'pattern') return 0.92
  if (fillStyle === 'hatch') return 0.88
  if (fillStyle === 'gradient') return 0.9
  return 1
}

type SiStyleClipboardV1 = { v: 1; appearance: SiLayerAppearancePersisted }

export function readSiStyleClipboard(): SiLayerAppearancePersisted | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SI_MAPBOX_STYLE_CLIPBOARD_LS)
    if (!raw) return null
    const j = JSON.parse(raw) as SiStyleClipboardV1
    if (!j || j.v !== 1 || !j.appearance || typeof j.appearance !== 'object') return null
    return j.appearance
  } catch {
    return null
  }
}

export function writeSiStyleClipboard(appearance: SiLayerAppearancePersisted) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SI_MAPBOX_STYLE_CLIPBOARD_LS, JSON.stringify({ v: 1, appearance }))
  } catch {
    /* ignore */
  }
}

export function loadSiStudioSectionPrefs(): SiStudioSectionState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SI_MAPBOX_STYLE_STUDIO_PREFS_LS)
    if (!raw) return null
    const j = JSON.parse(raw) as Partial<SiStudioSectionState>
    if (!j || typeof j !== 'object') return null
    return {
      visualization: Boolean(j.visualization),
      appearance: Boolean(j.appearance),
      templates: Boolean(j.templates),
    }
  } catch {
    return null
  }
}

export function saveSiStudioSectionPrefs(s: SiStudioSectionState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SI_MAPBOX_STYLE_STUDIO_PREFS_LS, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

const SI_MAPBOX_POLY_FILTER: any = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]];
const SI_MAPBOX_LINE_POLY_FILTER: any = [
  'in',
  ['geometry-type'],
  ['literal', ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']],
];
const SI_MAPBOX_LINE_ONLY_FILTER: any = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]];
const SI_MAPBOX_POINT_FILTER: any = ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]];

/** Numeric attribute for class breaks / size ramps (field alias + casing tolerant). */
function numericFieldGetExpression(field: string): any {
  return ['coalesce', ['to-number', propertyGetExpression(field)], 0];
}

function matchExprFromCategoryNumbers(
  field: string,
  values: Record<string, number>,
  fallback: number,
): any {
  const keys = Object.keys(values)
  const keyExpr: any = ['to-string', ['coalesce', propertyGetExpression(field), ['literal', '']]]
  const expr: any[] = ['match', keyExpr]
  const seen = new Set<string>()
  for (const k of keys) {
    if (!k || seen.has(k)) continue
    seen.add(k)
    const n = values[k]
    if (!Number.isFinite(n)) continue
    expr.push(k, n)
    const num = Number(k)
    if (Number.isFinite(num) && !seen.has(String(num))) {
      seen.add(String(num))
      expr.push(num, n)
    }
  }
  expr.push(fallback)
  return expr
}

function matchExprFromCategoryColors(field: string, categoryColors: Record<string, string>, otherColor: string): any {
  const keys = Object.keys(categoryColors)
  const keyExpr: any = ['to-string', ['coalesce', propertyGetExpression(field), ['literal', '']]]
  const expr: any[] = ['match', keyExpr]
  const seen = new Set<string>()
  for (const k of keys) {
    if (!k || seen.has(k)) continue
    seen.add(k)
    expr.push(k, categoryColors[k])
    const n = Number(k)
    if (Number.isFinite(n) && !seen.has(String(n))) {
      seen.add(String(n))
      expr.push(n, categoryColors[k])
    }
  }
  expr.push(otherColor)
  return expr
}

function matchExprLineDashFromUnique(field: string, uniqueDashes: Record<string, string>, fallback: number[]): any {
  const keys = Object.keys(uniqueDashes)
  const expr: any[] = ['match', ['to-string', ['coalesce', propertyGetExpression(field), ['literal', '']]]]
  for (const k of keys) {
    const raw = uniqueDashes[k] ?? ''
    const parts = raw
      .split(/\s+/)
      .map(s => parseFloat(s))
      .filter(n => Number.isFinite(n))
    expr.push(k, ['literal', parts.length ? parts : fallback])
  }
  expr.push(['literal', fallback])
  return expr
}

export type SiVectorStylePack = {
  fillFilter: any;
  lineFilter: any;
  pointFilter: any;
  fillPaint: Record<string, unknown>;
  linePaint: Record<string, unknown>;
  circlePaint: Record<string, unknown>;
};

/**
 * Mapbox paints for custom (non–ArcGIS drawingInfo) vector layers, including
 * data-driven symbology from `symbology` + base appearance from layer fields.
 */
export function buildSiCustomVectorStylePack(opts: {
  geojson: any;
  source?: string;
  symbology?: SymbologyConfig;
  arcgisDrawingInfo?: Record<string, unknown> | null;
  color?: string;
  fillColor?: string;
  weight?: number;
  strokeStyle?: SiStrokeStyle;
  polygonFillAlpha?: number;
  pointRadius?: number;
  fillStyle?: SiFillStyle;
  canUseArcGisOnline?: boolean;
}): SiVectorStylePack {
  const appearance = appearanceFromSiCustomLayerFields(opts)
  const baseLine = appearance.color
  const baseFill = appearance.fillColor
  const weight = appearance.weight
  const lineDash = mapboxLineDashFromStrokeStyle(appearance.strokeStyle)
  const fillOpBase =
    appearance.polygonFillAlpha * fillOpacityFactorForSiFillStyle(appearance.fillStyle)
  const radius = appearance.pointRadius

  const cfg = normalizeSymbologyForLayer(
    opts.geojson,
    opts.source,
    opts.symbology,
    Boolean(opts.canUseArcGisOnline),
  )
  const ctx = buildSymbologyContext(
    opts.geojson,
    {
      ...cfg,
      categoryColors: opts.symbology?.categoryColors,
      categoryStyles: opts.symbology?.categoryStyles,
    },
    opts.arcgisDrawingInfo ?? null,
    { fillOpacity: opts.polygonFillAlpha, outlineWidth: opts.weight },
  )
  const geometryKind = getLayerGeometryKind(opts.geojson)
  const field = cfg.field || ''

  const baseLinePaint: Record<string, unknown> = {
    'line-color': baseLine,
    'line-width': weight,
    ...(lineDash ? { 'line-dasharray': lineDash } : {}),
  }

  const baseFillPaint: Record<string, unknown> = {
    'fill-color': baseFill,
    'fill-opacity': fillOpBase,
  }

  const baseCirclePaint: Record<string, unknown> = {
    'circle-radius': radius,
    'circle-color': baseFill,
    'circle-stroke-width': Math.max(1, Math.min(4, weight * 0.65)),
    'circle-stroke-color': baseLine,
  }

  const style = cfg.style as SymbologyStyle

  const numericFallbackPaint = (): SiVectorStylePack => ({
    fillFilter: SI_MAPBOX_POLY_FILTER,
    lineFilter: SI_MAPBOX_LINE_POLY_FILTER,
    pointFilter: SI_MAPBOX_POINT_FILTER,
    fillPaint: baseFillPaint,
    linePaint: baseLinePaint,
    circlePaint: baseCirclePaint,
  })

  if (style === 'single' || !opts.symbology) {
    return numericFallbackPaint()
  }

  if (!field) {
    return numericFallbackPaint()
  }

  if (style === 'unique' && field) {
    const fillExpr = matchExprFromCategoryColors(field, ctx.categoryColors, ctx.otherColor)
    const strokeExpr = matchExprFromCategoryColors(
      field,
      ctx.categoryOutlines,
      darkenColor(ctx.otherColor, 0.28),
    )
    const fillOpExpr = matchExprFromCategoryNumbers(field, ctx.categoryFillOpacity, fillOpBase)
    const lineWidthExpr = matchExprFromCategoryNumbers(field, ctx.categoryOutlineWidth, weight)
    const outlineOpExpr = matchExprFromCategoryNumbers(field, ctx.categoryOutlineOpacity, 1)
    const hasPerCatFillOp = Object.keys(ctx.categoryFillOpacity).length > 0
    const hasPerCatLineW = Object.keys(ctx.categoryOutlineWidth).length > 0
    const hasPerCatOutlineOp = Object.keys(ctx.categoryOutlineOpacity).length > 0
    const markerRadiusExpr = matchExprFromCategoryNumbers(
      field,
      ctx.categoryMarkerSize,
      radius,
    )
    const hasPerCatMarker = Object.keys(ctx.categoryMarkerSize).length > 0
    const perCatDashExpr =
      Object.keys(ctx.uniqueDashes).length > 0
        ? matchExprLineDashFromUnique(field, ctx.uniqueDashes, lineDash ?? [1, 0])
        : undefined
    const lineDashPaint =
      perCatDashExpr !== undefined
        ? { 'line-dasharray': perCatDashExpr }
        : lineDash
          ? { 'line-dasharray': lineDash }
          : {}
    if (geometryKind === 'line') {
      return {
        fillFilter: SI_MAPBOX_POLY_FILTER,
        lineFilter: SI_MAPBOX_LINE_ONLY_FILTER,
        pointFilter: SI_MAPBOX_POINT_FILTER,
        fillPaint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0 },
        linePaint: {
          'line-color': fillExpr,
          'line-width': hasPerCatLineW ? lineWidthExpr : weight,
          'line-opacity': hasPerCatOutlineOp ? outlineOpExpr : 1,
          ...lineDashPaint,
        },
        circlePaint: baseCirclePaint,
      }
    }
    return {
      fillFilter: SI_MAPBOX_POLY_FILTER,
      lineFilter: SI_MAPBOX_LINE_POLY_FILTER,
      pointFilter: SI_MAPBOX_POINT_FILTER,
      fillPaint: {
        'fill-color': fillExpr,
        'fill-opacity': hasPerCatFillOp ? fillOpExpr : fillOpBase,
      },
      linePaint: {
        'line-color': strokeExpr,
        'line-width': hasPerCatLineW ? lineWidthExpr : weight,
        'line-opacity': hasPerCatOutlineOp ? outlineOpExpr : 1,
        ...lineDashPaint,
      },
      circlePaint: {
        'circle-radius': hasPerCatMarker ? markerRadiusExpr : radius,
        'circle-color': fillExpr,
        'circle-opacity': hasPerCatFillOp ? fillOpExpr : fillOpBase,
        'circle-stroke-width': hasPerCatLineW ? lineWidthExpr : Math.max(1, Math.min(4, weight * 0.65)),
        'circle-stroke-color': strokeExpr,
        'circle-stroke-opacity': hasPerCatOutlineOp ? outlineOpExpr : 1,
      },
    }
  }

  if (
    (style === 'color' ||
      style === 'size' ||
      style === 'color_size' ||
      style === 'dot_density' ||
      style === 'threshold_markers') &&
    field &&
    ctx.breaks.length >= 2
  ) {
    const breaks = ctx.breaks
    const colors = ctx.colors
    const widths = ctx.widths
    const outlineColors = colors.map(c => darkenColor(c ?? baseFill, 0.28))

    const numGet = numericFieldGetExpression(field);
    const colorStep: any[] = ['step', numGet, colors[0] ?? baseFill]
    for (let i = 1; i < breaks.length; i += 1) {
      colorStep.push(breaks[i], colors[Math.min(i, colors.length - 1)] ?? colors[0])
    }

    const lineColorStep: any[] = ['step', numGet, outlineColors[0] ?? baseLine]
    for (let i = 1; i < breaks.length; i += 1) {
      lineColorStep.push(breaks[i], outlineColors[Math.min(i, outlineColors.length - 1)] ?? outlineColors[0])
    }

    const widthStep: any[] = ['step', numGet, widths[0] ?? weight]
    for (let i = 1; i < breaks.length; i += 1) {
      widthStep.push(breaks[i], widths[Math.min(i, widths.length - 1)] ?? weight)
    }

    const radiusAt = (w: number) => Math.max(4, Math.min(18, 3 + w * 2))
    const radiusStep: any[] = ['step', numGet, radiusAt(widths[0] ?? weight)]
    for (let i = 1; i < breaks.length; i += 1) {
      radiusStep.push(breaks[i], radiusAt(widths[Math.min(i, widths.length - 1)] ?? weight))
    }

    const fillC =
      style === 'color' || style === 'color_size' || style === 'dot_density' || style === 'threshold_markers'
        ? colorStep
        : baseFill
    const lineC =
      style === 'color' || style === 'color_size' || style === 'dot_density' || style === 'threshold_markers'
        ? lineColorStep
        : baseLine

    const dotDash =
      style === 'dot_density' && ctx.dotDashes.length
        ? ([
            'step',
            numGet,
            ['literal', stringToDashLiteral(ctx.dotDashes[0])],
            ...flatStepDashPairs(breaks, ctx.dotDashes),
          ] as any)
        : lineDash

    const lineW = style === 'size' || style === 'color_size' ? widthStep : weight

    const circleRad =
      style === 'size' || style === 'color_size' || style === 'dot_density' ? radiusStep : radius

    return {
      fillFilter: SI_MAPBOX_POLY_FILTER,
      lineFilter: SI_MAPBOX_LINE_POLY_FILTER,
      pointFilter: SI_MAPBOX_POINT_FILTER,
      fillPaint: {
        'fill-color': fillC,
        'fill-opacity': fillOpBase,
      },
      linePaint: {
        'line-color': lineC,
        'line-width': lineW,
        ...(dotDash ? { 'line-dasharray': dotDash } : {}),
      },
      circlePaint: {
        'circle-radius': circleRad,
        'circle-color': fillC,
        'circle-stroke-width': Math.max(1, Math.min(4, weight * 0.65)),
        'circle-stroke-color': lineC,
      },
    }
  }

  return numericFallbackPaint()
}

function stringToDashLiteral(s: string): number[] {
  const parts = s
    .trim()
    .split(/\s+/)
    .map(x => parseFloat(x))
    .filter(n => Number.isFinite(n))
  return parts.length ? parts : [2, 2]
}

function flatStepDashPairs(breaks: number[], dashes: string[]): any[] {
  const out: any[] = []
  for (let i = 1; i < breaks.length && i - 1 < dashes.length; i += 1) {
    out.push(breaks[i], ['literal', stringToDashLiteral(dashes[i - 1] ?? dashes[0])])
  }
  return out
}
