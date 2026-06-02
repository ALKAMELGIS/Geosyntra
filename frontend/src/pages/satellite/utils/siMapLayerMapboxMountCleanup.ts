import type { Map as MapboxMap } from 'mapbox-gl';
import { isSiMapCustomVectorMapboxLayerId } from './siMapCustomVectorLayerStack';

/** App layer id from Mapbox layer id `{appId}--{styleSlug}-fill`. */
export function extractSiAppLayerIdFromMapboxLayerId(mapboxLayerId: string): string | null {
  if (!isSiMapCustomVectorMapboxLayerId(mapboxLayerId)) return null;
  const idx = mapboxLayerId.indexOf('--');
  if (idx <= 0) return null;
  return mapboxLayerId.slice(0, idx);
}

/** App layer id from Mapbox GeoJSON source id `{appId}--{styleSlug}`. */
export function extractSiAppLayerIdFromMapboxSourceId(sourceId: string): string | null {
  const idx = sourceId.indexOf('--');
  if (idx <= 0) return null;
  if (sourceId.startsWith('si-')) return null;
  return sourceId.slice(0, idx);
}

export function collectMapboxCustomLayerAppIds(map: MapboxMap): Set<string> {
  const ids = new Set<string>();
  try {
    for (const layer of map.getStyle()?.layers ?? []) {
      const appId = extractSiAppLayerIdFromMapboxLayerId(layer.id);
      if (appId) ids.add(appId);
    }
    for (const sourceId of Object.keys(map.getStyle()?.sources ?? {})) {
      const appId = extractSiAppLayerIdFromMapboxSourceId(sourceId);
      if (appId) ids.add(appId);
    }
  } catch {
    /* style unavailable */
  }
  return ids;
}

/** Remove every Mapbox source/layer mount for an app layer (all symbology revisions). */
export function removeAllMapboxMountsForAppLayerId(map: MapboxMap | null | undefined, appLayerId: string): void {
  if (!map?.getStyle?.() || !appLayerId) return;
  const prefix = `${appLayerId}--`;
  try {
    const layerIds = (map.getStyle()?.layers ?? []).map(l => l.id).filter(id => id.startsWith(prefix));
    for (const layerId of layerIds) {
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const sourceIds = Object.keys(map.getStyle()?.sources ?? {}).filter(
      sid => sid.startsWith(prefix) || sid === appLayerId || sid === `${appLayerId}-extent`,
    );
    for (const sourceId of sourceIds) {
      try {
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/** Drop Mapbox mounts whose style slug differs from the current instance id. */
export function removeStaleMapboxMountsForInstance(
  map: MapboxMap,
  appLayerId: string,
  currentInstanceId: string,
): number {
  const prefix = `${appLayerId}--`;
  let removed = 0;
  try {
    const staleLayerIds = (map.getStyle()?.layers ?? [])
      .map(l => l.id)
      .filter(id => id.startsWith(prefix) && !id.startsWith(`${currentInstanceId}-`));
    for (const layerId of staleLayerIds) {
      try {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
          removed += 1;
        }
      } catch {
        /* ignore */
      }
    }
    const staleSourceIds = Object.keys(map.getStyle()?.sources ?? {}).filter(
      sid => sid.startsWith(prefix) && sid !== currentInstanceId,
    );
    for (const sourceId of staleSourceIds) {
      try {
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
          removed += 1;
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return removed;
}
