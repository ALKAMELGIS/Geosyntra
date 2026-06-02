import type { Map as MapboxMap } from 'mapbox-gl';
import { arcgisSymbologyLikelyInvisibleForGeoJson } from '../../../lib/arcgisSymbologyGeoJsonProbe';
import { arcgisLayerFullExtentBounds } from '../../../lib/arcgisFeatureLayerClient';
import { getGeoJsonBounds } from '../../../lib/geoJsonBounds';
import { arcgisDrawingInfoSupportsMapboxRender } from '../../../lib/arcgisDrawingInfoMapbox';
import {
  detectSiLayerHeightExtrusionField,
  enforceSiLayerForcedStyleRecord,
  ensureSiCustomLayerMapVisible,
  forcedStyleVariantForLayer,
  getSiDefaultArcgisLayerSymbology,
  getSiForcedDefaultSymbology,
  resolveSiForcedDefaultStylePackForLayer,
  SI_3D_BUILDING_FILL,
  SI_3D_BUILDING_STROKE,
  siLayerQualifiesFor3dBuildingDefaultStyle,
  SI_FORCED_LAYER_STROKE,
} from '../siGlobalLayerStyleController';
import {
  arcgisDrawingInfoStylePack,
  arcgisLayerFallbackStylePack,
  computeSiLayerStyleRevision,
  resolveSiLayerMapboxStylePack,
  siLayerCanUseArcgisOnlineSymbology,
  siLayerShouldUseArcgisDrawingInfo,
  siMapboxSymbologyInstanceId,
  type SiCustomLayerSymbologyFields,
  type SiVectorStylePack,
} from '../siLayerSymbologyEngine';
import type { LayerLabelConfig } from '../layerTypes';
import { computeSiLayerLabelRevision } from './siLayerLabelsEngine';
import type { SiSymbologyAppearance, SiSymbologyDraftLike } from '../siSymbolStyleStudio';
import { delayMs, waitForMapboxRasterSettle, waitForReactPaint } from './siMapRenderSync';
import { syncSiMapOverlayLayerStack } from './siMapCustomVectorLayerStack';
import { isSiBimRenderLayer } from './siIfcBimTypes';
import { removeAllMapboxMountsForAppLayerId } from './siMapLayerMapboxMountCleanup';

export type SiCustomLayerLoadStatus = 'idle' | 'loading' | 'loaded' | 'empty' | 'failed';

export type SiCustomLayerMapMeta = {
  loadStatus?: SiCustomLayerLoadStatus;
  extentBounds?: [number, number, number, number] | null;
  mapRenderRevision?: number;
  symbologyUseFallback?: boolean;
  lastMapSyncAt?: number;
  lastMapSyncError?: string | null;
};

export type SiCustomLayerRegistryFields = SiCustomLayerSymbologyFields &
  SiCustomLayerMapMeta & {
    id: string;
    name: string;
    visible?: boolean;
    geojson?: unknown;
    source?: string;
    arcgisLayerDefinition?: unknown;
    renderMode?: 'vector' | 'raster' | 'bim';
    labels?: LayerLabelConfig | null;
  };

export type SiLayerMapDiagnosticRow = {
  id: string;
  name: string;
  visible: boolean;
  loadStatus: SiCustomLayerLoadStatus;
  graphicsCount: number;
  layerViewStatus: string;
  currentScale: string;
  currentExtent: string;
  mapboxLayerIds: string;
  symbology: string;
  lastError: string;
};

const SI_MAP_RENDER_RETRY_MAX = 3;

export function countGeoJsonFeatures(geojson: unknown): number {
  if (!geojson || typeof geojson !== 'object') return 0;
  const feats = (geojson as { features?: unknown[] }).features;
  return Array.isArray(feats) ? feats.length : 0;
}

export const SI_CUSTOM_LAYER_HEIGHT_FIELDS = ['height_fin', 'height', 'HEIGHT', 'Height'] as const;

/** Detect a numeric height attribute suitable for fill-extrusion (matches map canvas render). */
export function detectSiCustomLayerHeightExtrusionField(
  layer: Pick<SiCustomLayerRegistryFields, 'geojson'>,
  opts?: { elevation3d?: boolean },
): string | null {
  return detectSiLayerHeightExtrusionField(layer, opts);
}

export function shouldSiCustomLayerUseHeightExtrusion(
  layer: SiCustomLayerRegistryFields,
  elevation3d: boolean,
): boolean {
  if (!elevation3d) return false;
  if (isSiBimRenderLayer(layer)) return true;
  return detectSiCustomLayerHeightExtrusionField(layer, { elevation3d: true }) != null;
}

/** Uploaded / vector building layers with a numeric height attribute (not IFC BIM). */
export function siCustomLayerQualifiesForHeightExtrusionDefaultStyle(
  layer: Pick<SiCustomLayerRegistryFields, 'geojson' | 'renderMode' | 'bimModelId'>,
): boolean {
  return siLayerQualifiesFor3dBuildingDefaultStyle(layer);
}

export type SiCustomLayerMapMountOptions = {
  /** When true, polygon layers with height attributes mount as fill-extrusion (3D). */
  elevation3d?: boolean;
  /** Apply the global forced visible style pack (ignores invisible ArcGIS / empty paints). */
  forceVisiblePaints?: boolean;
};

export function resolveSiCustomLayerMountOpts(
  layer: SiCustomLayerRegistryFields,
  opts?: SiCustomLayerMapMountOptions,
): SiCustomLayerMapMountOptions {
  return {
    ...opts,
    forceVisiblePaints:
      opts?.forceVisiblePaints ??
      (layer.symbology?.userConfigured !== true &&
        (layer as { symbologyPreview?: boolean }).symbologyPreview !== true &&
        layer.visible !== false),
  };
}

function resolveSiLayerMapboxStylePackForMount(
  layer: SiCustomLayerSymbologyFields,
  opts?: SiCustomLayerMapMountOptions,
): SiVectorStylePack {
  if (opts?.forceVisiblePaints) return resolveSiForcedDefaultStylePackForLayer(layer);
  const resolved = resolveSiLayerMapboxStylePackForMap(layer);
  if (siVectorStylePackLikelyInvisible(resolved)) return resolveSiForcedDefaultStylePackForLayer(layer);
  return resolved;
}

function siMapStyleReady(map: MapboxMap | null | undefined): map is MapboxMap {
  try {
    return Boolean(map?.getStyle?.()?.layers);
  } catch {
    return false;
  }
}

