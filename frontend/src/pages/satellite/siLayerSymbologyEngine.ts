/**
 * Layer symbology pipeline: one source of truth → Mapbox paints → remount revision.
 * Used by Satellite Intelligence map render, live studio preview, and layer persistence.
 */
import {
  arcgisDrawingInfoSupportsMapboxRender,
  arcgisDrawingInfoToCirclePaint,
  arcgisDrawingInfoToFillPaint,
  arcgisDrawingInfoToLinePaint,
  sanitizeArcgisDrawingInfoForClient,
} from '../../lib/arcgisDrawingInfoMapbox';
import type { SymbologyConfig, SymbologyCategoryStyle } from './components/LayerManager';
import { syncCategoryColorsFromStyles } from './siCategorySymbolStyle';
import {
  appearanceFromSiCustomLayerFields,
  buildSiCustomVectorStylePack,
  buildSiMapStylePackFromSymbologyDraft,
  persistedSiAppearance,
  siSymbologyStyleKeyFromConfig,
  type SiSymbologyAppearance,
  type SiSymbologyDraftLike,
  type SiVectorStylePack,
} from './siSymbolStyleStudio';
import {
  resolveSiForcedDefaultStylePackForLayer,
  siLayerShouldUseForcedGlobalStyle,
} from './siGlobalLayerStyleController';
import {
  buildSymbologyContext,
  clampInt,
  getGeoJsonFields,
  getNumericFields,
  inferVisualizationFromArcgisRenderer,
  normalizeSymbologyForLayer,
  readGeoJsonPropertyString,
  sampleRamp,
} from './symbologyHelpers';
import { siClassColorKey } from './utils/siSymbologyLegendItems';
import {
  sanitizeSiSymbologyAttributeRotation,
  sanitizeSiSymbologyAttributeTransparency,
} from './utils/siSymbologyAttributeDrive';
import { isGraduatedSymbologyStyleResolved } from './utils/siSymbologyStyleResolve';
import {
  siMapOutlineWidthExprForZoom,
  siMapOutlineWidthForZoom,
} from './utils/siMapOutlineWidthZoom';
import type { SymbologyStyle } from './components/LayerManager';

const SI_MAPBOX_POLY_FILTER: any = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]];
const SI_MAPBOX_LINE_POLY_FILTER: any = [
  'in',
  ['geometry-type'],
  ['literal', ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']],
];
const SI_MAPBOX_LINE_ONLY_FILTER: any = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]];
const SI_MAPBOX_POINT_FILTER: any = ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]];

const SI_ARCGIS_MAPBOX_NEUTRAL_LINE = 'rgba(148, 163, 184, 0.95)';
const SI_ARCGIS_MAPBOX_NEUTRAL_STROKE = 'rgba(15, 23, 42, 0.72)';
/** Minimum outline width so hollow ArcGIS polygons never render effectively invisible on the basemap. */
const SI_ARCGIS_MIN_OUTLINE_WIDTH = 1.6;

/**
 * Guarantee a clearly visible polygon/line outline. ArcGIS feature services often use hollow fills
 * with a 1px (or thinner) outline, which disappears over a satellite basemap — leaving the layer
 * "present in the list but nothing on the map". Floor the width/opacity (works for scalar widths
 * and Mapbox match/case width expressions) so the layer always shows.
 */
function withVisibleArcgisOutline(
  line: Record<string, unknown> | null,
  neutralColor: string,
): Record<string, unknown> {
  const base =
    line ??
    ({
      'line-color': neutralColor,
      'line-width': 1.75,
    } as Record<string, unknown>);
  const width = base['line-width'];
  const flooredWidth =
    typeof width === 'number'
      ? siMapOutlineWidthForZoom(Math.max(SI_ARCGIS_MIN_OUTLINE_WIDTH, width))
      : width == null
        ? siMapOutlineWidthForZoom(1.75)
        : (['max', siMapOutlineWidthExprForZoom(width), siMapOutlineWidthForZoom(SI_ARCGIS_MIN_OUTLINE_WIDTH)] as unknown);
  return {
    ...base,
    'line-color': base['line-color'] ?? neutralColor,
    'line-width': flooredWidth,
    'line-opacity': 0.95,
  };
}

export type SiCustomLayerSymbologyFields = {
  id?: string;
  name?: string;
  geojson: any;
  visible?: boolean;
  /** True while Symbology studio is editing — map uses `symbology` before Apply. */
  symbologyPreview?: boolean;
  symbologyUseFallback?: boolean;
  source?: 'arcgis' | 'upload' | 'api' | 'stac';
  sourceUrl?: string;
  symbology?: SymbologyConfig;
  useArcGisSymbology?: boolean;
  arcgisDrawingInfo?: Record<string, unknown> | null;
  arcgisLayerDefinition?: unknown;
  color?: string;
  fillColor?: string;
  weight?: number;
  mapOpacity?: number;
  strokeStyle?: string;
  polygonFillAlpha?: number;
  pointRadius?: number;
  fillStyle?: string;
  blendMode?: string;
};

