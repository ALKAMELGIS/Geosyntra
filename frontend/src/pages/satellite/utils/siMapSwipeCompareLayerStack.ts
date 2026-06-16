import type { Map as MapboxMap } from 'mapbox-gl';
import {
  SI_MAP_SWIPE_WMS_LAYER_A_ID,
  SI_MAP_SWIPE_WMS_LAYER_B_ID,
  SI_MAP_SWIPE_WMS_SOURCE_A_ID,
  SI_MAP_SWIPE_WMS_SOURCE_B_ID,
} from './siMapLayerSwipeCatalog';
import { ensureSiMapSwipeGpuScissorLayers } from './siMapSwipeGpuScissor';
import { isSiMapDataLayerMutationFrozen } from './siMapRasterPipelineGuard';
import {
  findMapboxInsertBeforeIdAboveWmsStack,
  raiseSiMapTerrainContourLayersAboveWms,
  refreshSiMapWmsRasterPaint,
} from './siMapWmsRasterLayerStack';

export type SiMapSwipeRasterSideSync = {
  tileUrl: string;
  opacity: number;
  visible: boolean;
  bounds: [number, number, number, number] | null;
};

const lastSwipeTileUrlBySource = new Map<string, string>();

function syncSiMapSwipeRasterSide(
  map: MapboxMap,
  sourceId: string,
  layerId: string,
  side: SiMapSwipeRasterSideSync | null,
): boolean {
  if (!side?.tileUrl?.trim()) return false;
  try {
    const src = map.getSource(sourceId) as {
      setTiles?: (tiles: string[]) => void;
      setBounds?: (bounds: [number, number, number, number] | null) => void;
      reload?: () => void;
    } | null;
    if (!src) return false;

    const prevUrl = lastSwipeTileUrlBySource.get(sourceId);
    if (prevUrl !== side.tileUrl && typeof src.setTiles === 'function') {
      src.setTiles([side.tileUrl]);
      lastSwipeTileUrlBySource.set(sourceId, side.tileUrl);
      try {
        src.reload?.();
      } catch {
        /* optional on older mapbox builds */
      }
    }
    if (typeof src.setBounds === 'function') {
      src.setBounds(side.bounds);
    }
    if (!map.getLayer(layerId)) return true;
    map.setLayoutProperty(layerId, 'visibility', side.visible ? 'visible' : 'none');
    map.setPaintProperty(layerId, 'raster-opacity', side.opacity);
    return true;
  } catch {
    return false;
  }
}

export function resetSiMapSwipeRasterSourceCacheForTests(): void {
  lastSwipeTileUrlBySource.clear();
}

/** Imperative tile URL + paint sync — Mapbox raster sources do not reload from React prop changes alone. */
/** @returns true when both requested sides were applied (sources present). */
export function syncSiMapSwipeRasterSourceTiles(
  map: MapboxMap,
  sideA: SiMapSwipeRasterSideSync | null,
  sideB: SiMapSwipeRasterSideSync | null,
): boolean {
  const okA = sideA ? syncSiMapSwipeRasterSide(map, SI_MAP_SWIPE_WMS_SOURCE_A_ID, SI_MAP_SWIPE_WMS_LAYER_A_ID, sideA) : true;
  const okB = sideB ? syncSiMapSwipeRasterSide(map, SI_MAP_SWIPE_WMS_SOURCE_B_ID, SI_MAP_SWIPE_WMS_LAYER_B_ID, sideB) : true;
  refreshSiMapWmsRasterPaint(map);
  return okA && okB;
}

export function siMapSwipeCompareLayersReady(map: MapboxMap | null | undefined): boolean {
  if (!map?.getLayer) return false;
  try {
    return Boolean(map.getLayer(SI_MAP_SWIPE_WMS_LAYER_A_ID));
  } catch {
    return false;
  }
}

/**
 * Keep swipe compare layers ordered: A (full) → scissor gate → B (clipped) → scissor off.
 * Must run instead of raiseSiMapWmsRasterLayersToTop while swipe rasters are active.
 */
export function syncSiMapSwipeCompareLayerStack(map: MapboxMap): void {
  if (isSiMapDataLayerMutationFrozen()) return;
  if (!map.getStyle?.()) return;
  if (!map.getLayer(SI_MAP_SWIPE_WMS_LAYER_A_ID)) return;

  try {
    const beforeTop = findMapboxInsertBeforeIdAboveWmsStack(map);

    if (map.getLayer(SI_MAP_SWIPE_WMS_LAYER_B_ID)) {
      map.moveLayer(SI_MAP_SWIPE_WMS_LAYER_B_ID, beforeTop);
      map.moveLayer(SI_MAP_SWIPE_WMS_LAYER_A_ID, SI_MAP_SWIPE_WMS_LAYER_B_ID);
      ensureSiMapSwipeGpuScissorLayers(map);
    } else {
      map.moveLayer(SI_MAP_SWIPE_WMS_LAYER_A_ID, beforeTop);
    }

    raiseSiMapTerrainContourLayersAboveWms(map);
  } catch {
    /* style mid-rebuild */
  }
}