function siSafeMapGetLayer(
  map: MapboxMap,
  layerId: string,
): ReturnType<MapboxMap['getLayer']> | undefined {
  try {
    if (!siMapStyleReady(map)) return undefined;
    return map.getLayer(layerId) ?? undefined;
  } catch {
    return undefined;
  }
}

/** True when the layer has the Mapbox layers required for its current render mode. */
export function isSiCustomLayerPaintedOnMap(
  map: MapboxMap | null | undefined,
  layer: SiCustomLayerRegistryFields,
  opts?: SiCustomLayerMapMountOptions,
): boolean {
  if (!map || layer.visible === false) return false;
  if (!siMapStyleReady(map)) return false;
  try {
    const fc = countGeoJsonFeatures(layer.geojson);
    if (fc === 0 && layer.renderMode !== 'raster' && layer.renderMode !== 'bim') return false;
    if (!layerMapboxLayersPresent(map, layer)) return false;

    const instanceId =
      findMapboxInstanceIdForAppLayer(map, layer.id, customLayerMapboxSourceId(layer)) ??
      customLayerMapboxSourceId(layer);
    const elevation3d = opts?.elevation3d ?? false;
    if (shouldSiCustomLayerUseHeightExtrusion(layer, elevation3d)) {
      return Boolean(siSafeMapGetLayer(map, `${instanceId}-extrusion`));
    }

    const fillId = `${instanceId}-fill`;
    const lineId = `${instanceId}-line`;
    const circleId = `${instanceId}-circle`;
    const hasFlatGeometry =
      Boolean(siSafeMapGetLayer(map, fillId)) ||
      Boolean(siSafeMapGetLayer(map, lineId)) ||
      Boolean(siSafeMapGetLayer(map, circleId));
    if (!hasFlatGeometry) return false;

    const st = resolveSiLayerMapboxStylePackForMap(layer);
    if (siVectorStylePackLikelyInvisible(st)) return false;

    // After 3D → 2D, extrusion mounts can leave fill-opacity at 0 while Mapbox layers still exist.
    if (!elevation3d) {
      try {
        const readOp = (layerId: string, key: string): number | null => {
          if (!siSafeMapGetLayer(map, layerId)) return null;
          const raw = map.getPaintProperty(layerId, key);
          if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
          return paintOpacityValue(raw);
        };
        const fillOp = readOp(fillId, 'fill-opacity');
        const lineOp = readOp(lineId, 'line-opacity');
        const circleOp = readOp(circleId, 'circle-opacity');
        const extrusionOp = readOp(`${instanceId}-extrusion`, 'fill-extrusion-opacity');
        const hasExtrusion = Boolean(siSafeMapGetLayer(map, `${instanceId}-extrusion`));
        const flatVisible =
          (fillOp != null && fillOp > 0.04) ||
          (lineOp != null && lineOp > 0.04) ||
          (circleOp != null && circleOp > 0.04);
        if (hasExtrusion && !flatVisible) return false;
        if (hasExtrusion && fillOp != null && fillOp <= 0.04 && (lineOp == null || lineOp <= 0.04)) {
          return false;
        }
        const knownOps = [fillOp, lineOp, circleOp].filter((v): v is number => v != null);
        if (knownOps.length > 0 && knownOps.every(v => v <= 0.04)) return false;
        if (knownOps.length === 0 && !flatVisible) return false;
        if (hasExtrusion && extrusionOp != null && extrusionOp <= 0.04 && !flatVisible) return false;
      } catch {
        /* layer mid-remount */
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function computeCustomLayerExtentBounds(
  layer: Pick<SiCustomLayerRegistryFields, 'geojson' | 'arcgisLayerDefinition' | 'extentBounds'>,
): [number, number, number, number] | null {
  if (layer.extentBounds && layer.extentBounds.length === 4) {
    const [a, b, c, d] = layer.extentBounds;
    if ([a, b, c, d].every(n => Number.isFinite(n))) return layer.extentBounds;
  }
  const fromFeatures = getGeoJsonBounds(layer.geojson);
  if (fromFeatures) return fromFeatures;
  return arcgisLayerFullExtentBounds(layer.arcgisLayerDefinition) ?? null;
}

function arcgisSymbologyNeedsVisibleFallback(layer: SiCustomLayerRegistryFields): boolean {
  if (layer.symbology?.userConfigured === true) return false;
  return (
    Boolean(layer.arcgisDrawingInfo) &&
    siLayerShouldUseArcgisDrawingInfo(layer) &&
    arcgisSymbologyLikelyInvisibleForGeoJson(layer.arcgisDrawingInfo, layer.geojson)
  );
}

/** Force visibility + opacity before persistence / map insert. */
export function prepareCustomLayerForMap<T extends SiCustomLayerRegistryFields>(layer: T): T {
  if (layer.symbology?.userConfigured === true) {
    return ensureSiCustomLayerMapVisible({
      ...layer,
      visible: layer.visible !== false,
      symbologyUseFallback: false,
      mapOpacity:
        typeof layer.mapOpacity === 'number' && Number.isFinite(layer.mapOpacity)
          ? Math.max(0.05, Math.min(1, layer.mapOpacity))
          : 1,
      loadStatus: layer.loadStatus ?? (countGeoJsonFeatures(layer.geojson) > 0 ? 'loaded' : 'empty'),
      mapRenderRevision: layer.mapRenderRevision ?? 0,
      lastMapSyncError: layer.lastMapSyncError ?? null,
    }) as T;
  }

  const styleVariant = forcedStyleVariantForLayer(layer);
  let styled = enforceSiLayerForcedStyleRecord(
    layer,
    styleVariant === '3d-building' ? { variant: '3d-building' } : undefined,
  ) as T;
  const symbologyUseFallback = arcgisSymbologyNeedsVisibleFallback(styled);
  if (symbologyUseFallback) {
    styled = enforceSiLayerForcedStyleRecord(
      {
        ...styled,
        useArcGisSymbology: false,
        symbologyUseFallback: true,
      },
      styleVariant === '3d-building' ? { variant: '3d-building' } : undefined,
    ) as T;
  }

  const fc = countGeoJsonFeatures(styled.geojson);
  const extentBounds = computeCustomLayerExtentBounds(styled);
  const loadStatus: SiCustomLayerLoadStatus =
    styled.loadStatus === 'loading'
      ? 'loading'
      : fc > 0
        ? 'loaded'
        : styled.source === 'arcgis'
          ? 'empty'
          : fc === 0
            ? 'empty'
            : 'loaded';

  return ensureSiCustomLayerMapVisible({
    ...styled,
    visible: styled.visible !== false,
    mapOpacity:
      typeof styled.mapOpacity === 'number' && Number.isFinite(styled.mapOpacity)
        ? Math.max(0.05, Math.min(1, styled.mapOpacity))
        : 1,
    loadStatus,
    extentBounds,
    symbologyUseFallback:
      styled.symbology?.userConfigured === true
        ? false
        : symbologyUseFallback || Boolean(styled.symbologyUseFallback),
    mapRenderRevision: styled.mapRenderRevision ?? 0,
    lastMapSyncError: styled.lastMapSyncError ?? null,
  }) as T;
}

function isMapboxDataDrivenPaint(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && typeof value[0] === 'string';
}

function paintOpacityValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const rgba = value.match(/rgba?\([^)]+\)/i);
    if (rgba) {
      const parts = rgba[0].replace(/rgba?\(|\)/g, '').split(',').map(s => s.trim());
      if (parts.length === 4) {
        const a = Number(parts[3]);
        return Number.isFinite(a) ? a : null;
      }
    }
  }
  return null;
}

/** True when Mapbox paints from this pack would be invisible on the basemap. */
export function siVectorStylePackLikelyInvisible(pack: SiVectorStylePack): boolean {
  const fillOp = paintOpacityValue(pack.fillPaint['fill-opacity']);
  const fillColorOp = paintOpacityValue(pack.fillPaint['fill-color']);
  const lineOp = paintOpacityValue(pack.linePaint['line-opacity']);
  const circleOp = paintOpacityValue(pack.circlePaint['circle-opacity']);
  const fillIsExpr = isMapboxDataDrivenPaint(pack.fillPaint['fill-color']);
  const fillVisible = fillIsExpr || (fillOp ?? fillColorOp ?? 0) > 0.04;
  const lineVisible = (lineOp ?? 0) > 0.04;
  const pointVisible = (circleOp ?? 0) > 0.04;
  return !fillVisible && !lineVisible && !pointVisible;
}

/** Mapbox fill-extrusion paints from the same style pack as 2D fill (supports ramps / unique / class breaks). */
export function buildSiHeightExtrusionPaint(
  stylePack: SiVectorStylePack,
  layer: Pick<SiCustomLayerSymbologyFields, 'fillColor' | 'color' | 'mapOpacity'>,
  mapOpacityFactor: number,
): Record<
  'fill-extrusion-color' | 'fill-extrusion-opacity' | 'fill-extrusion-vertical-gradient',
  unknown
> {
  const fillColor = stylePack.fillPaint['fill-color'];
  const lineColor = stylePack.linePaint['line-color'];
  const fillOpacity = paintOpacityValue(stylePack.fillPaint['fill-opacity']);
  const lineOpacity = paintOpacityValue(stylePack.linePaint['line-opacity']);
  const fillIsExpr = isMapboxDataDrivenPaint(fillColor);
  const lineIsExpr = isMapboxDataDrivenPaint(lineColor);
  let extrusionColor: unknown;
  if (
    fillColor != null &&
    fillColor !== 'rgba(0,0,0,0)' &&
    (fillIsExpr || (fillOpacity ?? 1) > 0.04)
  ) {
    extrusionColor = fillColor;
  } else if (lineColor != null && (lineIsExpr || (lineOpacity ?? 1) > 0.04)) {
    extrusionColor = lineColor;
  } else {
    extrusionColor = layer.fillColor ?? layer.color ?? SI_FORCED_LAYER_STROKE;
  }
  const op = Math.max(0.05, Math.min(1, mapOpacityFactor));
  const transparentFootprint =
    !fillIsExpr &&
    ((fillOpacity ?? 1) <= 0.04 || fillColor === 'rgba(0,0,0,0)');
  const extrusionOpacity = op >= 0.999 ? 1 : op;
  return {
    'fill-extrusion-color': extrusionColor,
    'fill-extrusion-opacity': extrusionOpacity,
    'fill-extrusion-vertical-gradient': transparentFootprint ? false : true,
  };
}

/** Hide the flat fill under 3D walls so semi-transparent 2D fill does not show through extrusion. */
export function siFillPaintHiddenUnderExtrusion(fillPaint: Record<string, unknown>): Record<string, unknown> {
  return { ...fillPaint, 'fill-opacity': 0 };
}

/** Solid BIM / service extrusion opacity — no arbitrary 0.82–0.88 cap at full layer opacity. */
export function siBimExtrusionOpacity(mapOpacityFactor: number): number {
  const op = Math.max(0.05, Math.min(1, mapOpacityFactor));
  return op >= 0.999 ? 1 : op;
}

/**
 * Map canvas display paints — independent of Symbology studio draft / unpersisted fields.
 * Uses ArcGIS service drawingInfo or the global forced visible pack only.
 */
export function resolveVisibleSiLayerMapboxStylePackForMap(layer: SiCustomLayerSymbologyFields): SiVectorStylePack {
  const di = layer.arcgisDrawingInfo;
  const arcgisRenderable =
    Boolean(di) &&
    arcgisDrawingInfoSupportsMapboxRender(di) &&
    !arcgisSymbologyLikelyInvisibleForGeoJson(di, layer.geojson);
  const useArcgisServiceColors =
    arcgisRenderable &&
    (layer.source === 'arcgis' || layer.useArcGisSymbology === true || layer.symbology?.useArcGisOnline === true);

  if (layer.symbologyUseFallback || !useArcgisServiceColors) {
    return resolveSiForcedDefaultStylePackForLayer(layer);
  }
  return arcgisDrawingInfoStylePack(di as Record<string, unknown>);
}

function arcgisDrawingInfoRenderableForLayer(layer: SiCustomLayerRegistryFields): boolean {
  const di = layer.arcgisDrawingInfo;
  return (
    Boolean(di) &&
    arcgisDrawingInfoSupportsMapboxRender(di) &&
    !arcgisSymbologyLikelyInvisibleForGeoJson(di, layer.geojson)
  );
}

/**
 * Default display state when a layer is added or re-shown — independent of the Symbology Apply path.
 * ArcGIS Online layers use service drawingInfo colors; everything else gets a visible forced style.
 */
export function buildInitialCustomLayerDisplayPatch<T extends SiCustomLayerRegistryFields>(
  layer: T,
): Partial<T> {
  if (layer.symbology?.userConfigured === true) {
    return { visible: true };
  }

  const canUseArcgis = siLayerCanUseArcgisOnlineSymbology(layer);
  const useArcgisServiceColors =
    canUseArcgis &&
    arcgisDrawingInfoRenderableForLayer(layer) &&
    (layer.source === 'arcgis' ||
      layer.useArcGisSymbology === true ||
      layer.symbology?.useArcGisOnline === true);

  if (useArcgisServiceColors) {
    return {
      visible: true,
      useArcGisSymbology: true,
      symbologyUseFallback: false,
      symbology: getSiDefaultArcgisLayerSymbology(),
      arcgisDrawingInfo: layer.arcgisDrawingInfo ?? undefined,
    } as Partial<T>;
  }

  const forced = enforceSiLayerForcedStyleRecord(
    {
      ...layer,
      useArcGisSymbology: false,
      symbologyUseFallback: true,
      symbology: getSiForcedDefaultSymbology(),
    },
    forcedStyleVariantForLayer(layer) === '3d-building' ? { variant: '3d-building' } : undefined,
  );
  return {
    visible: true,
    useArcGisSymbology: false,
    symbologyUseFallback: true,
    symbology: getSiForcedDefaultSymbology(),
    color: forced.color,
    fillColor: forced.fillColor,
    weight: forced.weight,
    polygonFillAlpha: forced.polygonFillAlpha,
    pointRadius: forced.pointRadius,
  } as Partial<T>;
}

/** Initialize layer record for immediate map paint (add / toggle visible / map ready). Never applies studio draft. */
export function initializeCustomLayerDisplayState<T extends SiCustomLayerRegistryFields>(layer: T): T {
  let prepared = prepareCustomLayerForMap({ ...layer, visible: true });
  const heightField = detectSiCustomLayerHeightExtrusionField(prepared, { elevation3d: true });
  if (heightField) {
    prepared = {
      ...prepared,
      fillColor: prepared.fillColor || SI_3D_BUILDING_FILL,
      color: prepared.color || SI_3D_BUILDING_STROKE,
    } as T;
  }
  if (prepared.symbology?.userConfigured === true) {
    return bumpCustomLayerMapRenderRevision(prepared);
  }
  const displayPatch = buildInitialCustomLayerDisplayPatch(prepared);
  prepared = prepareCustomLayerForMap({
    ...prepared,
    ...displayPatch,
    visible: true,
    symbology: displayPatch.symbology ?? prepared.symbology,
  });
  return bumpCustomLayerMapRenderRevision(prepared);
}

/** @deprecated Use {@link initializeCustomLayerDisplayState} — kept for existing call sites. */
export function materializeCustomLayerRendererForDisplay<T extends SiCustomLayerRegistryFields>(layer: T): T {
  return initializeCustomLayerDisplayState(layer);
}

/** Prepare + bump render revision so Mapbox remounts immediately after add. */
export function stageCustomLayerForImmediateDisplay<T extends SiCustomLayerRegistryFields>(layer: T): T {
  return materializeCustomLayerRendererForDisplay(layer);
}

export function appendPreparedCustomLayers<T extends SiCustomLayerRegistryFields>(
  prev: T[],
  ...incoming: T[]
): T[] {
  return [...prev, ...incoming.map(l => stageCustomLayerForImmediateDisplay(l))];
}

/** Mapbox-safe symbology — falls back when ArcGIS renderer fields do not match GeoJSON. */
export function resolveSiLayerMapboxStylePackForMap(layer: SiCustomLayerSymbologyFields): SiVectorStylePack {
  if (layer.symbology?.userConfigured !== true && layer.symbologyPreview !== true) {
    return resolveVisibleSiLayerMapboxStylePackForMap(layer);
  }
  const resolved = resolveSiLayerMapboxStylePack(layer);
  return siVectorStylePackLikelyInvisible(resolved)
    ? resolveSiForcedDefaultStylePackForLayer(layer)
    : resolved;
}

export function buildLayerExtentBoundaryGeoJson(
  bounds: [number, number, number, number],
  layerId: string,
): GeoJSON.FeatureCollection {
  const [minX, minY, maxX, maxY] = bounds;
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: 'layer_extent', layerId },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [minX, minY],
              [maxX, minY],
              [maxX, maxY],
              [minX, maxY],
              [minX, minY],
            ],
          ],
        },
      },
    ],
  };
}

