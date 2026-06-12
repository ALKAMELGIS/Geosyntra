import type { Map as MapboxMap } from 'mapbox-gl';

/** True when Mapbox GL allows adding sources/layers (avoids "Style is not done loading"). */
export function isMapboxStyleReady(map: MapboxMap | null | undefined): boolean {
  if (!map) return false;
  try {
    return typeof map.isStyleLoaded === 'function' && map.isStyleLoaded();
  } catch {
    return false;
  }
}

/** True when `getSource` / `addSource` are safe (style loaded and not mid-reload). */
export function siMapboxSourcesAccessible(map: MapboxMap | null | undefined): boolean {
  if (!isMapboxStyleReady(map)) return false;
  try {
    map!.getStyle();
    return true;
  } catch {
    return false;
  }
}

export type WhenMapboxStyleReadyOptions = {
  /** When false, run after `style.load` only (faster basemap first paint). Default true. */
  waitForIdle?: boolean;
};

/**
 * Invoke `onReady` after the map style is loaded. Uses style.load + idle + rAF so
 * sprite/glyph work finishes before react-map-gl mounts <Source>/<Layer> children.
 */
export function whenMapboxStyleReady(
  map: MapboxMap,
  onReady: () => void,
  isCancelled?: () => boolean,
  options?: WhenMapboxStyleReadyOptions,
): () => void {
  const waitForIdle = options?.waitForIdle !== false;
  let settled = false;
  const finish = () => {
    if (settled || isCancelled?.()) return;
    if (!isMapboxStyleReady(map)) return;
    requestAnimationFrame(() => {
      if (settled || isCancelled?.()) return;
      if (!isMapboxStyleReady(map)) return;
      settled = true;
      onReady();
    });
  };

  if (isMapboxStyleReady(map)) {
    finish();
    return () => {
      settled = true;
    };
  }

  const onStyle = () => finish();
  const onIdle = () => finish();
  try {
    map.once('style.load', onStyle);
    if (waitForIdle) map.once('idle', onIdle);
  } catch {
    /* ignore */
  }

  return () => {
    settled = true;
    try {
      map.off('style.load', onStyle);
      if (waitForIdle) map.off('idle', onIdle);
    } catch {
      /* ignore */
    }
  };
}

/** Force Mapbox to recalculate canvas size after layout / token / basemap changes. */
export function resizeMapboxMap(map: MapboxMap | null | undefined): void {
  if (!map) return
  try {
    if (typeof map.resize === 'function') map.resize()
  } catch {
    /* ignore */
  }
}

export function resizeMapboxMapSoon(map: MapboxMap | null | undefined): void {
  resizeMapboxMap(map)
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => resizeMapboxMap(map))
  }
}
