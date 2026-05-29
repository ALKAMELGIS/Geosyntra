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
  buildSiForcedDefaultVectorStylePack,
  siLayerShouldUseForcedGlobalStyle,
} from './siGlobalLayerStyleController';
import { normalizeSymbologyForLayer } from './symbologyHelpers';

const SI_MAPBOX_POLY_FILTER: any = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]];
const SI_MAPBOX_LINE_POLY_FILTER: any = [
  'in',
  ['geometry-type'],
  ['literal', ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']],
];
const SI_MAPBOX_LINE_ONLY_FILTER: any = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]];
const SI_MAPBOX_POINT_FILTER: any = ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]];

const SI_ARCGIS_MAPBOX_NEUTRAL_LINE = 'rgba(148, 163, 184, 0.55)';
const SI_ARCGIS_MAPBOX_NEUTRAL_STROKE = 'rgba(15, 23, 42, 0.72)';

export type SiCustomLayerSymbologyFields = {
  id?: string;
  geojson: any;
  visible?: boolean;
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
  return layer.source === 'arcgis';
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

function arcgisDrawingInfoStylePack(di: Record<string, unknown>): SiVectorStylePack {
  const fill = arcgisDrawingInfoToFillPaint(di);
  const line = arcgisDrawingInfoToLinePaint(di, SI_ARCGIS_MAPBOX_NEUTRAL_LINE);
  const circle =
    arcgisDrawingInfoToCirclePaint(di, SI_ARCGIS_MAPBOX_NEUTRAL_LINE) ??
    (defaultArcgisCirclePaint() as Record<string, unknown>);
  if (fill) {
    const linePaintResolved = (line ?? {
      'line-color': SI_ARCGIS_MAPBOX_NEUTRAL_LINE,
      'line-width': 1.75,
      'line-opacity': 0.95,
    }) as Record<string, unknown>;
    return {
      fillFilter: SI_MAPBOX_POLY_FILTER,
      // Always paint polygon outlines via the line layer so hollow ArcGIS fills stay visible.
      lineFilter: SI_MAPBOX_LINE_POLY_FILTER,
      pointFilter: SI_MAPBOX_POINT_FILTER,
      fillPaint: fill as Record<string, unknown>,
      linePaint: linePaintResolved,
      circlePaint: circle,
    };
  }
  return {
    fillFilter: SI_MAPBOX_POLY_FILTER,
    lineFilter: SI_MAPBOX_LINE_POLY_FILTER,
    pointFilter: SI_MAPBOX_POINT_FILTER,
    fillPaint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0 },
    linePaint: (line ?? {
      'line-color': SI_ARCGIS_MAPBOX_NEUTRAL_LINE,
      'line-width': 1.25,
      'line-opacity': 0.85,
    }) as Record<string, unknown>,
    circlePaint: circle,
  };
}

function arcgisLayerFallbackStylePack(layer: SiCustomLayerSymbologyFields): SiVectorStylePack {
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
    linePaint: { 'line-color': stroke, 'line-width': w, 'line-opacity': 0.9 },
    circlePaint: {
      'circle-radius': typeof layer.pointRadius === 'number' ? layer.pointRadius : 4,
      'circle-color': fill,
      'circle-stroke-width': 1,
      'circle-stroke-color': stroke,
    },
  };
}

/** Persisted layer → Mapbox paints (forced hollow black unless user saved symbology). */
export function resolveSiLayerMapboxStylePack(layer: SiCustomLayerSymbologyFields): SiVectorStylePack {
  if (siLayerShouldUseForcedGlobalStyle(layer)) {
    return buildSiForcedDefaultVectorStylePack();
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
    input.draft.useArcGisOnline === true && siLayerCanUseArcgisOnlineSymbology(input.layer);
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

  if (siLayerShouldUseForcedGlobalStyle(layer)) {
    return `fd|${String(op)}`;
  }

  if (draft && appearance && draft.useArcGisOnline !== true) {
    return `pv|${siSymbologyStyleKeyFromConfig(draft, appearance, op)}`;
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
  return {
    ...(opts?.userConfigured ? { userConfigured: true as const } : {}),
    useArcGisOnline: useArcGisOnline,
    style: normalized.style,
    field: normalized.field,
    classes: normalized.classes,
    method: normalized.method,
    colorRamp: normalized.colorRamp,
    threshold: normalized.threshold,
    categoryColors: useArcGisOnline
      ? undefined
      : draft.categoryColors ?? syncCategoryColorsFromStyles(draft.categoryStyles),
    categoryStyles: useArcGisOnline ? undefined : draft.categoryStyles,
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
  return {
    color: ap.color,
    fillColor: ap.fillColor,
    weight: ap.weight,
    mapOpacity: ap.opacity,
    strokeStyle: ap.strokeStyle,
    polygonFillAlpha: ap.polygonFillAlpha,
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
  const canUse = siLayerCanUseArcgisOnlineSymbology(layer);
  let bakedDrawingInfo: Record<string, unknown> | undefined;
  if (draft.useArcGisOnline === true && canUse) {
    const di =
      (layer.arcgisDrawingInfo as Record<string, unknown> | undefined) ??
      (sanitizeArcgisDrawingInfoForClient(
        (layer.arcgisLayerDefinition as { drawingInfo?: unknown } | null | undefined)?.drawingInfo,
      ) as Record<string, unknown> | null);
    const cleaned = di && typeof di === 'object' ? sanitizeArcgisDrawingInfoForClient(di) : null;
    if (cleaned) bakedDrawingInfo = JSON.parse(JSON.stringify(cleaned)) as Record<string, unknown>;
  }
  return buildSymbologyLayerStatePatch(layer, draft, appearance, bakedDrawingInfo);
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
