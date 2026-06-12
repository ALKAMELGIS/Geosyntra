import {
  buildCustomLayerMapboxStyleKey,
  countGeoJsonFeatures,
  isSiCustomLayerMapRefreshInFlight,
  prepareCustomLayerForMap,
  type SiCustomLayerLoadStatus,
  type SiCustomLayerRegistryFields,
} from './siMapCustomLayerRegistry';

export type SiCustomLayerRefreshMeta = {
  mapCommittedGeojson?: unknown;
  mapCommittedStyleKey?: string;
};

export { isSiCustomLayerMapRefreshInFlight };

/** Layer fields used for stable Mapbox / React mount while a refresh completes off-screen. */
export function resolveSiCustomLayerMapDisplayLayer<T extends SiCustomLayerRegistryFields>(layer: T): T {
  if (!layer.mapCommittedGeojson) return layer;
  if (layer.loadStatus !== 'refreshing' && layer.loadStatus !== 'loading') return layer;
  return { ...layer, geojson: layer.mapCommittedGeojson };
}

/**
 * Begin a background refresh: keep the committed snapshot on the map while new data/styles
 * are prepared (ArcGIS Pro / Google Earth style double-buffer).
 */
export function beginSiCustomLayerMapRefresh<T extends SiCustomLayerRegistryFields>(
  existing: T,
  patch: Partial<T> = {},
): T {
  const hadDisplay =
    countGeoJsonFeatures(existing.geojson) > 0 ||
    existing.loadStatus === 'loaded' ||
    Boolean(existing.mapCommittedGeojson);
  const committedGeojson = existing.mapCommittedGeojson ?? existing.geojson;
  const committedStyleKey =
    existing.mapCommittedStyleKey ?? buildCustomLayerMapboxStyleKey(existing as SiCustomLayerRegistryFields);

  return prepareCustomLayerForMap({
    ...existing,
    ...patch,
    loadStatus: 'refreshing' as SiCustomLayerLoadStatus,
    mapRenderRevision: existing.mapRenderRevision ?? 0,
    ...(hadDisplay
      ? {
          mapCommittedGeojson: committedGeojson,
          mapCommittedStyleKey: committedStyleKey,
        }
      : {}),
  }) as T;
}

export type FinalizeSiCustomLayerMapRefreshOpts = {
  /** Bump Mapbox mount generation only when symbology / slug must change (not geojson-only). */
  bumpRevision?: boolean;
};

/** Atomic swap: drop committed snapshot and mark layer ready for display. */
export function finalizeSiCustomLayerMapRefresh<T extends SiCustomLayerRegistryFields>(
  layer: T,
  ok: boolean,
  featureCount: number,
  opts?: FinalizeSiCustomLayerMapRefreshOpts,
): T {
  let next = prepareCustomLayerForMap({
    ...layer,
    mapCommittedGeojson: undefined,
    mapCommittedStyleKey: undefined,
    loadStatus: ok ? (featureCount > 0 ? 'loaded' : 'empty') : 'failed',
    lastMapSyncAt: Date.now(),
    lastMapSyncError: ok ? null : layer.lastMapSyncError ?? 'layer-view-not-ready',
  }) as T;

  if (ok && opts?.bumpRevision) {
    next = {
      ...next,
      mapRenderRevision: (next.mapRenderRevision ?? 0) + 1,
    } as T;
  }
  return next;
}

/** Stack-sync signature — excludes feature counts; includes 2D/3D mode for extrusion swaps. */
export function buildCustomLayerStackSyncSig(
  layers: SiCustomLayerRegistryFields[],
  styleKeyForLayer: (layer: SiCustomLayerRegistryFields) => string,
  elevation3d = false,
): string {
  const mode = elevation3d ? '3d' : '2d';
  return `${mode}|${layers
    .map(l => {
      const vis = l.visible !== false ? '1' : '0';
      const status = l.loadStatus ?? 'idle';
      const styleKey = l.mapCommittedStyleKey ?? styleKeyForLayer(l);
      const revToken = String(l.mapRenderRevision ?? 0);
      return `${l.id}:${vis}:${status}:${revToken}:${styleKey}`;
    })
    .join('|')}`;
}
