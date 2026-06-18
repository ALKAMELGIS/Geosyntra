/**
 * Global forced vector style — hollow polygons/lines/points with 1px black outline.
 * Applied before display unless the user saved symbology (`symbology.userConfigured`)
 * or the layer is an ArcGIS FeatureServer row with service drawingInfo.
 */
import type { SymbologyConfig } from './layerTypes';
import type { SiVectorStylePack } from './siSymbolStyleStudio';
import { arcgisDrawingInfoSupportsMapboxRender } from '../../lib/arcgisDrawingInfoMapbox';

export const SI_FORCED_LAYER_STROKE = '#22c55e';
export const SI_FORCED_LAYER_FILL = 'rgba(34, 197, 94, 0.42)';
export const SI_FORCED_LAYER_WEIGHT = 2;
export const SI_FORCED_LAYER_FILL_OPACITY = 0.42;
export const SI_FORCED_LAYER_POINT_RADIUS = 5;

/** Height-extrusion building layers (e.g. height_fin) — white fill, gray outline. */
export const SI_3D_BUILDING_STROKE = '#94a3b8';
export const SI_3D_BUILDING_FILL = '#ffffff';
export const SI_3D_BUILDING_WEIGHT = 2;
export const SI_3D_BUILDING_FILL_OPACITY = 1;
/** Extrusion walls follow layer mapOpacity at 100% — not a separate ghost cap. */
export const SI_3D_BUILDING_EXTRUSION_OPACITY = 1;
export const SI_3D_BUILDING_POINT_RADIUS = 5;

export const SI_CUSTOM_LAYER_HEIGHT_FIELDS = ['height_fin', 'height', 'HEIGHT', 'Height'] as const;

export type SiLayerForcedStyleVariant = 'default' | '3d-building';

/** Detect a numeric height attribute suitable for fill-extrusion. */
export function detectSiLayerHeightExtrusionField(
  layer: { geojson?: unknown },
  opts?: { elevation3d?: boolean },
): string | null {
  if (opts?.elevation3d !== true) return null;
  const features = (layer.geojson as { features?: Array<{ properties?: Record<string, unknown> }> })?.features;
  if (!features?.length) return null;
  for (const feature of features.slice(0, 64)) {
    const props = feature?.properties;
    if (!props) continue;
    for (const field of SI_CUSTOM_LAYER_HEIGHT_FIELDS) {
      const raw = props[field];
      if (raw != null && raw !== '' && Number.isFinite(Number(raw))) return field;
    }
  }
  return null;
}

/** Uploaded / vector building layers with a numeric height attribute (not IFC BIM). */
export function siLayerQualifiesFor3dBuildingDefaultStyle(
  layer: { geojson?: unknown; renderMode?: string; bimModelId?: string | null },
): boolean {
  if (layer.renderMode === 'bim' || layer.bimModelId) return false;
  return detectSiLayerHeightExtrusionField(layer, { elevation3d: true }) != null;
}

/** Mapbox paints for forced default style — 3D buildings vs standard vector. */
export function resolveSiForcedDefaultStylePackForLayer(
  layer: { geojson?: unknown; renderMode?: string; bimModelId?: string | null },
): SiVectorStylePack {
  if (siLayerQualifiesFor3dBuildingDefaultStyle(layer)) {
    return buildSi3dBuildingDefaultVectorStylePack();
  }
  return buildSiForcedDefaultVectorStylePack();
}

export function forcedStyleVariantForLayer(
  layer: { geojson?: unknown; renderMode?: string; bimModelId?: string | null },
): SiLayerForcedStyleVariant | undefined {
  return siLayerQualifiesFor3dBuildingDefaultStyle(layer) ? '3d-building' : undefined;
}

const SI_MAPBOX_POLY_FILTER: unknown[] = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]];
const SI_MAPBOX_LINE_POLY_FILTER: unknown[] = [
  'in',
  ['geometry-type'],
  ['literal', ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']],
];
const SI_MAPBOX_POINT_FILTER: unknown[] = ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]];

export type SiLayerForcedStyleFields = {
  symbology?: SymbologyConfig;
  color?: string;
  fillColor?: string;
  weight?: number;
  polygonFillAlpha?: number;
  pointRadius?: number;
  useArcGisSymbology?: boolean;
  source?: 'arcgis' | 'upload' | 'api' | 'stac';
  arcgisDrawingInfo?: Record<string, unknown> | null;
};

/** Default symbology for newly imported ArcGIS feature layers (portal renderer). */
export function getSiDefaultArcgisLayerSymbology(): SymbologyConfig & { userConfigured: false; useArcGisOnline: true } {
  return {
    ...getSiForcedDefaultSymbology(),
    useArcGisOnline: true,
  };
}

/** True when Mapbox should paint from ArcGIS service symbology instead of forced hollow style. */
export function siLayerUsesArcgisServiceRendererByDefault(layer: SiLayerForcedStyleFields): boolean {
  if (layer.useArcGisSymbology === false) return false;
  if (layer.symbology?.useArcGisOnline === false && layer.symbology?.userConfigured === true) return false;
  if (!layer.arcgisDrawingInfo || !arcgisDrawingInfoSupportsMapboxRender(layer.arcgisDrawingInfo)) return false;
  if (layer.source === 'arcgis' || layer.useArcGisSymbology === true || layer.symbology?.useArcGisOnline === true) {
    return true;
  }
  return layer.symbology?.userConfigured !== true;
}