/** Same key string as Mapbox `<Source>` / `<Layer>` ids in SatelliteIntelligenceMain render. */
export function buildCustomLayerMapboxStyleKey(
  layer: SiCustomLayerSymbologyFields & { labels?: LayerLabelConfig | null },
  opts?: {
    mapOpacity?: number;
    draft?: SiSymbologyDraftLike;
    appearance?: SiSymbologyAppearance;
    labelsDraft?: LayerLabelConfig | null;
    /** Keep one GL mount while symbology studio edits colors (paint-only refresh). */
    symbologyStudioLive?: boolean;
  },
): string {
  const labelRev = computeSiLayerLabelRevision(opts?.labelsDraft ?? layer.labels);
  if (opts?.symbologyStudioLive) {
    const op = opts?.mapOpacity ?? layer.mapOpacity ?? 1;
    return `sp-stable|${layer.id}|o${String(op)}|${labelRev}`;
  }
  const op = opts?.mapOpacity ?? layer.mapOpacity ?? 1;
  const rev = computeSiLayerStyleRevision(
    layer,
    opts?.draft && opts?.appearance
      ? { draft: opts.draft, appearance: opts.appearance, mapOpacity: op }
      : { mapOpacity: op },
  );
  return `${rev}|r${layer.mapRenderRevision ?? 0}|${labelRev}`;
}

