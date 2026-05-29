import type { Map as MapboxMap } from 'mapbox-gl';
import { isSiMapWmsRasterLayerId } from './siMapWmsRasterLayerStack';

/** Mapbox layer ids for user-added GeoJSON vector layers ({layerId}--{styleKey}-fill|line|circle). */
export function isSiMapCustomVectorMapboxLayerId(layerId: string): boolean {
  return /--.+-(fill|line|circle|cluster-count|cluster|label-point|label-line)$/.test(layerId);
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
  const ids = (map.getStyle()?.layers ?? []).map(l => l.id).filter(isSiMapCustomVectorMapboxLayerId);
  for (const id of ids) {
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
