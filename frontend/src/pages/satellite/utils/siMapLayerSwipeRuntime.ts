import type { Map as MapboxMap } from 'mapbox-gl';
import {
  filterSiMapSwipeComparableKeys,
  isSiMapSwipeContextMapboxLayerId,
  isSiMapSwipeWmsLayerId,
  resolveSiMapSwipeClipRect,
  resolveSiMapSwipeMapboxLayerIds,
  SI_MAP_SWIPE_WMS_LAYER_A_ID,
  SI_MAP_SWIPE_WMS_LAYER_B_ID,
  type SiMapSwipeLayerEntry,
  type SiMapSwipeMode,
} from './siMapLayerSwipeCatalog';
import { isSiMapWmsRasterLayerId } from './siMapWmsRasterLayerStack';
import {
  removeSiMapSwipeGpuScissorLayers,
  syncSiMapSwipeGpuScissor,
} from './siMapSwipeGpuScissor';
import { siMapSwipeCompareLayersReady, syncSiMapSwipeCompareLayerStack } from './siMapSwipeCompareLayerStack';

export type SiMapLayerSwipeOrientation = 'vertical' | 'horizontal';

export type SiMapLayerSwipeInitOptions = {
  /** Force mercator while swipe is active (avoids globe circular clip). */
  onSwipeProjectionLock?: (locked: boolean) => void;
};

export type SiMapLayerSwipeState = {
  active: boolean;
  mode: SiMapSwipeMode;
  position: number;
  orientation: SiMapLayerSwipeOrientation;
  spyPosition: { x: number; y: number };
  spyRadiusPct: number;
  fullSide: 'a' | 'b';
  leadingKeys: string[];
  trailingKeys: string[];
  trailingOpacity: number;
  leadingOpacity: number;
  /** Show draggable divider handle on the map. */
  dividerVisible: boolean;
};

export const DEFAULT_SI_MAP_LAYER_SWIPE_STATE: SiMapLayerSwipeState = {
  active: false,
  mode: 'vertical',
  position: 50,
  orientation: 'vertical',
  spyPosition: { x: 50, y: 50 },
  spyRadiusPct: 18,
  fullSide: 'b',
  leadingKeys: [],
  trailingKeys: [],
  trailingOpacity: 1,
  leadingOpacity: 1,
  dividerVisible: true,
};

/**
 * Single-map swipe runtime — one Mapbox GL map, one WebGL canvas, one render loop.
 * Layer A/B are raster layers in the same style; trailing side B is GPU-scissored.
 * No secondary maps, capture canvases, or synchronized views.
 */
export class SiMapLayerSwipeRuntime {
  private map: MapboxMap | null = null;
  private mapContainer: HTMLElement | null = null;
  private catalog: SiMapSwipeLayerEntry[] = [];
  private state: SiMapLayerSwipeState = { ...DEFAULT_SI_MAP_LAYER_SWIPE_STATE };
  private originalVisibility = new Map<string, string>();
  private originalOpacities = new Map<string, number>();
  private bounds = { width: 0, height: 0 };
  private destroyed = false;
  private initOptions: SiMapLayerSwipeInitOptions = {};
  private layerPairSig = '';

  private onResizeHandler: (() => void) | null = null;

  setInitOptions(options: SiMapLayerSwipeInitOptions): void {
    this.initOptions = options;
  }

  attach(map: MapboxMap | null): void {
    if (this.map === map) return;
    this.detach();
    if (!map) return;
    this.map = map;
    this.mapContainer = map.getCanvasContainer?.() ?? map.getContainer?.() ?? null;
    this.updateBounds();
    this.bindMapEvents();
    this.apply();
  }

  detach(): void {
    this.unbindMapEvents();
    this.restoreAllVisibility();
    removeSiMapSwipeGpuScissorLayers(this.map);
    this.map = null;
    this.mapContainer = null;
    this.bounds = { width: 0, height: 0 };
  }

  destroy(): void {
    this.destroyed = true;
    this.initOptions.onSwipeProjectionLock?.(false);
    this.detach();
  }

  setCatalog(catalog: SiMapSwipeLayerEntry[]): void {
    this.catalog = catalog;
    const sig = this.buildLayerPairSig();
    if (sig !== this.layerPairSig) {
      this.layerPairSig = sig;
      this.applyLayerVisibility();
    }
  }