/** Default symbology record for new / reset layers (not user-customized). */
export function getSiForcedDefaultSymbology(): SymbologyConfig & { userConfigured: false } {
  return {
    useArcGisOnline: false,
    style: 'single',
    field: '',
    classes: 5,
    method: 'equal_interval',
    colorRamp: 'viridis',
    threshold: Number.NaN,
    userConfigured: false,
  };
}

/** Mapbox paints for the global hollow-black style. */
export function buildSiForcedDefaultVectorStylePack(): SiVectorStylePack {
  return {
    fillFilter: SI_MAPBOX_POLY_FILTER,
    lineFilter: SI_MAPBOX_LINE_POLY_FILTER,
    pointFilter: SI_MAPBOX_POINT_FILTER,
    fillPaint: {
      'fill-color': SI_FORCED_LAYER_FILL,
      'fill-opacity': SI_FORCED_LAYER_FILL_OPACITY,
    },
    linePaint: {
      'line-color': SI_FORCED_LAYER_STROKE,
      'line-width': SI_FORCED_LAYER_WEIGHT,
      'line-opacity': 1,
    },
    circlePaint: {
      'circle-radius': SI_FORCED_LAYER_POINT_RADIUS,
      'circle-color': SI_FORCED_LAYER_FILL,
      'circle-opacity': SI_FORCED_LAYER_FILL_OPACITY,
      'circle-stroke-width': SI_FORCED_LAYER_WEIGHT,
      'circle-stroke-color': SI_FORCED_LAYER_STROKE,
    },
  };
}

/** Mapbox paints for 3D building footprint layers — white fill, gray outline. */
export function buildSi3dBuildingDefaultVectorStylePack(): SiVectorStylePack {
  return {
    fillFilter: SI_MAPBOX_POLY_FILTER,
    lineFilter: SI_MAPBOX_LINE_POLY_FILTER,
    pointFilter: SI_MAPBOX_POINT_FILTER,
    fillPaint: {
      'fill-color': SI_3D_BUILDING_FILL,
      'fill-opacity': SI_3D_BUILDING_FILL_OPACITY,
    },
    linePaint: {
      'line-color': SI_3D_BUILDING_STROKE,
      'line-width': SI_3D_BUILDING_WEIGHT,
      'line-opacity': 1,
    },
    circlePaint: {
      'circle-radius': SI_3D_BUILDING_POINT_RADIUS,
      'circle-color': SI_3D_BUILDING_FILL,
      'circle-opacity': SI_3D_BUILDING_FILL_OPACITY,
      'circle-stroke-width': SI_3D_BUILDING_WEIGHT,
      'circle-stroke-color': SI_3D_BUILDING_STROKE,
    },
  };
}

/** True when the layer must use the global forced style (not user-saved or ArcGIS service symbology). */
export function siLayerShouldUseForcedGlobalStyle(layer: SiLayerForcedStyleFields): boolean {
  if ((layer as { source?: string }).source === 'flood-simulation') return false;
  if (layer.symbology?.userConfigured === true) return false;
  if (siLayerUsesArcgisServiceRendererByDefault(layer)) return false;
  return true;
}

/** Force map visibility flags before add / refresh / render sync. */
export function ensureSiCustomLayerMapVisible<T extends { visible?: boolean; mapOpacity?: number }>(layer: T): T {
  return {
    ...layer,
    visible: layer.visible !== false,
    mapOpacity:
      typeof layer.mapOpacity === 'number' && Number.isFinite(layer.mapOpacity)
        ? Math.max(0.05, Math.min(1, layer.mapOpacity))
        : 1,
  };
}

/** Normalize layer record fields before persistence / add (keeps ArcGIS drawingInfo for portal symbology). */
export function enforceSiLayerForcedStyleRecord<T extends SiLayerForcedStyleFields>(
  layer: T,
  opts?: { variant?: SiLayerForcedStyleVariant },
): T {
  if (!siLayerShouldUseForcedGlobalStyle(layer)) {
    if (siLayerUsesArcgisServiceRendererByDefault(layer)) {
      return {
        ...layer,
        useArcGisSymbology: true,
        symbology: layer.symbology?.userConfigured
          ? layer.symbology
          : getSiDefaultArcgisLayerSymbology(),
      };
    }
    return layer;
  }
  if (opts?.variant === '3d-building') {
    return {
      ...layer,
      color: SI_3D_BUILDING_STROKE,
      fillColor: SI_3D_BUILDING_FILL,
      weight: SI_3D_BUILDING_WEIGHT,
      polygonFillAlpha: SI_3D_BUILDING_FILL_OPACITY,
      pointRadius: SI_3D_BUILDING_POINT_RADIUS,
      useArcGisSymbology: false,
      symbology: getSiForcedDefaultSymbology(),
    };
  }
  return {
    ...layer,
    color: SI_FORCED_LAYER_STROKE,
    fillColor: SI_FORCED_LAYER_FILL,
    weight: SI_FORCED_LAYER_WEIGHT,
    polygonFillAlpha: SI_FORCED_LAYER_FILL_OPACITY,
    pointRadius: SI_FORCED_LAYER_POINT_RADIUS,
    useArcGisSymbology: false,
    symbology: getSiForcedDefaultSymbology(),
  };
}