/** True only after the user explicitly saved symbology in the Style studio. */
export function siLayerHasSavedCustomSymbology(sym?: SymbologyConfig): boolean {
  return sym?.userConfigured === true;
}

/** True only when the user explicitly opted into ArcGIS Online service symbology. */
export function siLayerExplicitlyUsesArcgisOnlineSymbology(layer: {
  symbology?: SymbologyConfig;
  useArcGisSymbology?: boolean;
}): boolean {
  if (layer.symbology?.useArcGisOnline === true) return true;
  if (layer.symbology?.useArcGisOnline === false) return false;
  if (layer.useArcGisSymbology === true) return true;
  if (layer.useArcGisSymbology === false) return false;
  return false;
}

/** True when Mapbox should use app symbology (data-driven), not ArcGIS drawingInfo. */
export function siLayerPrefersCustomSymbology(layer: {
  symbology?: SymbologyConfig;
  useArcGisSymbology?: boolean;
}): boolean {
  return !siLayerExplicitlyUsesArcgisOnlineSymbology(layer);
}

export function siLayerCanUseArcgisOnlineSymbology(layer: SiCustomLayerSymbologyFields): boolean {
  const defDi = (layer.arcgisLayerDefinition as { drawingInfo?: unknown } | null | undefined)?.drawingInfo;
  return (
    layer.source === 'arcgis' ||
    Boolean(layer.arcgisDrawingInfo) ||
    Boolean(defDi) ||
    Boolean(layer.sourceUrl?.trim())
  );
}

export function siLayerShouldUseArcgisDrawingInfo(layer: SiCustomLayerSymbologyFields): boolean {
  if (siLayerPrefersCustomSymbology(layer) && siLayerHasSavedCustomSymbology(layer.symbology)) return false;
  if (!layer.arcgisDrawingInfo || !arcgisDrawingInfoSupportsMapboxRender(layer.arcgisDrawingInfo)) return false;
  if (layer.useArcGisSymbology === false) return false;
  if (layer.symbology?.useArcGisOnline === false && layer.symbology?.userConfigured === true) return false;
  if (layer.symbology?.useArcGisOnline === true) return true;
  if (layer.source === 'arcgis' || layer.useArcGisSymbology === true) return true;
  return layer.symbology?.userConfigured !== true;
}

export function arcgisRendererStyleFingerprint(drawingInfo: unknown): string {
  try {
    const ren = (drawingInfo as { renderer?: Record<string, unknown> })?.renderer;
    if (!ren || typeof ren !== 'object') return '';
    const t = String(ren.type || '');
    if (t === 'uniqueValue' && Array.isArray(ren.uniqueValueInfos)) {
      return (ren.uniqueValueInfos as Array<{ value?: unknown; symbol?: { color?: unknown } }>)
        .slice(0, 40)
        .map(u => `${String(u?.value ?? '')}|${JSON.stringify(u?.symbol?.color ?? null)}`)
        .join(';');
    }
    if (t === 'classBreaks' && Array.isArray(ren.classBreakInfos)) {
      return (ren.classBreakInfos as Array<{ maxValue?: unknown; symbol?: { color?: unknown } }>)
        .slice(0, 40)
        .map(b => `${String(b?.maxValue ?? '')}|${JSON.stringify(b?.symbol?.color ?? null)}`)
        .join(';');
    }
    if (t === 'simple') return JSON.stringify((ren as { symbol?: { color?: unknown } }).symbol?.color ?? null);
    return t;
  } catch {
    return '';
  }
}

function defaultArcgisCirclePaint(): Record<string, unknown> {
  return {
    'circle-radius': 4,
    'circle-color': SI_ARCGIS_MAPBOX_NEUTRAL_LINE,
    'circle-stroke-width': 1,
    'circle-stroke-color': SI_ARCGIS_MAPBOX_NEUTRAL_STROKE,
  };
}