/** Reuse any existing Mapbox GeoJSON source for this app layer (avoids teardown on preview). */
export function findMapboxInstanceIdForAppLayer(
  map: MapboxMap,
  appLayerId: string,
  preferredInstanceId?: string,
): string | null {
  if (preferredInstanceId) {
    try {
      if (map.getSource(preferredInstanceId)) return preferredInstanceId;
    } catch {
      /* style unavailable */
    }
  }
  const prefix = `${appLayerId}--`;
  try {
    for (const sid of Object.keys(map.getStyle()?.sources ?? {})) {
      if (sid.startsWith(prefix)) return sid;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Symbology studio live preview — update paints/filters on the current mount only
 * (no removeSource / removeLayer / React key churn).
 */
export function patchCustomLayerSymbologyPaintsOnMap(
  map: MapboxMap,
  layer: SiCustomLayerRegistryFields,
  opts?: SiCustomLayerMapMountOptions,
  stylePackOverride?: SiVectorStylePack,
): boolean {
  if (layer.visible === false || !siMapStyleReady(map)) return false;
  const fc = countGeoJsonFeatures(layer.geojson);
  if (fc === 0 && layer.renderMode !== 'raster' && layer.renderMode !== 'bim') return false;

  const mountOpts = resolveSiCustomLayerMountOpts(layer, opts);
  const preferredId = customLayerMapboxSourceId(layer);
  const instanceId = findMapboxInstanceIdForAppLayer(map, layer.id, preferredId);
  if (!instanceId) {
    return ensureSiCustomLayerMapboxMount(map, layer, mountOpts);
  }

  const elevation3d = mountOpts.elevation3d ?? false;
  const st = stylePackOverride ?? resolveSiLayerMapboxStylePackForMount(layer, mountOpts);
  const op = Math.max(0.05, Math.min(1, layer.mapOpacity ?? 1));
  const fillPaint = scaleMapboxPaintOpacity(st.fillPaint as Record<string, unknown>, op);
  const linePaint = scaleMapboxPaintOpacity(st.linePaint as Record<string, unknown>, op);
  const circlePaint = scaleMapboxPaintOpacity(st.circlePaint as Record<string, unknown>, op);
  const extrusionPaint = buildSiHeightExtrusionPaint(st, layer, op);
  const fillPaintUnderExtrusion = siFillPaintHiddenUnderExtrusion(fillPaint);
  const heightField = detectSiCustomLayerHeightExtrusionField(layer, { elevation3d });
  const useHeightExtrusion = !isSiBimRenderLayer(layer) && elevation3d && Boolean(heightField);
  const fillId = `${instanceId}-fill`;
  const lineId = `${instanceId}-line`;
  const circleId = `${instanceId}-circle`;
  const extrusionId = `${instanceId}-extrusion`;

  try {
    if (useHeightExtrusion) {
      if (!siSafeMapGetLayer(map, extrusionId)) {
        return ensureSiCustomLayerMapboxMount(map, layer, mountOpts);
      }
      applyMapboxLayerPaints(map, extrusionId, {
        ...extrusionPaint,
        'fill-extrusion-height': ['coalesce', ['to-number', ['get', heightField!]], 3],
      });
      applyMapboxLayerFilters(map, fillId, st.fillFilter);
      applyMapboxLayerFilters(map, lineId, st.lineFilter);
      applyMapboxLayerFilters(map, circleId, st.pointFilter);
      applyMapboxLayerPaints(map, fillId, fillPaintUnderExtrusion);
      applyMapboxLayerPaints(map, lineId, linePaint);
      applyMapboxLayerPaints(map, circleId, circlePaint);
    } else {
      if (!siSafeMapGetLayer(map, fillId) && !siSafeMapGetLayer(map, lineId) && !siSafeMapGetLayer(map, circleId)) {
        return ensureSiCustomLayerMapboxMount(map, layer, mountOpts);
      }
      applyMapboxLayerFilters(map, fillId, st.fillFilter);
      applyMapboxLayerFilters(map, lineId, st.lineFilter);
      applyMapboxLayerFilters(map, circleId, st.pointFilter);
      applyMapboxLayerPaints(map, fillId, fillPaint);
      applyMapboxLayerPaints(map, lineId, linePaint);
      applyMapboxLayerPaints(map, circleId, circlePaint);
    }
    syncSiMapOverlayLayerStack(map);
    return true;
  } catch {
    return ensureSiCustomLayerMapboxMount(map, layer, mountOpts);
  }
}

export function customLayerMapboxStyleKey(layer: SiCustomLayerRegistryFields): string {
  return buildCustomLayerMapboxStyleKey(layer, {
    mapOpacity: layer.mapOpacity ?? 1,
    symbologyStudioLive: layer.symbologyPreview === true,
  });
}

export function customLayerMapboxSourceId(layer: SiCustomLayerRegistryFields): string {
  return siMapboxSymbologyInstanceId(layer.id, customLayerMapboxStyleKey(layer));
}

export function customLayerMapboxInstanceIds(layer: SiCustomLayerRegistryFields): string[] {
  const instanceId = customLayerMapboxSourceId(layer);
  if (isSiBimRenderLayer(layer)) {
    return [`${instanceId}-extrusion`, `${instanceId}-fill`, `${instanceId}-line`];
  }
  return [
    `${instanceId}-fill`,
    `${instanceId}-line`,
    `${instanceId}-circle`,
    `${instanceId}-cluster`,
  ];
}

export function layerMapboxLayersPresent(map: MapboxMap, layer: SiCustomLayerRegistryFields): boolean {
  /** Any symbology revision shares `{appLayerId}--` — do not key off current style slug. */
  const prefix = `${layer.id}--`;
  try {
    const styleLayers = map.getStyle()?.layers;
    if (!styleLayers?.length) return false;
    return styleLayers.some(l => l.id.startsWith(prefix));
  } catch {
    const instanceId =
      findMapboxInstanceIdForAppLayer(map, layer.id, customLayerMapboxSourceId(layer)) ??
      customLayerMapboxSourceId(layer);
    const ids = [
      `${instanceId}-fill`,
      `${instanceId}-line`,
      `${instanceId}-circle`,
      `${instanceId}-extrusion`,
      `${instanceId}-cluster`,
    ];
    return ids.some(id => {
      try {
        return Boolean(map.getLayer(id));
      } catch {
        return false;
      }
    });
  }
}

export function logSiCustomLayerDiagnostics(
  layer: SiCustomLayerRegistryFields,
  map: MapboxMap | null,
  extra?: Record<string, unknown>,
): void {
  const fc = countGeoJsonFeatures(layer.geojson);
  const bounds = computeCustomLayerExtentBounds(layer);
  const present = map ? layerMapboxLayersPresent(map, layer) : false;
  console.info('[si-map][layer]', {
    id: layer.id,
    name: layer.name,
    loadStatus: layer.loadStatus ?? 'idle',
    visible: layer.visible !== false,
    mapOpacity: layer.mapOpacity ?? 1,
    graphicsCount: fc,
    fullExtent: bounds,
    layerViewStatus: present ? 'mounted' : fc > 0 && layer.visible !== false ? 'missing' : 'n/a',
    symbologyFallback: layer.symbologyUseFallback ?? false,
    ...extra,
  });
}

export function buildSiLayerMapDiagnosticRow(
  layer: SiCustomLayerRegistryFields,
  map: MapboxMap | null,
  mapScale?: number,
  mapExtent?: [number, number, number, number] | null,
): SiLayerMapDiagnosticRow {
  const fc = countGeoJsonFeatures(layer.geojson);
  const bounds = computeCustomLayerExtentBounds(layer);
  const present = map && layer.visible !== false && fc > 0 ? layerMapboxLayersPresent(map, layer) : false;
  let layerViewStatus = 'n/a';
  if (layer.visible === false) layerViewStatus = 'hidden';
  else if (layer.loadStatus === 'loading') layerViewStatus = 'loading';
  else if (fc === 0) layerViewStatus = layer.source === 'arcgis' ? 'awaiting-data' : 'empty';
  else if (present) layerViewStatus = 'ready';
  else layerViewStatus = 'missing';

  return {
    id: layer.id,
    name: layer.name,
    visible: layer.visible !== false,
    loadStatus: layer.loadStatus ?? (fc > 0 ? 'loaded' : 'empty'),
    graphicsCount: fc,
    layerViewStatus,
    currentScale: mapScale != null && Number.isFinite(mapScale) ? mapScale.toFixed(0) : '—',
    currentExtent: bounds
      ? `${bounds[0].toFixed(3)},${bounds[1].toFixed(3)} → ${bounds[2].toFixed(3)},${bounds[3].toFixed(3)}`
      : '—',
    mapboxLayerIds: present ? 'on-map' : '—',
    symbology: layer.symbologyUseFallback ? 'fallback' : layer.useArcGisSymbology ? 'arcgis' : 'app',
    lastError: layer.lastMapSyncError ?? '',
  };
}

export function triggerSiMapLayerRenderSync(map: MapboxMap | null): void {
  if (!map) return;
  try {
    syncSiMapOverlayLayerStack(map);
    map.triggerRepaint?.();
  } catch (e) {
    console.warn('[si-map] render sync failed', e);
  }
}

/**
 * Imperative LayerView refresh: apply paints, pin above basemap/WMS, request repaint.
 * Call after React commits `<Source>` / on `sourcedata` / `idle` (ArcGIS `view.requestRender`).
 */
export function flushSiCustomLayerOnMapCanvas(
  map: MapboxMap | null | undefined,
  layer: SiCustomLayerRegistryFields,
  opts?: SiCustomLayerMapMountOptions,
): void {
  if (!map?.getStyle?.() || layer.visible === false) return;
  const fc = countGeoJsonFeatures(layer.geojson);
  if (fc === 0 && layer.renderMode !== 'raster' && layer.renderMode !== 'bim') return;
  const mountOpts = resolveSiCustomLayerMountOpts(layer, opts);
  try {
    ensureSiCustomLayerMapboxMount(map, layer, mountOpts);
    syncSiMapOverlayLayerStack(map);
    triggerSiMapLayerRenderSync(map);
  } catch {
    /* map mid-style rebuild */
  }
}

function applyMapboxLayerPaints(
  map: MapboxMap,
  layerId: string,
  paint: Record<string, unknown>,
): void {
  try {
    if (!siSafeMapGetLayer(map, layerId)) return;
  } catch {
    return;
  }
  for (const [key, value] of Object.entries(paint)) {
    try {
      map.setPaintProperty(layerId, key, value);
    } catch {
      /* unsupported paint on this layer type */
    }
  }
}

function applyMapboxLayerFilters(
  map: MapboxMap,
  layerId: string,
  filter: unknown,
): void {
  try {
    if (!siSafeMapGetLayer(map, layerId)) return;
  } catch {
    return;
  }
  try {
    map.setFilter(layerId, filter);
  } catch {
    /* ignore */
  }
}

function scaleMapboxPaintOpacity(
  paint: Record<string, unknown>,
  factor: number,
): Record<string, unknown> {
  if (!paint || factor >= 0.999) return paint;
  const f = Math.min(1, Math.max(0, factor));
  const out: Record<string, unknown> = { ...paint };
  for (const [k, v] of Object.entries(out)) {
    if (!k.includes('opacity')) continue;
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = Math.min(1, Math.max(0, v * f));
    } else if (Array.isArray(v) && v.length > 0) {
      out[k] = ['*', v, f];
    }
  }
  return out;
}

/**
 * Imperative Mapbox mount when react-map-gl sources are wiped by setStyle / basemap reload
 * but layer state is still valid (ArcGIS "Added layers" panel vs empty map).
 */
export function ensureSiCustomLayerMapboxMount(
  map: MapboxMap,
  layer: SiCustomLayerRegistryFields,
  opts?: SiCustomLayerMapMountOptions,
): boolean {
  if (layer.visible === false) return false;
  const fc = countGeoJsonFeatures(layer.geojson);
  if (fc === 0 && layer.renderMode !== 'raster' && layer.renderMode !== 'bim') return false;
  if (!siMapStyleReady(map)) return false;

  const mountOpts = resolveSiCustomLayerMountOpts(layer, opts);
  const elevation3d = mountOpts.elevation3d ?? false;
  const styleKey = buildCustomLayerMapboxStyleKey(layer);
  const instanceId = siMapboxSymbologyInstanceId(layer.id, styleKey);
  const st = resolveSiLayerMapboxStylePackForMount(layer, mountOpts);
  const op = Math.max(0.05, Math.min(1, layer.mapOpacity ?? 1));
  const fillPaint = scaleMapboxPaintOpacity(st.fillPaint as Record<string, unknown>, op);
  const linePaint = scaleMapboxPaintOpacity(st.linePaint as Record<string, unknown>, op);
  const circlePaint = scaleMapboxPaintOpacity(st.circlePaint as Record<string, unknown>, op);
  const extrusionPaint = buildSiHeightExtrusionPaint(st, layer, op);
  const fillPaintUnderExtrusion = siFillPaintHiddenUnderExtrusion(fillPaint);
  const data = layer.geojson as GeoJSON.FeatureCollection;
  const fillId = `${instanceId}-fill`;
  const lineId = `${instanceId}-line`;
  const circleId = `${instanceId}-circle`;
  const extrusionId = `${instanceId}-extrusion`;
  const bimMode = isSiBimRenderLayer(layer);
  const heightField = detectSiCustomLayerHeightExtrusionField(layer, { elevation3d });
  const useHeightExtrusion = !bimMode && elevation3d && Boolean(heightField);
  const useBimExtrusion = bimMode && elevation3d;
  const fillPaintForMount = useHeightExtrusion ? fillPaintUnderExtrusion : fillPaint;
  const bimColor =
    (typeof (layer as { fillColor?: string }).fillColor === 'string' && (layer as { fillColor?: string }).fillColor) ||
    '#64748b';

  const updateExistingSource = (): void => {
    const existing = map.getSource(instanceId) as { setData?: (d: GeoJSON.FeatureCollection) => void } | undefined;
    if (existing && typeof existing.setData === 'function') existing.setData(data);
  };

  const mountBimLayers = (): void => {
    if (!map.getLayer(extrusionId)) {
      map.addLayer({
        id: extrusionId,
        type: 'fill-extrusion',
        source: instanceId,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-extrusion-color': bimColor,
          'fill-extrusion-height': ['coalesce', ['get', 'height'], ['get', 'height_fin'], 3],
          'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
          'fill-extrusion-opacity': siBimExtrusionOpacity(op),
          'fill-extrusion-cast-shadows': true,
        },
      });
    }
    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: 'fill',
        source: instanceId,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': bimColor, 'fill-opacity': 0.01 },
      });
    }
    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: 'line',
        source: instanceId,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'line-color': bimColor, 'line-width': 0.6, 'line-opacity': op * 0.65 },
      });
    }
  };

  const mountBimFlatLayers = (): void => {
    if (map.getLayer(extrusionId)) {
      try {
        map.removeLayer(extrusionId);
      } catch {
        /* ignore */
      }
    }
    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: 'fill',
        source: instanceId,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': bimColor, 'fill-opacity': Math.max(0.35, op * 0.72) },
      });
    }
    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: 'line',
        source: instanceId,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'line-color': bimColor, 'line-width': 1.2, 'line-opacity': op },
      });
    }
  };

  const mountHeightExtrusionLayers = (): void => {
    if (!map.getLayer(extrusionId)) {
      map.addLayer({
        id: extrusionId,
        type: 'fill-extrusion',
        source: instanceId,
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: {
          ...extrusionPaint,
          'fill-extrusion-height': ['coalesce', ['to-number', ['get', heightField!]], 3],
        },
      });
    }
    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: 'fill',
        source: instanceId,
        filter: st.fillFilter,
        paint: fillPaintUnderExtrusion,
      });
    }
    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: 'line',
        source: instanceId,
        filter: st.lineFilter,
        paint: linePaint,
      });
    }
    if (!map.getLayer(circleId)) {
      map.addLayer({
        id: circleId,
        type: 'circle',
        source: instanceId,
        filter: st.pointFilter,
        paint: circlePaint,
      });
    }
  };

  const mountVectorLayers = (): void => {
    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: 'fill',
        source: instanceId,
        filter: st.fillFilter,
        paint: fillPaint,
      });
    }
    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: 'line',
        source: instanceId,
        filter: st.lineFilter,
        paint: linePaint,
      });
    }
    if (!map.getLayer(circleId)) {
      map.addLayer({
        id: circleId,
        type: 'circle',
        source: instanceId,
        filter: st.pointFilter,
        paint: circlePaint,
      });
    }
  };

  if (layerMapboxLayersPresent(map, layer)) {
    try {
      updateExistingSource();
      if (!useHeightExtrusion && !useBimExtrusion && map.getLayer(extrusionId)) {
        try {
          map.removeLayer(extrusionId);
        } catch {
          /* ignore */
        }
      }
      if (bimMode) {
        if (useBimExtrusion) {
          if (!map.getLayer(extrusionId)) mountBimLayers();
          applyMapboxLayerPaints(map, extrusionId, {
            'fill-extrusion-color': bimColor,
            'fill-extrusion-opacity': siBimExtrusionOpacity(op),
          });
          applyMapboxLayerPaints(map, fillId, { 'fill-color': bimColor, 'fill-opacity': 0.01 });
          applyMapboxLayerPaints(map, lineId, {
            'line-color': bimColor,
            'line-width': 0.6,
            'line-opacity': op * 0.65,
          });
        } else {
          mountBimFlatLayers();
          applyMapboxLayerPaints(map, fillId, {
            'fill-color': bimColor,
            'fill-opacity': Math.max(0.35, op * 0.72),
          });
          applyMapboxLayerPaints(map, lineId, {
            'line-color': bimColor,
            'line-width': 1.2,
            'line-opacity': op,
          });
        }
      } else if (useHeightExtrusion) {
        if (!map.getLayer(extrusionId)) mountHeightExtrusionLayers();
        applyMapboxLayerPaints(map, extrusionId, {
          ...extrusionPaint,
          'fill-extrusion-height': ['coalesce', ['to-number', ['get', heightField!]], 3],
        });
        applyMapboxLayerFilters(map, fillId, st.fillFilter);
        applyMapboxLayerFilters(map, lineId, st.lineFilter);
        applyMapboxLayerFilters(map, circleId, st.pointFilter);
        applyMapboxLayerPaints(map, fillId, fillPaintUnderExtrusion);
        applyMapboxLayerPaints(map, lineId, linePaint);
        applyMapboxLayerPaints(map, circleId, circlePaint);
      } else {
        if (!map.getLayer(fillId) || !map.getLayer(lineId) || !map.getLayer(circleId)) mountVectorLayers();
        applyMapboxLayerFilters(map, fillId, st.fillFilter);
        applyMapboxLayerFilters(map, lineId, st.lineFilter);
        applyMapboxLayerFilters(map, circleId, st.pointFilter);
        applyMapboxLayerPaints(map, fillId, fillPaintForMount);
        applyMapboxLayerPaints(map, lineId, linePaint);
        applyMapboxLayerPaints(map, circleId, circlePaint);
      }
      syncSiMapOverlayLayerStack(map);
    } catch {
      /* ignore */
    }
    return isSiCustomLayerPaintedOnMap(map, layer, mountOpts);
  }

  try {
    const existing = map.getSource(instanceId) as { setData?: (d: GeoJSON.FeatureCollection) => void } | undefined;
    if (!existing) {
      map.addSource(instanceId, { type: 'geojson', data });
    } else if (typeof existing.setData === 'function') {
      existing.setData(data);
    }

    if (bimMode) {
      if (useBimExtrusion) mountBimLayers();
      else mountBimFlatLayers();
    } else if (useHeightExtrusion) mountHeightExtrusionLayers();
    else mountVectorLayers();

    syncSiMapOverlayLayerStack(map);
    const ok = isSiCustomLayerPaintedOnMap(map, layer, mountOpts);
    if (ok) logSiCustomLayerDiagnostics(layer, map, { phase: 'imperative-mount', elevation3d });
    return ok;
  } catch (e) {
    console.warn('[si-map][layer] imperative mount failed', layer.id, e);
    return false;
  }
}

