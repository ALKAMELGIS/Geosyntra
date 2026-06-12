import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import type { BasemapCatalogEntry } from '../basemapCatalog';
import {
  scheduleSiMapLayerControlMount,
  unmountSiMapLayerControl,
} from '../utils/siMapLayerControlRuntime';
import 'maplibre-gl-layer-control/style.css';
import './siMapLayerControlTheme.css';

export type SiMapLayerControlMountProps = {
  mapRef: RefObject<{ getMap?: () => MapboxMap } | MapboxMap | null>;
  mapLoaded: boolean;
  active: boolean;
  basemapEntry?: BasemapCatalogEntry | null;
  /** Changes when basemap swaps — remounts control against the new style stack. */
  basemapStyleSig?: string;
};

function resolveMapInstance(
  mapRef: SiMapLayerControlMountProps['mapRef'],
): MapboxMap | null {
  const raw = mapRef.current;
  if (!raw) return null;
  const map = typeof (raw as { getMap?: () => MapboxMap }).getMap === 'function'
    ? (raw as { getMap: () => MapboxMap }).getMap()
    : (raw as MapboxMap);
  return map ?? null;
}

/**
 * Imperative MapLibre Layer Control on the Mapbox GL canvas — toggled from the map toolbox rail.
 */
export function SiMapLayerControlMount({
  mapRef,
  mapLoaded,
  active,
  basemapEntry = null,
  basemapStyleSig = '',
}: SiMapLayerControlMountProps) {
  useEffect(() => {
    const map = resolveMapInstance(mapRef);
    if (!map || !mapLoaded || !active) {
      if (map) unmountSiMapLayerControl(map);
      return;
    }

    let cancelled = false;
    const cancelReady = scheduleSiMapLayerControlMount(
      map,
      { collapsed: false, basemapEntry },
      () => cancelled,
    );

    return () => {
      cancelled = true;
      cancelReady();
      unmountSiMapLayerControl(map);
    };
  }, [mapRef, mapLoaded, active, basemapEntry, basemapStyleSig]);

  return null;
}