/** Map canvas paints from ArcGIS service drawingInfo (display path — not studio draft). */
export function arcgisDrawingInfoStylePack(di: Record<string, unknown>): SiVectorStylePack {
  const fill = arcgisDrawingInfoToFillPaint(di);
  const line = arcgisDrawingInfoToLinePaint(di, SI_ARCGIS_MAPBOX_NEUTRAL_LINE);
  const circle =
    arcgisDrawingInfoToCirclePaint(di, SI_ARCGIS_MAPBOX_NEUTRAL_LINE) ??
    (defaultArcgisCirclePaint() as Record<string, unknown>);
  if (fill) {
    return {
      fillFilter: SI_MAPBOX_POLY_FILTER,
      // Always paint polygon outlines via the line layer so hollow ArcGIS fills stay visible.
      lineFilter: SI_MAPBOX_LINE_POLY_FILTER,
      pointFilter: SI_MAPBOX_POINT_FILTER,
      fillPaint: fill as Record<string, unknown>,
      linePaint: withVisibleArcgisOutline(line, SI_ARCGIS_MAPBOX_NEUTRAL_LINE),
      circlePaint: circle,
    };
  }
  return {
    fillFilter: SI_MAPBOX_POLY_FILTER,
    lineFilter: SI_MAPBOX_LINE_POLY_FILTER,
    pointFilter: SI_MAPBOX_POINT_FILTER,
    fillPaint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0 },
    linePaint: withVisibleArcgisOutline(line, SI_ARCGIS_MAPBOX_NEUTRAL_LINE),
    circlePaint: circle,
  };
}

export function arcgisLayerFallbackStylePack(layer: SiCustomLayerSymbologyFields): SiVectorStylePack {
  const stroke = layer.color || '#94a3b8';
  const fill = layer.fillColor || stroke;
  const w = typeof layer.weight === 'number' && Number.isFinite(layer.weight) ? layer.weight : 1.5;
  const fillOp =
    typeof layer.polygonFillAlpha === 'number' && Number.isFinite(layer.polygonFillAlpha)
      ? Math.max(0.05, Math.min(1, layer.polygonFillAlpha))
      : 0.35;
  return {
    fillFilter: SI_MAPBOX_POLY_FILTER,
    lineFilter: SI_MAPBOX_LINE_POLY_FILTER,
    pointFilter: SI_MAPBOX_POINT_FILTER,
    fillPaint: { 'fill-color': fill, 'fill-opacity': fillOp },
    linePaint: { 'line-color': stroke, 'line-width': siMapOutlineWidthForZoom(w), 'line-opacity': 0.9 },
    circlePaint: {
      'circle-radius': typeof layer.pointRadius === 'number' ? layer.pointRadius : 4,
      'circle-color': fill,
      'circle-stroke-width': siMapOutlineWidthForZoom(1),
      'circle-stroke-color': stroke,
    },
  };
}

/** Saved studio symbology (Apply) overrides ArcGIS service renderer — never draft-only fields. */
export function siLayerHasAppSymbologyOverride(layer: SiCustomLayerSymbologyFields): boolean {
  if (!siLayerHasSavedCustomSymbology(layer.symbology)) return false;
  return layer.symbology?.useArcGisOnline !== true;
}

/** Live studio draft overrides service drawingInfo unless ArcGIS Online symbology is active. */
export function siSymbologyDraftOverridesServiceRenderer(draft: SiSymbologyDraftLike): boolean {
  return draft.useArcGisOnline !== true;
}