  setState(partial: Partial<SiMapLayerSwipeState>): void {
    const prev = this.state;
    this.state = { ...this.state, ...partial };
    const pairChanged =
      filterSiMapSwipeComparableKeys(prev.leadingKeys).join('|') !==
        this.normalizedLeadingKeys().join('|') ||
      filterSiMapSwipeComparableKeys(prev.trailingKeys).join('|') !==
        this.normalizedTrailingKeys().join('|');
    const opacityChanged =
      prev.trailingOpacity !== this.state.trailingOpacity ||
      prev.leadingOpacity !== this.state.leadingOpacity;
    const clipChanged =
      prev.mode !== this.state.mode ||
      prev.orientation !== this.state.orientation ||
      prev.position !== this.state.position ||
      prev.spyPosition.x !== this.state.spyPosition.x ||
      prev.spyPosition.y !== this.state.spyPosition.y ||
      prev.spyRadiusPct !== this.state.spyRadiusPct ||
      prev.fullSide !== this.state.fullSide;
    const activeChanged = prev.active !== this.state.active;

    if (pairChanged) this.layerPairSig = this.buildLayerPairSig();

    this.apply();

    if (pairChanged || opacityChanged || activeChanged) {
      this.applyLayerVisibility();
    } else if (clipChanged) {
      this.updateGpuClip();
    }
  }

  getState(): SiMapLayerSwipeState {
    return { ...this.state };
  }

  setPosition(position: number): void {
    this.state.position = Math.max(0, Math.min(100, position));
    this.updateGpuClip();
  }

  previewPosition(position: number): void {
    if (!this.state.active || !this.hasSwipePair()) return;
    this.state.position = Math.max(0, Math.min(100, position));
    this.updateGpuClip();
  }