/** Remove imperative Mapbox mount for a custom layer (all symbology revisions). */
export function removeSiCustomLayerFromMapbox(
  map: MapboxMap | null | undefined,
  layer: SiCustomLayerRegistryFields,
): void {
  removeAllMapboxMountsForAppLayerId(map, layer.id);
}

export type SiMapLayerRepairResult = {
  ok: boolean;
  attempts: number;
  bumpedRevision: boolean;
  error?: string;
};

/**
 * Mapbox equivalent of ArcGIS `await layer.load()` + `await view.whenLayerView(layer)`:
 * wait until React commits the GeoJSON source/layers, pin them above the basemap, and tiles settle.
 */
export async function awaitSiCustomLayerMapViewReady(
  map: MapboxMap | null | undefined,
  layer: SiCustomLayerRegistryFields,
  opts?: SiCustomLayerMapMountOptions & { timeoutMs?: number; maxAttempts?: number },
): Promise<SiMapLayerRepairResult> {
  if (!map) return { ok: false, attempts: 0, bumpedRevision: false, error: 'no-map' };
  if (layer.visible === false) return { ok: true, attempts: 0, bumpedRevision: false };

  const fc = countGeoJsonFeatures(layer.geojson);
  if (fc === 0 && layer.renderMode !== 'raster' && layer.renderMode !== 'bim') {
    return { ok: false, attempts: 0, bumpedRevision: false, error: 'empty-geojson' };
  }

  const mountOpts = resolveSiCustomLayerMountOpts(layer, opts);
  const maxAttempts = opts?.maxAttempts ?? 28;
  let attempts = 0;

  await waitForReactPaint();

  while (attempts < maxAttempts) {
    attempts += 1;
    if (!map.getStyle?.()) {
      await delayMs(attempts < 5 ? 40 : 90);
      continue;
    }
    await waitForReactPaint();
    flushSiCustomLayerOnMapCanvas(map, layer, mountOpts);

    if (isSiCustomLayerPaintedOnMap(map, layer, mountOpts)) {
      await waitForMapboxRasterSettle(map, {
        timeoutMs: opts?.timeoutMs ?? 18_000,
        extraFrames: 2,
        rasterFadeMs: 0,
      });
      triggerSiMapLayerRenderSync(map);
      logSiCustomLayerDiagnostics(layer, map, { phase: 'layer-view-ready', attempts, elevation3d: opts?.elevation3d });
      return { ok: true, attempts, bumpedRevision: false };
    }

    await delayMs(attempts < 5 ? 40 : 90);
  }

  const repair = repairSiCustomLayerMapRender(map, layer, 1, mountOpts);
  if (repair.ok) return repair;

  return {
    ok: false,
    attempts,
    bumpedRevision: repair.bumpedRevision,
    error: repair.error ?? 'layer-view-timeout',
  };
}

