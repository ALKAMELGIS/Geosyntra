import type { Map as MapboxMap } from 'mapbox-gl';
import { SI_TERRAIN_CONTOUR_LABEL_LAYER_ID } from './siMap3DLabels';
import {
  isSiMapWmsRasterLayerId,
  raiseSiMapTerrainContourLayersAboveWms,
  SI_MAP_TERRAIN_CONTOUR_LAYER_ID,
  siMapTerrainContourLayersMounted,
} from './siMapWmsRasterLayerStack';
/** Mapbox layer ids for user-added GeoJSON vector layers ({layerId}--{styleKey}-fill|line|circle|extrusion|label-*). */
export function isSiMapCustomVectorMapboxLayerId(layerId: string): boolean {
  return /--.+-(fill|line|circle|extrusion|cluster-count|cluster|label-point|label-line|label-poly)$/.test(layerId);
}

/** Placeholder extent outline or image raster for a custom layer (no `--` symbology slug). */
export function isSiMapCustomLayerAuxMapboxLayerId(layerId: string): boolean {
  return /-extent-line$/.test(layerId) || /-raster$/.test(layerId);
}

export function isSiMapCustomVectorGeometryMapboxLayerId(layerId: string): boolean {
  return /--.+-(fill|line|circle|extrusion|cluster-count|cluster)$/.test(layerId);
}

export function isSiMapCustomVectorLabelMapboxLayerId(layerId: string): boolean {
  return /--.+-(label-point|label-line|label-poly)$/.test(layerId);
}

/** In-place raster basemap tile layers (legacy `si-basemap-layer-*` and cached `si-basemap-*-layer-*`). */
export function isSiMapBasemapMapboxLayerId(layerId: string): boolean {
  return layerId.startsWith('si-basemap-') && layerId.includes('-layer-');
}

/** Any operational layer that must always paint above the basemap. */
export function isSiMapTerrainContourMapboxLayerId(layerId: string): boolean {
  return layerId === SI_MAP_TERRAIN_CONTOUR_LAYER_ID || layerId === SI_TERRAIN_CONTOUR_LABEL_LAYER_ID;
}

export function isSiMapOperationalMapboxLayerId(layerId: string): boolean {
  return (
    isSiMapWmsRasterLayerId(layerId) ||
    isSiMapCustomVectorMapboxLayerId(layerId) ||
    isSiMapCustomLayerAuxMapboxLayerId(layerId) ||
    isSiMapUiOverlayLayerId(layerId)
  );
}

/**
 * Keep the basemap raster as the bottom drawing layer: move every `si-basemap-*`
 * layer just below the first operational layer (WMS raster / feature vector / draw
 * overlay), preserving their relative order. Terrain relief / hillshade layers are
 * neither basemap nor operational, so they stay beneath the basemap untouched.
 * No-op when no operational layer exists yet (nothing to sit above).
 */
export function lowerSiMapBasemapLayersToBottom(map: MapboxMap): void {
  if (!map.getStyle?.()) return;
  const basemapIds = (map.getStyle()?.layers ?? []).map(l => l.id).filter(isSiMapBasemapMapboxLayerId);
  if (!basemapIds.length) return;

  for (const basemapId of basemapIds) {
    const layerIds = (map.getStyle()?.layers ?? []).map(l => l.id);
    const anchorId =
      layerIds.find(isSiMapOperationalMapboxLayerId) ??
      layerIds.find(isSiMapTerrainContourMapboxLayerId);
    if (!anchorId) return;
    try {
      if (!map.getLayer(basemapId) || !map.getLayer(anchorId)) continue;
      const basemapIndex = layerIds.indexOf(basemapId);
      const anchorIndex = layerIds.indexOf(anchorId);
      if (basemapIndex < 0 || anchorIndex < 0 || basemapIndex < anchorIndex) continue;
      map.moveLayer(basemapId, anchorId);
    } catch {
      /* layer removed mid-style rebuild */
    }
  }
}

/**
 * Analysis-result overlays (Hydro Watershed + Flood Monitoring outputs: DEM,
 * slope, flow direction/accumulation, wetness, flood zones, stream order/streams,
 * basins, watershed, …). These must ALWAYS paint above the AOI / draw / selection
 * reference overlays so analytical results are never hidden by the AOI polygon.
 * Add future analysis-layer prefixes here.
 */
export function isSiMapAnalysisOverlayLayerId(layerId: string): boolean {
  return layerId.startsWith('si-hydro-') || layerId.startsWith('si-flood-');
}

