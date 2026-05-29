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
  if (layer.source !== 'arcgis') return false;
  if (layer.useArcGisSymbology === false) return false;
  if (layer.symbology?.useArcGisOnline === false && layer.symbology?.userConfigured === true) return false;
  return Boolean(layer.arcgisDrawingInfo && arcgisDrawingInfoSupportsMapboxRender(layer.arcgisDrawingInfo));
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

/** True when the layer must use the global forced style (not user-saved or ArcGIS service symbology). */
export function siLayerShouldUseForcedGlobalStyle(layer: SiLayerForcedStyleFields): boolean {
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
export function enforceSiLayerForcedStyleRecord<T extends SiLayerForcedStyleFields>(layer: T): T {
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