/** Retry stack sync + source remount (Mapbox equivalent of layerView repair). */
export function repairSiCustomLayerMapRender(
  map: MapboxMap | null,
  layer: SiCustomLayerRegistryFields,
  attempt = 1,
  mountOpts?: SiCustomLayerMapMountOptions,
): SiMapLayerRepairResult {
  if (!map) return { ok: false, attempts: attempt, bumpedRevision: false, error: 'no-map' };
  const fc = countGeoJsonFeatures(layer.geojson);
  if (layer.visible === false) return { ok: true, attempts: attempt, bumpedRevision: false };
  if (fc === 0 && layer.renderMode !== 'raster' && layer.renderMode !== 'bim') {
    return { ok: false, attempts: attempt, bumpedRevision: false, error: 'empty-geojson' };
  }

  try {
    ensureSiCustomLayerMapboxMount(map, layer, mountOpts);
    triggerSiMapLayerRenderSync(map);
    if (isSiCustomLayerPaintedOnMap(map, layer, mountOpts)) {
      logSiCustomLayerDiagnostics(layer, map, { repair: 'ok', attempt });
      return { ok: true, attempts: attempt, bumpedRevision: false };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (attempt >= SI_MAP_RENDER_RETRY_MAX) {
      return { ok: false, attempts: attempt, bumpedRevision: false, error: msg };
    }
  }

  if (attempt >= SI_MAP_RENDER_RETRY_MAX) {
    return { ok: false, attempts: attempt, bumpedRevision: true, error: 'max-retries' };
  }

  return repairSiCustomLayerMapRender(map, layer, attempt + 1, mountOpts);
}

export type SiCustomLayerRenderPipelineResult = {
  ok: boolean;
  layer: SiCustomLayerRegistryFields;
  attempts: number;
  error?: string;
};

/**
 * ArcGIS-style add pipeline: materialize default renderer → LayerView → verify paint → refresh.
 * Layer is not considered committed until it is painted on the map canvas.
 */
export async function runSiCustomLayerRenderPipeline(
  map: MapboxMap | null | undefined,
  layer: SiCustomLayerRegistryFields,
  opts?: { elevation3d?: boolean; maxAttempts?: number },
): Promise<SiCustomLayerRenderPipelineResult> {
  let working = materializeCustomLayerRendererForDisplay({ ...layer, visible: true, loadStatus: 'loading' });
  const maxAttempts = opts?.maxAttempts ?? 6;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await waitForReactPaint();
    if (!map?.getStyle?.()) {
      await delayMs(80);
      continue;
    }

    const mountOpts = resolveSiCustomLayerMountOpts(working, { elevation3d: opts?.elevation3d });
    flushSiCustomLayerOnMapCanvas(map, working, mountOpts);
    const view = await awaitSiCustomLayerMapViewReady(map, working, {
      elevation3d: mountOpts.elevation3d,
      maxAttempts: 16,
      forceVisiblePaints: mountOpts.forceVisiblePaints,
    });

    if (view.ok && isSiCustomLayerPaintedOnMap(map, working, mountOpts)) {
      const fc = countGeoJsonFeatures(working.geojson);
      return {
        ok: true,
        attempts: attempt + 1,
        layer: bumpCustomLayerMapRenderRevision(
          prepareCustomLayerForMap({
            ...working,
            loadStatus: fc > 0 ? 'loaded' : 'empty',
            lastMapSyncAt: Date.now(),
            lastMapSyncError: null,
          }),
        ),
      };
    }

    working = materializeCustomLayerRendererForDisplay(
      bumpCustomLayerMapRenderRevision({
        ...working,
        lastMapSyncError: view.error ?? 'layer-view-not-ready',
      }),
    );
    await delayMs(attempt < 2 ? 60 : 120);
  }

  return {
    ok: false,
    attempts: maxAttempts,
    error: 'render-pipeline-timeout',
    layer: prepareCustomLayerForMap({
      ...working,
      loadStatus: 'failed',
      lastMapSyncAt: Date.now(),
      lastMapSyncError: 'render-pipeline-timeout',
    }),
  };
}

export function bumpCustomLayerMapRenderRevision<T extends SiCustomLayerRegistryFields>(layer: T): T {
  return {
    ...layer,
    mapRenderRevision: (layer.mapRenderRevision ?? 0) + 1,
    lastMapSyncAt: Date.now(),
  };
}
