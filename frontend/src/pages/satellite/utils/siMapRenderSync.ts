/** Mapbox GL map instance (react-map-gl ref or raw map). */
export type SiMapboxMapLike = {
  loaded?: () => boolean;
  areTilesLoaded?: () => boolean;
  isMoving?: () => boolean;
  once?: (event: string, listener: () => void) => void;
  on?: (event: string, listener: () => void) => void;
  off?: (event: string, listener: () => void) => void;
  triggerRepaint?: () => void;
};

export type WaitForMapSettleOptions = {
  timeoutMs?: number;
  /** Extra wait after idle (WMS crossfade / raster-fade-duration). */
  rasterFadeMs?: number;
  /** rAF frames after settle before resolving. */
  extraFrames?: number;
};

export function resolveSiMapboxMap(mapRef: unknown): SiMapboxMapLike | null {
  if (!mapRef || typeof mapRef !== 'object') return null;
  const wrapped = mapRef as { getMap?: () => SiMapboxMapLike };
  if (typeof wrapped.getMap === 'function') return wrapped.getMap() ?? null;
  return mapRef as SiMapboxMapLike;
}

function mapRasterSettled(map: SiMapboxMapLike): boolean {
  try {
    if (typeof map.isMoving === 'function' && map.isMoving()) return false;
  } catch {
    /* ignore */
  }
  try {
    if (typeof map.loaded === 'function' && !map.loaded()) return false;
  } catch {
    /* ignore */
  }
  try {
    if (typeof map.areTilesLoaded === 'function' && !map.areTilesLoaded()) return false;
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * Wait until Mapbox finishes tile/raster updates (ArcGIS `layerView.updating === false` equivalent).
 */
export function waitForMapboxRasterSettle(
  map: SiMapboxMapLike | null | undefined,
  opts: WaitForMapSettleOptions = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 18_000;
  const rasterFadeMs = Math.max(0, opts.rasterFadeMs ?? 0);
  const extraFrames = Math.max(0, opts.extraFrames ?? 1);

  if (!map || typeof map.once !== 'function') return Promise.resolve();

  return new Promise(resolve => {
    let finished = false;

    const complete = () => {
      if (finished) return;
      finished = true;
      cleanup();
      const afterFade = () => {
        let framesLeft = extraFrames;
        const tick = () => {
          if (framesLeft <= 0) {
            resolve();
            return;
          }
          framesLeft -= 1;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      };
      if (rasterFadeMs > 0) window.setTimeout(afterFade, rasterFadeMs);
      else afterFade();
    };

    const timeoutId = window.setTimeout(complete, timeoutMs);

    const onIdle = () => {
      if (mapRasterSettled(map)) complete();
    };

    let renderPasses = 0;
    const onRender = () => {
      renderPasses += 1;
      if (renderPasses >= 2 && mapRasterSettled(map)) complete();
    };

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      map.off?.('idle', onIdle);
      map.off?.('render', onRender);
    };

    if (mapRasterSettled(map)) {
      complete();
      return;
    }

    map.once('idle', onIdle);
    map.on?.('render', onRender);
    try {
      map.triggerRepaint?.();
    } catch {
      /* ignore */
    }
  });
}

/** Two animation frames so React can commit WMS source/key changes before polling the map. */
export function waitForReactPaint(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export function delayMs(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

type MapboxGeoJsonSourceMap = SiMapboxMapLike & {
  getSource?: (id: string) => unknown;
  isSourceLoaded?: (id: string) => boolean;
};

/** Wait until a GeoJSON source has committed features (Mapbox `sourcedata` loaded). */
export function waitForSiCustomGeoJsonSourceReady(
  map: MapboxGeoJsonSourceMap | null | undefined,
  sourceId: string,
  timeoutMs = 10_000,
): Promise<void> {
  if (!map || !sourceId) return Promise.resolve();

  return new Promise(resolve => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve();
    };

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      map.off?.('sourcedata', onSourceData);
    };

    const sourceLoaded = (): boolean => {
      try {
        if (typeof map.isSourceLoaded === 'function' && map.isSourceLoaded(sourceId)) return true;
      } catch {
        /* ignore */
      }
      try {
        const src = map.getSource?.(sourceId) as { loaded?: () => boolean } | undefined;
        if (src && typeof src.loaded === 'function' && src.loaded()) return true;
      } catch {
        /* ignore */
      }
      return false;
    };

    const onSourceData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (e?.sourceId !== sourceId) return;
      if (e.isSourceLoaded || sourceLoaded()) finish();
    };

    const timeoutId = window.setTimeout(finish, timeoutMs);

    if (sourceLoaded()) {
      finish();
      return;
    }

    map.on?.('sourcedata', onSourceData);
    try {
      map.triggerRepaint?.();
    } catch {
      /* ignore */
    }
  });
}

