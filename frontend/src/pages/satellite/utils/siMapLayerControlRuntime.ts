import { LayerControl } from 'maplibre-gl-layer-control';
import type { IControl, Map as MapboxMap } from 'mapbox-gl';
import type { BasemapCatalogEntry } from '../basemapCatalog';
import { whenMapboxStyleReady } from './mapboxStyleReady';

const controlByMap = new WeakMap<MapboxMap, LayerControl>();
const basemapBlobByMap = new WeakMap<MapboxMap, string>();

export type SiMapLayerControlMountOptions = {
  collapsed?: boolean;
  basemapEntry?: BasemapCatalogEntry | null;
};

function revokeBasemapBlob(map: MapboxMap): void {
  const url = basemapBlobByMap.get(map);
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
  basemapBlobByMap.delete(map);
}

function resolveBasemapStyleUrl(entry: BasemapCatalogEntry | null | undefined): string | undefined {
  if (!entry) return undefined;
  const style = entry.mapboxStyle;
  if (typeof style === 'string' && style.trim()) return style.trim();
  return undefined;
}

function createBasemapStyleBlobUrl(entry: BasemapCatalogEntry): string | undefined {
  const style = entry.mapboxStyle;
  if (typeof style !== 'object' || style == null) return undefined;
  try {
    return URL.createObjectURL(new Blob([JSON.stringify(style)], { type: 'application/json' }));
  } catch {
    return undefined;
  }
}

function buildLayerControlOptions(
  map: MapboxMap,
  opts?: SiMapLayerControlMountOptions,
): ConstructorParameters<typeof LayerControl>[0] {
  const entry = opts?.basemapEntry ?? null;
  revokeBasemapBlob(map);

  let basemapStyleUrl = resolveBasemapStyleUrl(entry);
  if (!basemapStyleUrl && entry) {
    const blob = createBasemapStyleBlobUrl(entry);
    if (blob) {
      basemapBlobByMap.set(map, blob);
      basemapStyleUrl = blob;
    }
  }

  return {
    collapsed: opts?.collapsed ?? false,
    panelWidth: 340,
    panelMinWidth: 240,
    panelMaxWidth: 450,
    excludeDrawnLayers: true,
    excludeLayers: ['mapbox-gl-*', '*-gl-draw-*', '*-vertex*', '*-midpoint*'],
    ...(basemapStyleUrl ? { basemapStyleUrl } : {}),
  };
}

/** Mount MapLibre Layer Control on the live Mapbox GL canvas (API-compatible). */
export function mountSiMapLayerControl(
  map: MapboxMap,
  opts?: SiMapLayerControlMountOptions,
): LayerControl {
  unmountSiMapLayerControl(map);
  const control = new LayerControl(buildLayerControlOptions(map, opts));
  map.addControl(control as unknown as IControl, 'top-right');
  controlByMap.set(map, control);
  return control;
}

export function unmountSiMapLayerControl(map: MapboxMap): void {
  const control = controlByMap.get(map);
  if (!control) {
    revokeBasemapBlob(map);
    return;
  }
  try {
    map.removeControl(control as unknown as IControl);
  } catch {
    /* style reload */
  }
  controlByMap.delete(map);
  revokeBasemapBlob(map);
}

export function siMapLayerControlIsMounted(map: MapboxMap): boolean {
  return controlByMap.has(map);
}

/** Wait for style, then mount — safe after basemap swaps. */
export function scheduleSiMapLayerControlMount(
  map: MapboxMap,
  opts?: SiMapLayerControlMountOptions,
  isCancelled?: () => boolean,
): () => void {
  return whenMapboxStyleReady(
    map,
    () => {
      if (isCancelled?.()) return;
      mountSiMapLayerControl(map, opts);
    },
    isCancelled,
    { waitForIdle: false },
  );
}

export function resetSiMapLayerControlForTests(map?: MapboxMap): void {
  if (map) unmountSiMapLayerControl(map);
}