  previewSpyPosition(x: number, y: number): void {
    if (!this.state.active || !this.hasSwipePair()) return;
    this.state.spyPosition = {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
    this.updateGpuClip();
  }

  resetSwipe(): void {
    this.state.position = 50;
    this.state.spyPosition = { x: 50, y: 50 };
    this.updateGpuClip();
  }

  refreshDisplay(): void {
    if (!this.map || !this.state.active || !this.hasSwipePair()) return;
    if (siMapSwipeCompareLayersReady(this.map)) {
      syncSiMapSwipeCompareLayerStack(this.map);
    }
    this.applyLayerVisibility();
    this.updateGpuClip();
  }

  private buildLayerPairSig(): string {
    return `${this.normalizedLeadingKeys().join(',')}|${this.normalizedTrailingKeys().join(',')}|${this.state.leadingOpacity}|${this.state.trailingOpacity}`;
  }

  private normalizedLeadingKeys(): string[] {
    return filterSiMapSwipeComparableKeys(this.state.leadingKeys);
  }

  private normalizedTrailingKeys(): string[] {
    return filterSiMapSwipeComparableKeys(this.state.trailingKeys);
  }

  private apply(): void {
    if (!this.map || this.destroyed) return;
    this.updateBounds();
    const active = this.state.active && this.hasSwipePair();
    this.initOptions.onSwipeProjectionLock?.(active);
    if (active) {
      this.applyLayerVisibility();
      this.updateGpuClip();
    } else {
      this.restoreAllVisibility();
      removeSiMapSwipeGpuScissorLayers(this.map);
      this.initOptions.onSwipeProjectionLock?.(false);
    }
  }

  private hasSwipePair(): boolean {
    return this.normalizedLeadingKeys().length > 0 && this.normalizedTrailingKeys().length > 0;
  }

  private usesDedicatedSwipeSides(): boolean {
    const trailing = resolveSiMapSwipeMapboxLayerIds(this.map, this.normalizedTrailingKeys(), this.catalog);
    return trailing.some(id => isSiMapSwipeWmsLayerId(id));
  }

  private leadingIds(): string[] {
    return resolveSiMapSwipeMapboxLayerIds(this.map, this.normalizedLeadingKeys(), this.catalog);
  }

  private trailingIds(): string[] {
    return resolveSiMapSwipeMapboxLayerIds(this.map, this.normalizedTrailingKeys(), this.catalog);
  }

  private bindMapEvents(): void {
    if (!this.map) return;
    this.onResizeHandler = () => {
      this.updateBounds();
      this.updateGpuClip();
    };
    this.map.on('resize', this.onResizeHandler);
  }

  private unbindMapEvents(): void {
    if (!this.map || !this.onResizeHandler) return;
    this.map.off('resize', this.onResizeHandler);
    this.onResizeHandler = null;
  }

  private updateBounds(): void {
    const el = this.mapContainer;
    if (!el) return;
    this.bounds = { width: el.clientWidth, height: el.clientHeight };
  }

  private resolveClipMode(): SiMapSwipeMode {
    return this.state.mode === 'split' ? 'vertical' : this.state.mode;
  }

  private updateGpuClip(): void {
    if (!this.map || !this.state.active || !this.hasSwipePair()) {
      removeSiMapSwipeGpuScissorLayers(this.map);
      return;
    }

    const mode = this.resolveClipMode();
    if (mode === 'full') {
      removeSiMapSwipeGpuScissorLayers(this.map);
      try {
        this.map.triggerRepaint?.();
      } catch {
        /* ignore */
      }
      return;
    }

    if (!this.usesDedicatedSwipeSides() || !this.map.getLayer(SI_MAP_SWIPE_WMS_LAYER_B_ID)) {
      removeSiMapSwipeGpuScissorLayers(this.map);
      return;
    }

    const { width, height } = this.bounds;
    if (width <= 0 || height <= 0) return;

    const layout = resolveSiMapSwipeClipRect(
      { width, height },
      mode,
      this.state.position,
      this.state.spyPosition,
      this.state.spyRadiusPct,
      this.state.fullSide,
    );

    syncSiMapSwipeGpuScissor(this.map, layout, width, height, layout.clipWidth > 0 && layout.clipHeight > 0);
    syncSiMapSwipeCompareLayerStack(this.map);
  }

  private hideLayerLiveWhileSwipe(): void {
    if (!this.map?.getStyle?.()) return;
    if (!siMapSwipeCompareLayersReady(this.map)) return;
    for (const layer of this.map.getStyle()?.layers ?? []) {
      const id = layer.id;
      if (!isSiMapWmsRasterLayerId(id) || isSiMapSwipeWmsLayerId(id)) continue;
      try {
        if (!this.map.getLayer(id)) continue;
        if (!this.originalVisibility.has(id)) {
          const vis = this.map.getLayoutProperty(id, 'visibility');
          this.originalVisibility.set(id, (vis as string) ?? 'visible');
        }
        this.map.setLayoutProperty(id, 'visibility', 'none');
      } catch {
        /* layer mid-rebuild */
      }
    }
  }

  private applyOpacity(map: MapboxMap, layerId: string, opacity: number): void {
    let layer: ReturnType<MapboxMap['getLayer']> | undefined;
    try {
      if (!map.getStyle?.()?.layers) return;
      layer = map.getLayer(layerId) ?? undefined;
    } catch {
      return;
    }
    if (!layer) return;
    const type = layer.type;
    const clamped = Math.max(0.05, Math.min(1, opacity));
    const opacityKey =
      type === 'raster'
        ? 'raster-opacity'
        : type === 'fill'
          ? 'fill-opacity'
          : type === 'line'
            ? 'line-opacity'
            : type === 'circle'
              ? 'circle-opacity'
              : type === 'fill-extrusion'
                ? 'fill-extrusion-opacity'
                : type === 'heatmap'
                  ? 'heatmap-opacity'
                  : type === 'symbol'
                    ? 'icon-opacity'
                    : null;
    if (!opacityKey) return;
    try {
      if (!this.originalOpacities.has(layerId)) {
        const v = map.getPaintProperty(layerId, opacityKey);
        if (typeof v === 'number') this.originalOpacities.set(layerId, v);
      }
      map.setPaintProperty(layerId, opacityKey, clamped);
    } catch {
      /* layer mid-rebuild */
    }
  }

  private restoreOpacity(map: MapboxMap, layerId: string): void {
    const original = this.originalOpacities.get(layerId);
    if (original == null) return;
    let layer: ReturnType<MapboxMap['getLayer']> | undefined;
    try {
      if (!map.getStyle?.()?.layers) return;
      layer = map.getLayer(layerId) ?? undefined;
    } catch {
      return;
    }
    if (!layer) return;
    const type = layer.type;
    const opacityKey =
      type === 'raster'
        ? 'raster-opacity'
        : type === 'fill'
          ? 'fill-opacity'
          : type === 'line'
            ? 'line-opacity'
            : type === 'circle'
              ? 'circle-opacity'
              : type === 'fill-extrusion'
                ? 'fill-extrusion-opacity'
                : type === 'heatmap'
                  ? 'heatmap-opacity'
                  : type === 'symbol'
                    ? 'icon-opacity'
                    : null;
    if (!opacityKey) return;
    try {
      map.setPaintProperty(layerId, opacityKey, original);
      this.originalOpacities.delete(layerId);
    } catch {
      /* ignore */
    }
  }

  private applyLayerVisibility(): void {
    if (!this.map || !this.state.active || !this.hasSwipePair()) return;

    const leading = new Set(this.leadingIds());
    const trailing = new Set(this.trailingIds());
    const style = this.map.getStyle();
    if (!style?.layers) return;

    const mode = this.resolveClipMode();
    const fullShowLeading = mode === 'full' && this.state.fullSide === 'a';
    const fullShowTrailing = mode === 'full' && this.state.fullSide === 'b';

    if (this.usesDedicatedSwipeSides()) {
      this.hideLayerLiveWhileSwipe();
    }

    for (const layer of style.layers) {
      const id = layer.id;
      if (isSiMapSwipeContextMapboxLayerId(id)) continue;

      const isLeading = leading.has(id);
      const isTrailing = trailing.has(id);
      const isSwipeParticipant = isLeading || isTrailing;
      if (!isSwipeParticipant) continue;

      // Dedicated swipe rasters: tile URL, opacity, and visibility are owned by SiMapSwipeRasterLayers.
      if (this.usesDedicatedSwipeSides() && isSiMapSwipeWmsLayerId(id) && mode !== 'full') {
        continue;
      }

      try {
        if (!this.originalVisibility.has(id)) {
          const vis = this.map.getLayoutProperty(id, 'visibility');
          this.originalVisibility.set(id, (vis as string) ?? 'visible');
        }

        if (mode === 'full') {
          if (fullShowLeading && isLeading) {
            this.map.setLayoutProperty(id, 'visibility', 'visible');
            this.applyOpacity(this.map, id, this.state.leadingOpacity);
          } else if (fullShowTrailing && isTrailing) {
            this.map.setLayoutProperty(id, 'visibility', 'visible');
            this.applyOpacity(this.map, id, this.state.trailingOpacity);
          } else {
            this.map.setLayoutProperty(id, 'visibility', 'none');
          }
          continue;
        }

        if (isLeading) {
          this.map.setLayoutProperty(id, 'visibility', 'visible');
          this.applyOpacity(this.map, id, this.state.leadingOpacity);
        } else if (isTrailing) {
          this.map.setLayoutProperty(id, 'visibility', 'visible');
          this.applyOpacity(this.map, id, this.state.trailingOpacity);
        }
      } catch {
        /* layer removed mid-style rebuild */
      }
    }

    for (const layer of style.layers) {
      const id = layer.id;
      if (leading.has(id) || trailing.has(id)) continue;
      if (!this.originalVisibility.has(id)) continue;
      try {
        this.map.setLayoutProperty(id, 'visibility', this.originalVisibility.get(id)!);
        this.restoreOpacity(this.map, id);
        this.originalVisibility.delete(id);
      } catch {
        /* ignore */
      }
    }

    this.updateGpuClip();
  }

  private restoreAllVisibility(): void {
    if (!this.map) {
      this.originalVisibility.clear();
      this.originalOpacities.clear();
      return;
    }
    for (const [id, vis] of this.originalVisibility) {
      try {
        if (this.map.getLayer(id)) {
          this.map.setLayoutProperty(id, 'visibility', vis);
        }
      } catch {
        /* ignore */
      }
    }
    for (const id of [...this.originalOpacities.keys()]) {
      this.restoreOpacity(this.map, id);
    }
    this.originalVisibility.clear();
    this.originalOpacities.clear();
  }
}

export function siMapSwipeSideLayerId(side: 'a' | 'b'): string {
  return side === 'a' ? SI_MAP_SWIPE_WMS_LAYER_A_ID : SI_MAP_SWIPE_WMS_LAYER_B_ID;
}