/** Wait until Mapbox style children are allowed to mount (basemap/style load gate). */
export async function waitForSiMapStyleLayersReady(
  isReady: () => boolean,
  timeoutMs = 20_000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isReady()) return true;
    await delayMs(50);
  }
  return isReady();
}

type MapboxStyleLayer = { id?: string };
type MapboxStyleSource = { type?: string };

type MapboxMapWithStyle = SiMapboxMapLike & {
  getStyle?: () => { layers?: MapboxStyleLayer[]; sources?: Record<string, MapboxStyleSource> } | null;
  getLayer?: (id: string) => unknown;
  getSource?: (id: string) => { loaded?: () => boolean } | null;
  isSourceLoaded?: (id: string) => boolean;
};

function mapSourceReady(map: MapboxMapWithStyle, sourceId: string): boolean {
  try {
    if (typeof map.isSourceLoaded === 'function' && map.isSourceLoaded(sourceId)) return true;
  } catch {
    /* ignore */
  }
  try {
    const src = map.getSource?.(sourceId);
    if (src && typeof src.loaded === 'function' && src.loaded()) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Wait until registered WMS raster sources/layers exist and tiles have loaded
 * (Mapbox equivalent of ArcGIS `view.whenLayerView()` + `layerView.updating === false`).
 */
export function waitForSiMapWmsRunsSettled(
  map: SiMapboxMapLike | null | undefined,
  sourceIds: readonly string[],
  layerIds: readonly string[],
  opts: WaitForMapSettleOptions = {},
): Promise<void> {
  if (!map || !sourceIds.length) return waitForMapboxRasterSettle(map, opts);

  const m = map as MapboxMapWithStyle;
  const timeoutMs = opts.timeoutMs ?? 20_000;

  return new Promise(resolve => {
    let finished = false;

    const layersPresent = (): boolean => {
      if (!m.getStyle?.()) return false;
      for (const id of layerIds) {
        try {
          if (!m.getLayer?.(id)) return false;
        } catch {
          return false;
        }
      }
      return true;
    };

    const sourcesReady = (): boolean => {
      if (!layersPresent()) return false;
      for (const id of sourceIds) {
        if (!mapSourceReady(m, id)) return false;
      }
      return mapRasterSettled(m);
    };

    const complete = () => {
      if (finished) return;
      finished = true;
      cleanup();
      void waitForMapboxRasterSettle(map, opts).then(resolve);
    };

    const timeoutId = window.setTimeout(complete, timeoutMs);

    const onIdle = () => {
      if (sourcesReady()) complete();
    };

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      m.off?.('idle', onIdle);
      m.off?.('sourcedata', onSourceData);
    };

    const onSourceData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (!e?.isSourceLoaded) return;
      if (e.sourceId && !sourceIds.includes(e.sourceId)) return;
      if (sourcesReady()) complete();
    };

    if (sourcesReady()) {
      complete();
      return;
    }

    m.on?.('idle', onIdle);
    m.on?.('sourcedata', onSourceData);
    try {
      m.triggerRepaint?.();
    } catch {
      /* ignore */
    }
  });
}