/** Draw / AOI / selection overlays that must stay above feature layers and WMS rasters. */
export function isSiMapUiOverlayLayerId(layerId: string): boolean {
  return (
    layerId.startsWith('si-draw-draft-') ||
    layerId.startsWith('si-aoi-fields-') ||
    layerId.startsWith('si-saved-fields-') ||
    layerId.startsWith('drawn-index-geometry-') ||
    layerId.startsWith('si-multi-aoi-') ||
    layerId.startsWith('si-geo-ai-sel-') ||
    layerId.startsWith('si-agol-table-highlight-') ||
    layerId.startsWith('si-stac-footprints-') ||
    layerId.startsWith('si-geo-ai-route-') ||
    layerId.startsWith('si-route-nav-marker-') ||
    layerId.startsWith('si-ors-') ||
    isSiMapAnalysisOverlayLayerId(layerId)
  );
}

/** Move custom vector Mapbox layers above WMS rasters (and basemap). */
export function raiseSiMapCustomVectorLayersToTop(map: MapboxMap): void {
  if (!map.getStyle?.()) return;
  const layerIds = (map.getStyle()?.layers ?? []).map(l => l.id);
  // Exclude UI-overlay layers (draw, AOI, selection, …). They are stacked by
  // `raiseSiMapUiOverlayLayersToTop`, which preserves their declared order.
  const auxIds = layerIds.filter(id => isSiMapCustomLayerAuxMapboxLayerId(id) && !isSiMapUiOverlayLayerId(id));
  const geomIds = layerIds.filter(id => isSiMapCustomVectorGeometryMapboxLayerId(id) && !isSiMapUiOverlayLayerId(id));
  const labelIds = layerIds.filter(id => isSiMapCustomVectorLabelMapboxLayerId(id) && !isSiMapUiOverlayLayerId(id));
  for (const id of auxIds) {
    try {
      if (map.getLayer(id)) map.moveLayer(id);
    } catch {
      /* layer removed mid-style rebuild */
    }
  }
  for (const id of geomIds) {
    try {
      if (map.getLayer(id)) map.moveLayer(id);
    } catch {
      /* layer removed mid-style rebuild */
    }
  }
  for (const id of labelIds) {
    try {
      if (map.getLayer(id)) map.moveLayer(id);
    } catch {
      /* layer removed mid-style rebuild */
    }
  }
}

/**
 * Keep draw/AOI/selection overlays above feature layers, and analysis-result
 * overlays (hydro/flood) above the AOI. Two-pass: reference overlays are raised
 * first, then analysis layers are raised on top — so `moveLayer` (which sends each
 * id to the very top) leaves analysis results above the AOI regardless of the
 * order they were inserted. The AOI stays a visible boundary, never a cover.
 */
export function raiseSiMapUiOverlayLayersToTop(map: MapboxMap): void {
  if (!map.getStyle?.()) return;
  const ids = (map.getStyle()?.layers ?? []).map(l => l.id).filter(isSiMapUiOverlayLayerId);
  const referenceIds = ids.filter(id => !isSiMapAnalysisOverlayLayerId(id));
  const analysisIds = ids.filter(isSiMapAnalysisOverlayLayerId);
  // Phase 1: AOI / draw / selection reference overlays (sit just below analysis).
  for (const id of referenceIds) {
    try {
      if (map.getLayer(id)) map.moveLayer(id);
    } catch {
      /* layer removed mid-style rebuild */
    }
  }
  // Phase 2: analysis results — always on top of the AOI boundary.
  for (const id of analysisIds) {
    try {
      if (map.getLayer(id)) map.moveLayer(id);
    } catch {
      /* layer removed mid-style rebuild */
    }
  }
}

/**
 * Z-order: basemap → WMS rasters → custom feature vectors → draw/AOI UI overlays → terrain contours (top).
 * Mapbox equivalent of awaiting layerView then applying effects without hiding vectors.
 */
export function syncSiMapOverlayLayerStack(map: MapboxMap): void {
  if (!map.getStyle?.()) return;
  const style = map.getStyle();
  if (!style?.layers) return;

  // Pin the basemap to the bottom first, then raise operational layers on top of it
  // so an added layer can never be hidden by the basemap, regardless of insert order.
  lowerSiMapBasemapLayersToBottom(map);

  const wmsIds = style.layers.map(l => l.id).filter(isSiMapWmsRasterLayerId);
  for (const id of wmsIds) {
    try {
      if (map.getLayer(id)) map.moveLayer(id);
    } catch {
      /* ignore */
    }
  }

  raiseSiMapCustomVectorLayersToTop(map);
  raiseSiMapUiOverlayLayersToTop(map);
  if (siMapTerrainContourLayersMounted(map)) {
    raiseSiMapTerrainContourLayersAboveWms(map);
  }
}
