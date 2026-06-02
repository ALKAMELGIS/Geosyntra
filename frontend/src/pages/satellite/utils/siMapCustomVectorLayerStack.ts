import type { Map as MapboxMap } from 'mapbox-gl';
import { isSiMapWmsRasterLayerId } from './siMapWmsRasterLayerStack';

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
    const anchorId = layerIds.find(isSiMapOperationalMapboxLayerId);
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
    layerId.startsWith('si-ors-')
  );
}

/** Move custom vector Mapbox layers above WMS rasters (and basemap). */
export function raiseSiMapCustomVectorLayersToTop(map: MapboxMap): void {
  if (!map.getStyle?.()) return;
  const layerIds = (map.getStyle()?.layers ?? []).map(l => l.id);
  const auxIds = layerIds.filter(isSiMapCustomLayerAuxMapboxLayerId);
  const geomIds = layerIds.filter(isSiMapCustomVectorGeometryMapboxLayerId);
  const labelIds = layerIds.filter(isSiMapCustomVectorLabelMapboxLayerId);
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

/** Keep draw/AOI/selection overlays above feature layers. */
export function raiseSiMapUiOverlayLayersToTop(map: MapboxMap): void {
  if (!map.getStyle?.()) return;
  const ids = (map.getStyle()?.layers ?? []).map(l => l.id).filter(isSiMapUiOverlayLayerId);
  for (const id of ids) {
    try {
      if (map.getLayer(id)) map.moveLayer(id);
    } catch {
      /* layer removed mid-style rebuild */
    }
  }
}

/**
 * Z-order: basemap → WMS rasters → custom feature vectors → draw/AOI UI overlays.
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
}
