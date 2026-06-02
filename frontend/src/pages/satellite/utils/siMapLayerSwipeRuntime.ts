import type { Map as MapboxMap } from 'mapbox-gl';
import {
  computeSiMapSwipeClipLayout,
  filterSiMapSwipeComparableKeys,
  isSiMapSwipeContextMapboxLayerId,
  resolveSiMapSwipeMapboxLayerIds,
  type SiMapSwipeLayerEntry,
} from './siMapLayerSwipeCatalog';

export type SiMapLayerSwipeOrientation = 'vertical' | 'horizontal';

export type SiMapLayerSwipeInitOptions = {
  /** Force mercator while swipe is active (avoids globe circular clip). */
  onSwipeProjectionLock?: (locked: boolean) => void;
};

export type SiMapLayerSwipeState = {
  active: boolean;
  position: number;
  orientation: SiMapLayerSwipeOrientation;
  leadingKeys: string[];
  trailingKeys: string[];
  trailingOpacity: number;
  leadingOpacity: number;
  /** Show draggable divider handle on the map. */
  dividerVisible: boolean;
};

export const DEFAULT_SI_MAP_LAYER_SWIPE_STATE: SiMapLayerSwipeState = {
  active: false,
  position: 50,
  orientation: 'vertical',
  leadingKeys: [],
  trailingKeys: [],
  trailingOpacity: 1,
  leadingOpacity: 1,
  dividerVisible: true,
};

function waitForMapRender(map: MapboxMap, timeoutMs = 4000): Promise<void> {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      map.off('render', onRender);
      resolve();
    };
    const onRender = () => finish();
    const timer = window.setTimeout(finish, timeoutMs);
    try {
      map.once('render', onRender);
      map.triggerRepaint?.();
    } catch {
      finish();
    }
  });
}

function copyCanvasContents(target: HTMLCanvasElement, source: HTMLCanvasElement): void {
  const w = source.width;
  const h = source.height;
  if (!w || !h) return;
  if (target.width !== w) target.width = w;
  if (target.height !== h) target.height = h;
  const ctx = target.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
}

/**
 * ArcGIS Instant Apps-style layer swipe on a single Mapbox map.
 * Leading layers render live; trailing layers are captured into a clipped overlay (no second map).
 */
export class SiMapLayerSwipeRuntime {
  private map: MapboxMap | null = null;
  private mapContainer: HTMLElement | null = null;
  private clipContainer: HTMLElement | null = null;
  private captureCanvas: HTMLCanvasElement | null = null;
  private catalog: SiMapSwipeLayerEntry[] = [];
  private state: SiMapLayerSwipeState = { ...DEFAULT_SI_MAP_LAYER_SWIPE_STATE };
  private originalVisibility = new Map<string, string>();
  private originalOpacities = new Map<string, number>();
  private bounds = { width: 0, height: 0 };
  private destroyed = false;
  private captureToken = 0;
  private captureDebounceTimer: number | null = null;
  private captureInFlight = false;
  private captureVisibilityRestore = new Map<string, string>();
  private initOptions: SiMapLayerSwipeInitOptions = {};
  private layerPairSig = '';

  private onMoveEndHandler: (() => void) | null = null;
  private onResizeHandler: (() => void) | null = null;
  private onRotateEndHandler: (() => void) | null = null;

  setInitOptions(options: SiMapLayerSwipeInitOptions): void {
    this.initOptions = options;
  }

  attach(map: MapboxMap | null): void {
    if (this.map === map) return;
    this.detach();
    if (!map) return;
    this.map = map;
    this.mapContainer = map.getContainer?.() ?? null;
    this.updateBounds();
    this.bindMapEvents();
    this.apply();
  }

  detach(): void {
    this.unbindMapEvents();
    this.cancelScheduledCapture();
    this.restoreAllVisibility();
    this.removeTrailingOverlay();
    this.map = null;
    this.mapContainer = null;
    this.bounds = { width: 0, height: 0 };
    this.captureToken += 1;
    this.captureInFlight = false;
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
      this.applyLayerVisibility('display');
      this.scheduleTrailingCapture(true);
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
    const orientationChanged = prev.orientation !== this.state.orientation;
    const positionChanged = prev.position !== this.state.position;
    const activeChanged = prev.active !== this.state.active;
    const dividerChanged = prev.dividerVisible !== this.state.dividerVisible;

    if (pairChanged) this.layerPairSig = this.buildLayerPairSig();

    this.apply();

    if (pairChanged || opacityChanged || activeChanged) {
      this.scheduleTrailingCapture(true);
    } else if (orientationChanged || positionChanged) {
      this.updateClip();
      if (positionChanged) this.scheduleTrailingCapture(false);
    } else if (dividerChanged) {
      /* divider visibility only — no capture */
    }
  }