function buildAppSymbologyStylePack(layer: SiCustomLayerSymbologyFields): SiVectorStylePack {
  const ap = appearanceFromSiCustomLayerFields(layer);
  return buildSiCustomVectorStylePack({
    geojson: layer.geojson,
    source: layer.source,
    symbology: layer.symbology,
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

/** Layer carries in-progress studio symbology (before Apply / userConfigured). */
export function siLayerHasSymbologyStudioPreview(layer: SiCustomLayerSymbologyFields): boolean {
  return (
    layer.symbologyPreview === true &&
    Boolean(layer.symbology?.style && layer.symbology.style !== 'single') &&
    layer.symbology?.useArcGisOnline !== true
  );
}

/** Persisted layer → Mapbox paints (forced hollow black unless user saved symbology). */
export function resolveSiLayerMapboxStylePack(layer: SiCustomLayerSymbologyFields): SiVectorStylePack {
  if (siLayerShouldUseForcedGlobalStyle(layer)) {
    if (siLayerHasSymbologyStudioPreview(layer)) {
      return buildAppSymbologyStylePack(layer);
    }
    return resolveSiForcedDefaultStylePackForLayer(layer);
  }
  if (siLayerHasAppSymbologyOverride(layer)) {
    return buildAppSymbologyStylePack(layer);
  }
  if (siLayerShouldUseArcgisDrawingInfo(layer)) {
    return arcgisDrawingInfoStylePack(layer.arcgisDrawingInfo as Record<string, unknown>);
  }
  if (
    siLayerExplicitlyUsesArcgisOnlineSymbology(layer) &&
    layer.source === 'arcgis' &&
    !layer.arcgisDrawingInfo
  ) {
    return arcgisLayerFallbackStylePack(layer);
  }
  const ap = appearanceFromSiCustomLayerFields(layer);
  return buildSiCustomVectorStylePack({
    geojson: layer.geojson,
    source: layer.source,
    symbology: layer.symbology,
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

export type SiLayerStylePreviewInput = {
  layer: SiCustomLayerSymbologyFields;
  draft: SiSymbologyDraftLike;
  appearance: SiSymbologyAppearance;
};

/** Studio live preview: draft is the single source of truth (never implicit ArcGIS defaults). */
export function resolveSiLayerMapboxStylePackWithPreview(input: SiLayerStylePreviewInput): SiVectorStylePack {
  const useAgOnline =
    !siSymbologyDraftOverridesServiceRenderer(input.draft) &&
    input.draft.useArcGisOnline === true &&
    siLayerCanUseArcgisOnlineSymbology(input.layer);
  if (!useAgOnline) {
    return buildSiMapStylePackFromSymbologyDraft(input.layer, input.draft, input.appearance);
  }
  if (input.layer.arcgisDrawingInfo && typeof input.layer.arcgisDrawingInfo === 'object') {
    return arcgisDrawingInfoStylePack(input.layer.arcgisDrawingInfo as Record<string, unknown>);
  }
  if (input.layer.source === 'arcgis') {
    return arcgisLayerFallbackStylePack(input.layer);
  }
  return resolveSiLayerMapboxStylePack(input.layer);
}

/** Forces Mapbox Source/Layer remount when symbology or appearance changes. */
export function computeSiLayerStyleRevision(
  layer: SiCustomLayerSymbologyFields,
  opts?: {
    draft?: SiSymbologyDraftLike;
    appearance?: SiSymbologyAppearance;
    mapOpacity?: number;
  },
): string {
  const op = opts?.mapOpacity ?? layer.mapOpacity ?? 1;
  const draft = opts?.draft;
  const appearance = opts?.appearance;

  if (draft && appearance && draft.useArcGisOnline !== true) {
    return `pv|${siSymbologyStyleKeyFromConfig(draft, appearance, op)}`;
  }

  if (siLayerShouldUseForcedGlobalStyle(layer)) {
    return `fd|${String(op)}`;
  }

  if (draft && appearance && draft.useArcGisOnline === true && siLayerCanUseArcgisOnlineSymbology(layer)) {
    const fp = arcgisRendererStyleFingerprint(layer.arcgisDrawingInfo);
    const ap = persistedSiAppearance(appearance);
    return [
      'agpv',
      fp,
      ap.color,
      ap.fillColor,
      String(ap.weight),
      String(ap.polygonFillAlpha),
      ap.strokeStyle,
      String(ap.pointRadius),
      String(op),
      draft.field ?? '',
      draft.style ?? '',
      String(draft.classes ?? ''),
      draft.colorRamp ?? '',
    ].join('|');
  }

  if (siLayerShouldUseArcgisDrawingInfo(layer)) {
    const fp = arcgisRendererStyleFingerprint(layer.arcgisDrawingInfo);
    const ap = appearanceFromSiCustomLayerFields(layer);
    return [
      'ag',
      fp,
      ap.color,
      ap.fillColor,
      String(ap.weight),
      String(ap.polygonFillAlpha),
      ap.strokeStyle,
      String(ap.pointRadius),
      String(op),
      layer.symbology?.field ?? '',
      layer.symbology?.style ?? '',
    ].join('|');
  }

  const ap = appearanceFromSiCustomLayerFields(layer);
  return `ps|${siSymbologyStyleKeyFromConfig(layer.symbology, ap, op)}|${ap.strokeStyle}|${String(ap.pointRadius)}|${ap.fillStyle}|${ap.blendMode}|${String(op)}`;
}

export function isGraduatedSymbologyStyle(style: SymbologyStyle): boolean {
  return isGraduatedSymbologyStyleResolved(style);
}

/** Class-break color keys (`__si_class_N`) for graduated Mapbox paints. */
export function buildGraduatedClassColorMap(
  ramp: import('./components/LayerManager').SymbologyColorRamp,
  classCount: number,
): Record<string, string> {
  const classes = clampInt(classCount, 2, 12);
  const palette = sampleRamp(ramp, classes);
  const out: Record<string, string> = {};
  for (let i = 0; i < classes; i += 1) {
    out[siClassColorKey(i)] = palette[i] ?? palette[0] ?? '#94a3b8';
  }
  return out;
}

/**
 * NormalizeSymbologyForLayer drops attribute-drive fields — reattach from draft.
 */
function withSymbologyDraftAttributeDrive<T extends SiSymbologyDraftLike & { arcgisMaxCategories?: number }>(
  normalized: Required<SymbologyConfig>,
  draft: T,
  extra: Partial<Pick<T, 'categoryColors' | 'categoryStyles'>>,
): T {
  return {
    ...normalized,
    arcgisMaxCategories: draft.arcgisMaxCategories,
    attributeTransparency: draft.attributeTransparency,
    attributeRotation: draft.attributeRotation,
    ...extra,
  } as T;
}

/**
 * Normalize + isolate category maps before Apply — prevents Unique Values keys
 * from leaking into Graduated renders (and vice versa).
 */
export function finalizeSymbologyDraftForCommit(
  layer: SiCustomLayerSymbologyFields,
  draft: SiSymbologyDraftWithMeta,
): SiSymbologyDraftWithMeta {
  const canUse = siLayerCanUseArcgisOnlineSymbology(layer);
  const normalized = normalizeSymbologyForLayer(layer.geojson, layer.source, draft, canUse);

  if (normalized.useArcGisOnline) {
    return withSymbologyDraftAttributeDrive(normalized, draft, {
      categoryColors: undefined,
      categoryStyles: undefined,
    });
  }

  if (isGraduatedSymbologyStyle(normalized.style)) {
    const classColors = buildGraduatedClassColorMap(normalized.colorRamp, normalized.classes);
    const incoming = draft.categoryColors ?? {};
    for (const [key, hex] of Object.entries(incoming)) {
      if (key.startsWith('__si_class_') && typeof hex === 'string' && hex.trim()) {
        classColors[key] = hex.trim();
      }
    }
    return withSymbologyDraftAttributeDrive(normalized, draft, {
      categoryColors: classColors,
      categoryStyles: undefined,
    });
  }

  if (normalized.style === 'unique') {
    const pruned = pruneSymbologyCategoryMaps(
      layer.geojson,
      normalized.style,
      normalized.field,
      normalized.classes,
      draft.categoryColors ?? syncCategoryColorsFromStyles(draft.categoryStyles),
      draft.categoryStyles,
      null,
    );
    return withSymbologyDraftAttributeDrive(normalized, draft, {
      categoryColors: pruned.categoryColors ?? syncCategoryColorsFromStyles(pruned.categoryStyles),
      categoryStyles: pruned.categoryStyles,
    });
  }

  return withSymbologyDraftAttributeDrive(normalized, draft, {
    categoryColors: undefined,
    categoryStyles: undefined,
  });
}

export function symbologyConfigFromDraft(
  layer: SiCustomLayerSymbologyFields,
  draft: SiSymbologyDraftLike,
  useArcGisOnline: boolean,
  opts?: { userConfigured?: boolean },
): SymbologyConfig {
  const normalized = normalizeSymbologyForLayer(
    layer.geojson,
    layer.source,
    draft,
    siLayerCanUseArcgisOnlineSymbology(layer),
  );
  let categoryColors: Record<string, string> | undefined;
  let categoryStyles: Record<string, SymbologyCategoryStyle> | undefined;
  if (useArcGisOnline) {
    categoryColors = undefined;
    categoryStyles = undefined;
  } else {
    const pruned = pruneSymbologyCategoryMaps(
      layer.geojson,
      normalized.style,
      normalized.field,
      normalized.classes,
      draft.categoryColors ?? syncCategoryColorsFromStyles(draft.categoryStyles),
      draft.categoryStyles,
      null,
    );
    categoryColors = pruned.categoryColors;
    categoryStyles = pruned.categoryStyles;
  }
  return {
    ...(opts?.userConfigured ? { userConfigured: true as const } : {}),
    useArcGisOnline: useArcGisOnline,
    style: normalized.style,
    field: normalized.field,
    classes: normalized.classes,
    method: normalized.method,
    colorRamp: normalized.colorRamp,
    threshold: normalized.threshold,
    categoryColors,
    categoryStyles,
    attributeTransparency: draft.attributeTransparency,
    attributeRotation: draft.attributeRotation,
  };
}

export type SiSymbologyAppearancePatch = Pick<
  SiCustomLayerSymbologyFields,
  | 'color'
  | 'fillColor'
  | 'weight'
  | 'mapOpacity'
  | 'strokeStyle'
  | 'polygonFillAlpha'
  | 'pointRadius'
  | 'fillStyle'
  | 'blendMode'
>;

export function appearancePatchFromStudio(appearance: SiSymbologyAppearance): SiSymbologyAppearancePatch {
  const ap = persistedSiAppearance(appearance);
  const mapOpacity = ap.opacity;
  const polygonFillAlpha =
    ap.polygonFillAlpha >= 0.04 ? ap.polygonFillAlpha : mapOpacity >= 0.04 ? mapOpacity : ap.polygonFillAlpha;
  return {
    color: ap.color,
    fillColor: ap.fillColor,
    weight: ap.weight,
    mapOpacity,
    strokeStyle: ap.strokeStyle,
    polygonFillAlpha,
    pointRadius: ap.pointRadius,
    fillStyle: ap.fillStyle,
    blendMode: ap.blendMode,
  };
}

/** Live studio + Done: same symbology fields written to the single layer record. */
/** Stable Mapbox source/layer id suffix — new id forces GL to drop cached paints (not just React key). */
export function siMapboxSymbologyInstanceId(layerId: string, styleKey: string): string {
  const slug = styleKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 56);
  return `${layerId}--${slug || 'default'}`;
}

/** Live studio + Done: sync draft → layer record (renderer + symbology flags). */
export function applyLiveSymbologyDraftToLayerState(
  layer: SiCustomLayerSymbologyFields,
  draft: SiSymbologyDraftLike,
  appearance: SiSymbologyAppearance,
): Partial<SiCustomLayerSymbologyFields> {
  const finalized = finalizeSymbologyDraftForCommit(layer, draft as SiSymbologyDraftWithMeta);
  const canUse = siLayerCanUseArcgisOnlineSymbology(layer);
  let bakedDrawingInfo: Record<string, unknown> | undefined;
  if (finalized.useArcGisOnline === true && canUse) {
    const di =
      (layer.arcgisDrawingInfo as Record<string, unknown> | undefined) ??
      (sanitizeArcgisDrawingInfoForClient(
        (layer.arcgisLayerDefinition as { drawingInfo?: unknown } | null | undefined)?.drawingInfo,
      ) as Record<string, unknown> | null);
    const cleaned = di && typeof di === 'object' ? sanitizeArcgisDrawingInfoForClient(di) : null;
    if (cleaned) bakedDrawingInfo = JSON.parse(JSON.stringify(cleaned)) as Record<string, unknown>;
  }
  return {
    ...buildSymbologyLayerStatePatch(layer, finalized, appearance, bakedDrawingInfo),
    symbologyPreview: true,
  };
}

/** Apply button — commits studio draft to layer renderer (Mapbox paints + revision bump). */
export function commitSymbologyStyleToLayerState(
  layer: SiCustomLayerSymbologyFields,
  draft: SiSymbologyDraftWithMeta,
  appearance: SiSymbologyAppearance,
): Partial<SiCustomLayerSymbologyFields> {
  const patch = applyLiveSymbologyDraftToLayerState(layer, draft, appearance);
  const symbology = patch.symbology
    ? { ...patch.symbology, userConfigured: true as const }
    : symbologyConfigFromDraft(layer, finalizeSymbologyDraftForCommit(layer, draft), false, {
        userConfigured: true,
      });
  return {
    ...patch,
    symbology,
    symbologyUseFallback: false,
    symbologyPreview: false,
    useArcGisSymbology: patch.useArcGisSymbology ?? false,
  };
}

export function buildSymbologyLayerStatePatch(
  layer: SiCustomLayerSymbologyFields,
  draft: SiSymbologyDraftLike,
  appearance: SiSymbologyAppearance,
  arcgisDrawingInfo?: Record<string, unknown> | null,
): Partial<SiCustomLayerSymbologyFields> {
  const canUse = siLayerCanUseArcgisOnlineSymbology(layer);
  const useAg = canUse && draft.useArcGisOnline === true;
  const symSave = symbologyConfigFromDraft(layer, draft, useAg);
  const appearancePatch = appearancePatchFromStudio(appearance);
  if (useAg) {
    return {
      ...appearancePatch,
      symbology: symSave,
      useArcGisSymbology: true,
      ...(arcgisDrawingInfo ? { arcgisDrawingInfo } : {}),
    };
  }
  return {
    ...appearancePatch,
    symbology: symSave,
    useArcGisSymbology: false,
    ...(arcgisDrawingInfo !== undefined ? { arcgisDrawingInfo } : {}),
  };
}

export type SiSymbologyDraftWithMeta = SiSymbologyDraftLike & {
  arcgisMaxCategories?: number;
  categoryColors?: Record<string, string>;
  categoryStyles?: Record<string, SymbologyCategoryStyle>;
};

/** Fingerprint of layer data the symbology studio does not own (rename, schema, ArcGIS renderer). */
export function siSymbologyExternalLayerFingerprint(layer: SiCustomLayerSymbologyFields): string {
  const features = Array.isArray(layer.geojson?.features) ? layer.geojson.features.length : 0;
  const fields = getGeoJsonFields(layer.geojson).slice().sort().join('\x1f');
  const name = `${layer.id ?? ''}|${layer.name ?? ''}`;
  const di = arcgisRendererStyleFingerprint(layer.arcgisDrawingInfo);
  const src = layer.sourceUrl?.trim() ?? '';
  return `${name}|${features}|${fields}|${di}|${src}`;
}

function collectUniqueFieldValues(geojson: unknown, field: string, max = 5000): Set<string> {
  const set = new Set<string>();
  const features = Array.isArray((geojson as { features?: unknown[] })?.features)
    ? ((geojson as { features: unknown[] }).features as { properties?: Record<string, unknown> }[])
    : [];
  for (let i = 0; i < Math.min(features.length, max); i += 1) {
    const key = readGeoJsonPropertyString(features[i]?.properties, field);
    if (key) set.add(key);
  }
  return set;
}

function arcgisUniqueValueKeys(drawingInfo: unknown): Set<string> {
  const ren = (drawingInfo as { renderer?: { type?: string; uniqueValueInfos?: { value?: unknown; label?: string }[] } })
    ?.renderer;
  if (!ren || String(ren.type || '') !== 'uniqueValue') return new Set();
  const keys = new Set<string>();
  const infos = Array.isArray(ren.uniqueValueInfos) ? ren.uniqueValueInfos : [];
  for (const uvi of infos) {
    const v = uvi?.value;
    if (v !== null && v !== undefined && String(v).trim() !== '') keys.add(String(v));
    const label = typeof uvi?.label === 'string' ? uvi.label.trim() : '';
    if (label) keys.add(label);
  }
  return keys;
}

/** Drop category keys that no longer exist in data or class slots. */
export function pruneSymbologyCategoryMaps(
  geojson: unknown,
  style: SymbologyStyle,
  field: string,
  classes: number,
  colors?: Record<string, string>,
  styles?: Record<string, SymbologyCategoryStyle>,
  arcgisDrawingInfo?: unknown,
): {
  categoryColors?: Record<string, string>;
  categoryStyles?: Record<string, SymbologyCategoryStyle>;
} {
  const pruneRecord = <T extends Record<string, unknown>>(
    src: T | undefined,
    keep: (k: string) => boolean,
  ): T | undefined => {
    if (!src || typeof src !== 'object') return undefined;
    const out = {} as T;
    let any = false;
    for (const [k, v] of Object.entries(src)) {
      if (!keep(k)) continue;
      (out as Record<string, unknown>)[k] = v;
      any = true;
    }
    return any ? out : undefined;
  };

  if (style === 'unique' && field) {
    const valid = collectUniqueFieldValues(geojson, field);
    for (const k of arcgisUniqueValueKeys(arcgisDrawingInfo)) valid.add(k);
    const keep = (k: string) => valid.has(k);
    return {
      categoryColors: pruneRecord(colors, keep),
      categoryStyles: pruneRecord(styles, keep),
    };
  }

  const classKeys = new Set<string>();
  for (let i = 0; i < classes; i += 1) classKeys.add(`__si_class_${i}`);
  const keepClass = (k: string) => classKeys.has(k);
  return {
    categoryColors: pruneRecord(colors, keepClass),
    categoryStyles: pruneRecord(styles, keepClass),
  };
}

function arcgisMaxCategoriesFromDrawingInfo(drawingInfo: unknown): number {
  const ren = (drawingInfo as { renderer?: { type?: string; uniqueValueInfos?: unknown[]; classBreakInfos?: { maxValue?: unknown }[] } })
    ?.renderer;
  const t = String(ren?.type || '');
  if (t === 'uniqueValue' && Array.isArray(ren?.uniqueValueInfos)) {
    const n = ren.uniqueValueInfos.length;
    return n > 0 ? Math.min(8, n) : 8;
  }
  if (t === 'classBreaks' && Array.isArray(ren?.classBreakInfos)) {
    const n = ren.classBreakInfos.filter(br => Number.isFinite(Number(br?.maxValue))).length;
    return n > 0 ? Math.min(8, n) : 8;
  }
  return 8;
}

/** Build studio draft + appearance when opening symbology or after external layer changes. */
export function symbologyDraftFromLayer(
  layer: SiCustomLayerSymbologyFields,
  opts?: { preserveArcgisMaxCategories?: number },
): { draft: SiSymbologyDraftWithMeta; appearance: SiSymbologyAppearance } {
  const canUse = siLayerCanUseArcgisOnlineSymbology(layer);
  const di = layer.arcgisDrawingInfo;
  const ren = (di as { renderer?: unknown } | null | undefined)?.renderer;
  const savedSym = layer.symbology;
  const resolvedUseArcGisOnline =
    canUse &&
    Boolean(di) &&
    arcgisDrawingInfoSupportsMapboxRender(di) &&
    savedSym?.useArcGisOnline !== false &&
    !(savedSym?.userConfigured === true && savedSym?.useArcGisOnline === false);
  const inferred = inferVisualizationFromArcgisRenderer(ren);
  const base: SymbologyConfig = {
    ...savedSym,
    style: savedSym?.style ?? inferred.style ?? 'single',
    field: savedSym?.field ?? inferred.field ?? '',
    classes: savedSym?.classes ?? inferred.classes ?? 5,
    method: savedSym?.method ?? 'equal-interval',
    colorRamp: savedSym?.colorRamp ?? 'viridis',
    threshold: savedSym?.threshold ?? Number.NaN,
    useArcGisOnline: resolvedUseArcGisOnline,
  };
  const normalized = normalizeSymbologyForLayer(layer.geojson, layer.source, base, canUse);
  let draftColors =
    savedSym?.categoryColors && typeof savedSym.categoryColors === 'object'
      ? { ...savedSym.categoryColors }
      : undefined;
  let draftStyles =
    savedSym?.categoryStyles && typeof savedSym.categoryStyles === 'object'
      ? { ...savedSym.categoryStyles }
      : undefined;
  const pruned = pruneSymbologyCategoryMaps(
    layer.geojson,
    normalized.style,
    normalized.field,
    normalized.classes,
    draftColors,
    draftStyles,
    di,
  );
  draftColors = pruned.categoryColors ?? draftColors;
  draftStyles = pruned.categoryStyles ?? draftStyles;
  const draft: SiSymbologyDraftWithMeta = {
    ...normalized,
    arcgisMaxCategories: opts?.preserveArcgisMaxCategories ?? arcgisMaxCategoriesFromDrawingInfo(di),
    categoryColors: draftColors ?? syncCategoryColorsFromStyles(draftStyles),
    categoryStyles: draftStyles,
    attributeTransparency: sanitizeSiSymbologyAttributeTransparency(savedSym?.attributeTransparency),
    attributeRotation: sanitizeSiSymbologyAttributeRotation(savedSym?.attributeRotation),
  };
  return { draft, appearance: appearanceFromSiCustomLayerFields(layer) };
}

export type ReconcileSymbologyResult = {
  draft: SiSymbologyDraftWithMeta;
  appearance: SiSymbologyAppearance;
  clearCategorySymbolEdit: boolean;
};

/**
 * Merge external layer changes into an open symbology session (rename, sync, schema).
 * Preserves in-progress studio edits when layer record already matches the draft.
 */
export function reconcileSymbologyDraftWithLayer(
  layer: SiCustomLayerSymbologyFields,
  currentDraft: SiSymbologyDraftWithMeta,
  currentAppearance: SiSymbologyAppearance,
): ReconcileSymbologyResult {
  const canUse = siLayerCanUseArcgisOnlineSymbology(layer);
  const layerRev = computeSiLayerStyleRevision(layer);
  const draftRev = computeSiLayerStyleRevision(layer, {
    draft: currentDraft,
    appearance: currentAppearance,
    mapOpacity: layer.mapOpacity,
  });
  const allFields = getGeoJsonFields(layer.geojson);
  const numericFields = getNumericFields(layer.geojson);
  const fieldInvalid =
    currentDraft.style === 'unique'
      ? Boolean(currentDraft.field && !allFields.includes(currentDraft.field))
      : Boolean(currentDraft.field && !numericFields.includes(currentDraft.field));

  if (layerRev === draftRev && !fieldInvalid) {
    const normalized = normalizeSymbologyForLayer(layer.geojson, layer.source, currentDraft, canUse);
    const pruned = pruneSymbologyCategoryMaps(
      layer.geojson,
      normalized.style,
      normalized.field,
      normalized.classes,
      currentDraft.categoryColors,
      currentDraft.categoryStyles,
      layer.arcgisDrawingInfo,
    );
    return {
      draft: {
        ...normalized,
        arcgisMaxCategories: currentDraft.arcgisMaxCategories,
        categoryColors: pruned.categoryColors ?? syncCategoryColorsFromStyles(pruned.categoryStyles),
        categoryStyles: pruned.categoryStyles,
      },
      appearance: currentAppearance,
      clearCategorySymbolEdit: false,
    };
  }

  const rebuilt = symbologyDraftFromLayer(layer, {
    preserveArcgisMaxCategories: currentDraft.arcgisMaxCategories,
  });
  return {
    draft: rebuilt.draft,
    appearance: rebuilt.appearance,
    clearCategorySymbolEdit: true,
  };
}
