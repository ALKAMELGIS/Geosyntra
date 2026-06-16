import type { Map as MapboxMap } from 'mapbox-gl';
import {
  siMapWeatherCloudVeilStrength,
  siMapWeatherNeedsParticleOverlay,
} from './siMapWeatherEffects';
import type { SiMapWeatherSettings } from './siMapWeatherTypes';
import { isSiActiveDrawSketchSession, type SiDrawSketchTool } from './siMapDrawSketchSession';

export type RouteMapAnalysisMode = 'route' | 'isochrone' | 'matrix' | 'loc-alloc';

/** Snapshot of map analysis tools that compete with feature identify pop-ups for click events. */
export type SiMapInteractiveToolSnapshot = {
  routeMapOpen?: boolean;
  mapWeatherIntelActive?: boolean;
  mapWeatherOpen?: boolean;
  mapSunSkyOpen?: boolean;
  mapCropHealthOpen?: boolean;
  mapLayerSwipeOpen?: boolean;
  elevProfileOpen?: boolean;
  elevProfileSketching?: boolean;
  routeMapPickTarget?: string | null;
  locAllocPickTarget?: string | null;
  sunSkyLosSketchMode?: string | null;
  interactionMode?: 'view' | 'draw' | 'move';
  mapDrawTool?: SiDrawSketchTool | null;
  drawSketchActive?: boolean;
  dragRectCircleActive?: boolean;
  /** Feature identify / AOI attribute pop-ups visible on the map. */
  mapFeaturePopupsActive?: boolean;
};

/** True when a dock / basemap analysis panel owns map clicks (no feature pop-ups). */
export function siMapInteractiveToolPanelOpen(s: SiMapInteractiveToolSnapshot): boolean {
  return Boolean(
    s.routeMapOpen ||
      s.mapWeatherIntelActive ||
      s.mapWeatherOpen ||
      s.mapSunSkyOpen ||
      s.mapCropHealthOpen ||
      s.mapLayerSwipeOpen ||
      s.elevProfileOpen,
  );
}

/** True when on-map feature identify / AOI pop-ups are shown. */
export function siMapFeaturePopupsEngaged(s: SiMapInteractiveToolSnapshot): boolean {
  return Boolean(s.mapFeaturePopupsActive);
}

/**
 * True when route / weather / elevation / crop tools must not be opened
 * (feature pop-ups own map clicks).
 */
export function siMapInteractiveToolOpenBlockedByFeaturePopups(s: SiMapInteractiveToolSnapshot): boolean {
  return siMapFeaturePopupsEngaged(s);
}

/** True when map identify / attribute pop-ups must not open (tools or sketch modes). */
export function siMapInteractiveToolSuppressesIdentifyPopups(s: SiMapInteractiveToolSnapshot): boolean {
  if (siMapInteractiveToolPanelOpen(s)) return true;
  if (s.elevProfileSketching) return true;
  if (s.routeMapPickTarget) return true;
  if (s.locAllocPickTarget) return true;
  if (s.sunSkyLosSketchMode) return true;
  if (s.interactionMode === 'move' || s.interactionMode === 'draw') return true;
  if (s.mapDrawTool && s.mapDrawTool !== 'select') return true;
  if (s.mapDrawTool === 'lasso' || s.mapDrawTool === 'freehand') return true;
  if (s.dragRectCircleActive) return true;
  if (s.drawSketchActive) return true;
  return false;
}

export const SI_MAP_FLOATING_IDENTIFY_LS_KEY = 'si-map-floating-identify-v1';

