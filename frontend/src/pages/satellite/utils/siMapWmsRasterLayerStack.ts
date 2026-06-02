import type { Map as MapboxMap } from 'mapbox-gl';
import type { SiSentinelHubRasterRunLite } from '../components/SiSentinelHubRasterLayers';
import { SI_TERRAIN_CONTOUR_LABEL_LAYER_ID } from './siMap3DLabels';

export const SI_MAP_TERRAIN_CONTOUR_LAYER_ID = 'si-terrain-contours';

/** Mapbox layer ids for Sentinel Hub WMS rasters (always above AOI vectors). */
export function isSiMapWmsRasterLayerId(layerId: string): boolean {
  return layerId === 'sentinel-layer' || layerId.startsWith('si-sentinel-layer-');
}

/** Source ids paired with {@link isSiMapWmsRasterLayerId}. */
export function siMapWmsRasterSourceIdForRun(spec: SiSentinelHubRasterRunLite): string {
  return `si-sentinel-src-${spec.aoiId}-${spec.stackKey}`;
}

export function siMapWmsRasterLayerIdForRun(spec: SiSentinelHubRasterRunLite): string {
  return `si-sentinel-layer-${spec.aoiId}-${spec.stackKey}`;
}

/** Index of the topmost Sentinel / live WMS raster in the style stack. */
export function topmostSiMapWmsRasterLayerIndex(map: MapboxMap): number {
  const layers = map.getStyle()?.layers ?? [];
  let top = -1;
  for (let i = 0; i < layers.length; i++) {
    const id = layers[i]?.id;
    if (id && isSiMapWmsRasterLayerId(id)) top = i;
  }
  return top;
}

/**
 * Mapbox `addLayer` / `moveLayer` `beforeId`: insert immediately above the live WMS stack.
 * Returns `undefined` when WMS is already topmost (add/move to map top).
 */
export function findMapboxInsertBeforeIdAboveWmsStack(map: MapboxMap): string | undefined {
  const layers = map.getStyle()?.layers ?? [];
  const wmsTop = topmostSiMapWmsRasterLayerIndex(map);
  if (wmsTop < 0) return undefined;
  for (let i = wmsTop + 1; i < layers.length; i++) {
    const id = layers[i]?.id;
    if (!id) continue;
    if (id === SI_MAP_TERRAIN_CONTOUR_LAYER_ID || id === SI_TERRAIN_CONTOUR_LABEL_LAYER_ID) continue;
    return id;
  }
  return undefined;
}

/** Keep terrain contour lines and labels above live index / WMS rasters. */
export function raiseSiMapTerrainContourLayersAboveWms(map: MapboxMap): void {
  if (!map.getStyle?.()) return;
  const beforeId = findMapboxInsertBeforeIdAboveWmsStack(map);
  const lineId = SI_MAP_TERRAIN_CONTOUR_LAYER_ID;
  const labelId = SI_TERRAIN_CONTOUR_LABEL_LAYER_ID;
  try {
    if (map.getLayer(lineId)) map.moveLayer(lineId, beforeId);
    if (map.getLayer(labelId)) {
      map.moveLayer(labelId, beforeId);
      if (map.getLayer(lineId)) map.moveLayer(labelId);
    }
  } catch {
    /* layer removed mid-style rebuild */
  }
}

/**
 * Move every WMS raster layer to the top of the Mapbox stack so AOI fills/lines cannot paint over
 * Live Index tiles during normal viewing. Terrain contours are re-stacked above WMS afterward.
 */
export function raiseSiMapWmsRasterLayersToTop(map: MapboxMap): void {
  if (!map.getStyle?.()) return;
  const style = map.getStyle();
  if (!style?.layers) return;
  const ids = style.layers.map(l => l.id).filter(isSiMapWmsRasterLayerId);
  for (const id of ids) {
    try {
      if (map.getLayer(id)) map.moveLayer(id);
    } catch {
      /* layer removed mid-style rebuild */
    }
  }
  raiseSiMapTerrainContourLayersAboveWms(map);
}

export function syncSiMapWmsRasterSourceBounds(
  map: MapboxMap,
  runs: SiSentinelHubRasterRunLite[] | null | undefined,
): void {
  if (!runs?.length) return;
  for (const spec of runs) {
    if (!spec.ready) continue;
    const srcId = siMapWmsRasterSourceIdForRun(spec);
    try {
      const src = map.getSource(srcId) as { setBounds?: (b: [number, number, number, number] | null) => void } | null;
      if (src && typeof src.setBounds === 'function') src.setBounds(spec.bounds ?? null);
    } catch {
      /* ignore map/source race during style rebuild */
    }
  }
}

export function refreshSiMapWmsRasterPaint(map: MapboxMap | null | undefined): void {
  if (!map) return;
  try {
    map.triggerRepaint?.();
  } catch {
    /* ignore */
  }
}

/** Update WMS tile URLs in place — avoids remounting Mapbox raster sources on timeline scrub. */
export function syncSiMapWmsRasterSourceTiles(
  map: MapboxMap,
  runs: SiSentinelHubRasterRunLite[] | null | undefined,
  legacyTileUrl?: string | null,
): void {
  if (legacyTileUrl) {
    try {
      const src = map.getSource('sentinel-source') as { setTiles?: (tiles: string[]) => void } | null;
      if (src && typeof src.setTiles === 'function') src.setTiles([legacyTileUrl]);
    } catch {
      /* source not mounted yet */
    }
  }
  if (!runs?.length) return;
  for (const spec of runs) {
    if (!spec.ready || !spec.tileUrl) continue;
    const srcId = siMapWmsRasterSourceIdForRun(spec);
    try {
      const src = map.getSource(srcId) as { setTiles?: (tiles: string[]) => void } | null;
      if (src && typeof src.setTiles === 'function') src.setTiles([spec.tileUrl]);
    } catch {
      /* ignore map/source race during style rebuild */
    }
  }
}