  getState(): SiMapLayerSwipeState {
    return { ...this.state };
  }

  setPosition(position: number): void {
    this.state.position = Math.max(0, Math.min(100, position));
    this.updateClip();
  }

  /** Imperative clip update during divider drag (no React round-trip). */
  previewPosition(position: number): void {
    if (!this.state.active || !this.hasSwipePair()) return;
    this.state.position = Math.max(0, Math.min(100, position));
    this.updateClip();
  }

  resetSwipe(): void {
    this.state.position = 50;
    this.updateClip();
    this.scheduleTrailingCapture(true);
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
      this.ensureTrailingOverlay();
      this.applyLayerVisibility('display');
      this.updateClip();
      if (this.clipContainer) {
        this.clipContainer.style.display = '';
        this.clipContainer.style.opacity = '1';
      }
      this.scheduleTrailingCapture(false);
    } else {
      this.cancelScheduledCapture();
      this.restoreAllVisibility();
      this.removeTrailingOverlay();
      this.initOptions.onSwipeProjectionLock?.(false);
    }
  }

  private hasSwipePair(): boolean {
    return this.normalizedLeadingKeys().length > 0 && this.normalizedTrailingKeys().length > 0;
  }

  private leadingIds(): string[] {
    return resolveSiMapSwipeMapboxLayerIds(this.map, this.normalizedLeadingKeys(), this.catalog);
  }

  private trailingIds(): string[] {
    return resolveSiMapSwipeMapboxLayerIds(this.map, this.normalizedTrailingKeys(), this.catalog);
  }

  private ensureTrailingOverlay(): void {
    if (!this.mapContainer || this.clipContainer) return;

    this.clipContainer = document.createElement('div');
    this.clipContainer.className = 'si-map-layer-swipe-clip';
    this.clipContainer.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:13;overflow:hidden;will-change:clip;';

    this.captureCanvas = document.createElement('canvas');
    this.captureCanvas.className = 'si-map-layer-swipe-trailing-capture';
    this.captureCanvas.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;display:block;';

    this.clipContainer.appendChild(this.captureCanvas);
    this.mapContainer.appendChild(this.clipContainer);
  }

  private removeTrailingOverlay(): void {
    this.clipContainer?.parentNode?.removeChild(this.clipContainer);
    this.clipContainer = null;
    this.captureCanvas = null;
  }

  private bindMapEvents(): void {
    if (!this.map) return;
    this.onMoveEndHandler = () => this.scheduleTrailingCapture(false);
    this.onResizeHandler = () => {
      this.updateBounds();
      this.updateClip();
      this.scheduleTrailingCapture(false);
    };
    this.onRotateEndHandler = () => this.scheduleTrailingCapture(false);

    this.map.on('moveend', this.onMoveEndHandler);
    this.map.on('resize', this.onResizeHandler);
    this.map.on('rotateend', this.onRotateEndHandler);
    this.map.on('pitchend', this.onRotateEndHandler);
  }

  private unbindMapEvents(): void {
    if (!this.map) return;
    if (this.onMoveEndHandler) this.map.off('moveend', this.onMoveEndHandler);
    if (this.onResizeHandler) this.map.off('resize', this.onResizeHandler);
    if (this.onRotateEndHandler) {
      this.map.off('rotateend', this.onRotateEndHandler);
      this.map.off('pitchend', this.onRotateEndHandler);
    }
    this.onMoveEndHandler = null;
    this.onResizeHandler = null;
    this.onRotateEndHandler = null;
  }

  private cancelScheduledCapture(): void {
    if (this.captureDebounceTimer != null) {
      window.clearTimeout(this.captureDebounceTimer);
      this.captureDebounceTimer = null;
    }
  }

  private scheduleTrailingCapture(immediate: boolean): void {
    if (!this.state.active || !this.hasSwipePair() || !this.map) return;
    this.cancelScheduledCapture();
    const delay = immediate ? 0 : 120;
    this.captureDebounceTimer = window.setTimeout(() => {
      this.captureDebounceTimer = null;
      void this.captureTrailingOverlay();
    }, delay);
  }

  private async captureTrailingOverlay(): Promise<void> {
    if (!this.map || !this.captureCanvas || !this.state.active || !this.hasSwipePair()) return;
    if (this.captureInFlight) {
      this.scheduleTrailingCapture(false);
      return;
    }

    this.captureInFlight = true;
    const token = ++this.captureToken;

    try {
      this.applyLayerVisibility('capture');
      await waitForMapRender(this.map, 4500);
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      if (token !== this.captureToken || !this.map || !this.captureCanvas) return;

      const sourceCanvas = this.map.getCanvas();
      if (sourceCanvas?.width && sourceCanvas?.height) {
        copyCanvasContents(this.captureCanvas, sourceCanvas);
      }
    } catch {
      /* map mid-teardown */
    } finally {
      if (token === this.captureToken) {
        this.restoreCaptureVisibility();
        this.applyLayerVisibility('display');
      }
      this.captureInFlight = false;
    }
  }

  private hideLayerForCapture(layerId: string): void {
    if (!this.map?.getLayer(layerId)) return;
    try {
      const current = (this.map.getLayoutProperty(layerId, 'visibility') as string) ?? 'visible';
      if (current === 'none') return;
      this.captureVisibilityRestore.set(layerId, current);
      this.map.setLayoutProperty(layerId, 'visibility', 'none');
    } catch {
      /* layer mid-rebuild */
    }
  }

  private restoreCaptureVisibility(): void {
    if (!this.map) {
      this.captureVisibilityRestore.clear();
      return;
    }
    for (const [id, vis] of this.captureVisibilityRestore) {
      try {
        if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', vis);
      } catch {
        /* ignore */
      }
    }
    this.captureVisibilityRestore.clear();
  }

  private updateBounds(): void {
    const el = this.mapContainer;
    if (!el) return;
    this.bounds = { width: el.clientWidth, height: el.clientHeight };
  }

  private updateClip(): void {
    if (!this.clipContainer || !this.captureCanvas || !this.state.active) return;
    const { width, height } = this.bounds;
    if (width <= 0 || height <= 0) return;

    const layout = computeSiMapSwipeClipLayout(
      { width, height },
      this.state.position,
      this.state.orientation,
    );

    this.clipContainer.style.left = `${layout.clipLeft}px`;
    this.clipContainer.style.top = `${layout.clipTop}px`;
    this.clipContainer.style.width = `${layout.clipWidth}px`;
    this.clipContainer.style.height = `${layout.clipHeight}px`;
    this.captureCanvas.style.left = `${layout.innerLeft}px`;
    this.captureCanvas.style.top = `${layout.innerTop}px`;
    this.captureCanvas.style.width = `${layout.innerWidth}px`;
    this.captureCanvas.style.height = `${layout.innerHeight}px`;
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

  private applyLayerVisibility(mode: 'display' | 'capture'): void {
    if (!this.map || !this.state.active || !this.hasSwipePair()) return;

    const leading = new Set(this.leadingIds());
    const trailing = new Set(this.trailingIds());
    const style = this.map.getStyle();
    if (!style?.layers) return;

    for (const layer of style.layers) {
      const id = layer.id;
      if (isSiMapSwipeContextMapboxLayerId(id)) continue;

      const isLeading = leading.has(id);
      const isTrailing = trailing.has(id);
      const isSwipeParticipant = isLeading || isTrailing;

      try {
        if (mode === 'capture') {
          if (isLeading && !isTrailing) {
            this.hideLayerForCapture(id);
          } else {
            if (!this.originalVisibility.has(id)) {
              const vis = this.map.getLayoutProperty(id, 'visibility');
              this.originalVisibility.set(id, (vis as string) ?? 'visible');
            }
            this.map.setLayoutProperty(id, 'visibility', 'visible');
            if (isTrailing) this.applyOpacity(this.map, id, this.state.trailingOpacity);
          }
          continue;
        }

        if (!isSwipeParticipant) continue;

        if (!this.originalVisibility.has(id)) {
          const vis = this.map.getLayoutProperty(id, 'visibility');
          this.originalVisibility.set(id, (vis as string) ?? 'visible');
        }

        if (isLeading && !isTrailing) {
          this.map.setLayoutProperty(id, 'visibility', 'visible');
          this.applyOpacity(this.map, id, this.state.leadingOpacity);
        } else if (isTrailing) {
          this.map.setLayoutProperty(id, 'visibility', 'none');
        }
      } catch {
        /* layer removed mid-style rebuild */
      }
    }

    if (mode === 'display') {
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
    }
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
    this.initOptions.onSwipeProjectionLock?.(false);
  }
}