/** Map-anchored luxury attribute cards (default on). Set localStorage to `0` to disable. */
export function readSiMapFloatingIdentifyEnabled(): boolean {
  try {
    const v = localStorage.getItem(SI_MAP_FLOATING_IDENTIFY_LS_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
    return true;
  } catch {
    return true;
  }
}

export function persistSiMapFloatingIdentifyEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SI_MAP_FLOATING_IDENTIFY_LS_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** True when floating map-anchored feature cards may render (browse + select + explicit opt-in). */
export function siMapFloatingFeaturePopupsAllowed(s: SiMapInteractiveToolSnapshot): boolean {
  if (!readSiMapFloatingIdentifyEnabled()) return false;
  if (siMapInteractiveToolSuppressesIdentifyPopups(s)) return false;
  return s.interactionMode === 'view' && (s.mapDrawTool == null || s.mapDrawTool === 'select');
}

/** Build snapshot from live refs (SatelliteIntelligenceMain). */
export function buildSiMapInteractiveToolSnapshot(input: {
  routeMapOpen: boolean;
  mapWeatherIntelActive: boolean;
  mapWeatherOpen: boolean;
  mapSunSkyOpen: boolean;
  mapCropHealthOpen: boolean;
  mapLayerSwipeOpen: boolean;
  elevProfileOpen: boolean;
  elevProfileSketching: boolean;
  routeMapPickTarget: string | null;
  locAllocPickTarget: string | null;
  sunSkyLosSketchMode: string | null;
  interactionMode: 'view' | 'draw' | 'move';
  mapDrawTool: SiDrawSketchTool;
  polygonRingLength: number;
  hasPolylineStart: boolean;
  hasRectCirclePreview: boolean;
  hasCircleRefineDraft: boolean;
  dragRectCircleActive: boolean;
  polygonVertexSketchDrag: boolean;
  mapFeaturePopupsActive: boolean;
}): SiMapInteractiveToolSnapshot {
  return {
    routeMapOpen: input.routeMapOpen,
    mapWeatherIntelActive: input.mapWeatherIntelActive,
    mapWeatherOpen: input.mapWeatherOpen,
    mapSunSkyOpen: input.mapSunSkyOpen,
    mapCropHealthOpen: input.mapCropHealthOpen,
    mapLayerSwipeOpen: input.mapLayerSwipeOpen,
    elevProfileOpen: input.elevProfileOpen,
    elevProfileSketching: input.elevProfileSketching,
    routeMapPickTarget: input.routeMapPickTarget,
    locAllocPickTarget: input.locAllocPickTarget,
    sunSkyLosSketchMode: input.sunSkyLosSketchMode,
    interactionMode: input.interactionMode,
    mapDrawTool: input.mapDrawTool,
    drawSketchActive: isSiActiveDrawSketchSession({
      mapDrawTool: input.mapDrawTool,
      polygonRingLength: input.polygonRingLength,
      hasPolylineStart: input.hasPolylineStart,
      hasRectCirclePreview: input.hasRectCirclePreview,
      hasCircleRefineDraft: input.hasCircleRefineDraft,
      dragRectCircleActive: input.dragRectCircleActive,
      polygonVertexSketchDrag: input.polygonVertexSketchDrag,
    }),
    dragRectCircleActive: input.dragRectCircleActive,
    mapFeaturePopupsActive: input.mapFeaturePopupsActive,
  };
}

export const SI_ORS_ISOCHRONE_SOURCE_ID = 'si-ors-isochrone';
export const SI_ORS_ISOCHRONE_LAYER_IDS = ['si-ors-isochrone-line', 'si-ors-isochrone-fill'] as const;

/** Isochrone polygons render only in isochrone analysis mode with data present. */
export function shouldShowSiOrsIsochroneLayer(
  mode: RouteMapAnalysisMode,
  enabled: boolean,
  geoJson: GeoJSON.FeatureCollection | null | undefined,
): boolean {
  return mode === 'isochrone' && enabled && geoJson != null;
}

/** Remove stale isochrone Mapbox layers when react-map-gl unmount races style updates. */
export function clearSiOrsIsochroneMapLayers(map: MapboxMap | null | undefined): void {
  if (!map?.getStyle?.()) return;
  for (const layerId of SI_ORS_ISOCHRONE_LAYER_IDS) {
    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    } catch {
      /* layer removed mid-style rebuild */
    }
  }
  try {
    if (map.getSource(SI_ORS_ISOCHRONE_SOURCE_ID)) map.removeSource(SI_ORS_ISOCHRONE_SOURCE_ID);
  } catch {
    /* source removed mid-style rebuild */
  }
}

/**
 * Map tool integration rules — Location-Allocation is launched only from the Route Map panel.
 */

/** Weather canvas overlay (particles / cloud veil). */
export function siMapWeatherCanvasOverlayActive(settings: SiMapWeatherSettings): boolean {
  return (
    siMapWeatherNeedsParticleOverlay(settings) ||
    siMapWeatherCloudVeilStrength(settings) > 0.03
  );
}

/** Mapbox native rain/snow effects. */
export function siMapWeatherNativePrecipitationAllowed(settings: SiMapWeatherSettings): boolean {
  void settings;
  return true;
}
