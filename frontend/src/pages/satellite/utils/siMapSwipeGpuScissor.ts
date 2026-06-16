import type { CustomLayerInterface, Map as MapboxMap } from 'mapbox-gl';
import {
  SI_MAP_SWIPE_WMS_LAYER_B_ID,
} from './siMapLayerSwipeCatalog';
import type { SiMapSwipeClipRect } from './siMapSwipeClipLayout';

export const SI_MAP_SWIPE_SCISSOR_BEFORE_ID = 'si-map-swipe-scissor-before';
export const SI_MAP_SWIPE_SCISSOR_AFTER_ID = 'si-map-swipe-scissor-after';

export type SiMapSwipeGpuScissorRect = {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

let scissorRect: SiMapSwipeGpuScissorRect = {
  enabled: false,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
};

/** Convert CSS-pixel clip layout to WebGL scissor (origin bottom-left, device pixels). */
export function siMapSwipeClipRectToGpuScissor(
  layout: SiMapSwipeClipRect,
  cssWidth: number,
  cssHeight: number,
  pixelRatio: number,
): SiMapSwipeGpuScissorRect {
  const pr = Math.max(1, pixelRatio);
  const w = Math.max(0, layout.clipWidth) * pr;
  const h = Math.max(0, layout.clipHeight) * pr;
  if (w <= 0 || h <= 0 || cssWidth <= 0 || cssHeight <= 0) {
    return { enabled: false, x: 0, y: 0, width: 0, height: 0 };
  }
  const x = Math.max(0, layout.clipLeft) * pr;
  const y = Math.max(0, (cssHeight - layout.clipTop - layout.clipHeight)) * pr;
  return { enabled: true, x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}

export function setSiMapSwipeGpuScissorRect(next: SiMapSwipeGpuScissorRect): void {
  scissorRect = next;
}

function createScissorBeforeLayer(): CustomLayerInterface {
  return {
    id: SI_MAP_SWIPE_SCISSOR_BEFORE_ID,
    type: 'custom',
    renderingMode: '2d',
    render(gl) {
      if (!scissorRect.enabled || scissorRect.width <= 0 || scissorRect.height <= 0) return;
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(scissorRect.x, scissorRect.y, scissorRect.width, scissorRect.height);
    },
  };
}

function createScissorAfterLayer(): CustomLayerInterface {
  return {
    id: SI_MAP_SWIPE_SCISSOR_AFTER_ID,
    type: 'custom',
    renderingMode: '2d',
    render(gl) {
      gl.disable(gl.SCISSOR_TEST);
    },
  };
}

function layerIdAfter(map: MapboxMap, layerId: string): string | undefined {
  const layers = map.getStyle()?.layers ?? [];
  const idx = layers.findIndex(l => l.id === layerId);
  if (idx < 0) return undefined;
  return layers[idx + 1]?.id;
}

/** Insert WebGL scissor gate immediately around trailing raster layer B. */
export function ensureSiMapSwipeGpuScissorLayers(map: MapboxMap): void {
  if (!map.getStyle?.()) return;
  if (!map.getLayer(SI_MAP_SWIPE_WMS_LAYER_B_ID)) return;

  if (!map.getLayer(SI_MAP_SWIPE_SCISSOR_BEFORE_ID)) {
    map.addLayer(createScissorBeforeLayer(), SI_MAP_SWIPE_WMS_LAYER_B_ID);
  }
  if (!map.getLayer(SI_MAP_SWIPE_SCISSOR_AFTER_ID)) {
    const afterB = layerIdAfter(map, SI_MAP_SWIPE_WMS_LAYER_B_ID);
    map.addLayer(createScissorAfterLayer(), afterB);
  }

  try {
    map.moveLayer(SI_MAP_SWIPE_SCISSOR_BEFORE_ID, SI_MAP_SWIPE_WMS_LAYER_B_ID);
    const afterB = layerIdAfter(map, SI_MAP_SWIPE_WMS_LAYER_B_ID);
    if (afterB && afterB !== SI_MAP_SWIPE_SCISSOR_AFTER_ID) {
      map.moveLayer(SI_MAP_SWIPE_SCISSOR_AFTER_ID, afterB);
    } else if (!afterB) {
      map.moveLayer(SI_MAP_SWIPE_SCISSOR_AFTER_ID);
    }
  } catch {
    /* style mid-rebuild */
  }
}

export function removeSiMapSwipeGpuScissorLayers(map: MapboxMap | null): void {
  if (!map?.getStyle?.()) return;
  for (const id of [SI_MAP_SWIPE_SCISSOR_AFTER_ID, SI_MAP_SWIPE_SCISSOR_BEFORE_ID]) {
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch {
      /* ignore */
    }
  }
  setSiMapSwipeGpuScissorRect({ enabled: false, x: 0, y: 0, width: 0, height: 0 });
}

export function syncSiMapSwipeGpuScissor(
  map: MapboxMap | null,
  layout: SiMapSwipeClipRect,
  cssWidth: number,
  cssHeight: number,
  enabled: boolean,
): void {
  if (!map || !enabled) {
    setSiMapSwipeGpuScissorRect({ enabled: false, x: 0, y: 0, width: 0, height: 0 });
    return;
  }
  let pixelRatio = 1;
  try {
    pixelRatio = map.getPixelRatio?.() ?? window.devicePixelRatio ?? 1;
  } catch {
    pixelRatio = window.devicePixelRatio ?? 1;
  }
  setSiMapSwipeGpuScissorRect(
    siMapSwipeClipRectToGpuScissor(layout, cssWidth, cssHeight, pixelRatio),
  );
  ensureSiMapSwipeGpuScissorLayers(map);
  try {
    map.triggerRepaint?.();
  } catch {
    /* ignore */
  }
}
