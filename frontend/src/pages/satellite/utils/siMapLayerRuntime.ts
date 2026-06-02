import type { Map as MapboxMap } from 'mapbox-gl';
import {
  isSiMapBasemapMapboxLayerId,
  isSiMapCustomVectorMapboxLayerId,
  isSiMapOperationalMapboxLayerId,
  isSiMapUiOverlayLayerId,
} from './siMapCustomVectorLayerStack';
import { isSiMapWmsRasterLayerId } from './siMapWmsRasterLayerStack';
import {
  buildCustomLayerMapboxStyleKey,
  buildSiLayerMapDiagnosticRow,
  countGeoJsonFeatures,
  customLayerMapboxSourceId,
  ensureSiCustomLayerMapboxMount,
  flushSiCustomLayerOnMapCanvas,
  patchCustomLayerSymbologyPaintsOnMap,
  isSiCustomLayerPaintedOnMap,
  layerMapboxLayersPresent,
  resolveSiCustomLayerMountOpts,
  triggerSiMapLayerRenderSync,
  type SiCustomLayerMapMountOptions,
  type SiCustomLayerRegistryFields,
  type SiLayerMapDiagnosticRow,
} from './siMapCustomLayerRegistry';
import {
  waitForMapboxRasterSettle,
  waitForReactPaint,
  waitForSiCustomGeoJsonSourceReady,
} from './siMapRenderSync';
import {
  reconcileLayerManagerWithMapCanvas,
  type SiMapLayerReconcileReport,
} from './siMapLayerReconcile';
import { removeStaleMapboxMountsForInstance } from './siMapLayerMapboxMountCleanup';

export type SiMapLayerRuntimeSnapshot = {
  at: number;
  styleLoaded: boolean;
  totalStyleLayers: number;
  basemapLayerCount: number;
  wmsLayerCount: number;
  customVectorLayerCount: number;
  uiOverlayLayerCount: number;
  customVectorLayerIds: string[];
  layerOrderTail: string[];
  layers: SiLayerMapDiagnosticRow[];
};

export function captureSiMapLayerRuntimeSnapshot(
  map: MapboxMap | null,
  appLayers: SiCustomLayerRegistryFields[],
  opts?: { mapScale?: number },
): SiMapLayerRuntimeSnapshot | null {
  if (!map) return null;
  let styleLayers: { id: string }[] = [];
  try {
    styleLayers = map.getStyle()?.layers ?? [];
  } catch {
    return null;
  }

  const ids = styleLayers.map(l => l.id);
  const customVectorLayerIds = ids.filter(isSiMapCustomVectorMapboxLayerId);

  return {
    at: Date.now(),
    styleLoaded: Boolean(map.getStyle?.()),
    totalStyleLayers: ids.length,
    basemapLayerCount: ids.filter(isSiMapBasemapMapboxLayerId).length,
    wmsLayerCount: ids.filter(isSiMapWmsRasterLayerId).length,
    customVectorLayerCount: customVectorLayerIds.length,
    uiOverlayLayerCount: ids.filter(isSiMapUiOverlayLayerId).length,
    customVectorLayerIds: customVectorLayerIds.slice(0, 48),
    layerOrderTail: ids.slice(-12),
    layers: appLayers.map(l => buildSiLayerMapDiagnosticRow(l, map, opts?.mapScale)),
  };
}

/** Mapbox is the source of truth for mount state; reconcile every app layer onto the GL stack. */
export function syncAllCustomLayersOnMap(
  map: MapboxMap | null,
  appLayers: SiCustomLayerRegistryFields[],
  mountOpts?: SiCustomLayerMapMountOptions,
): { mounted: number; missing: string[]; reconcile: SiMapLayerReconcileReport } {
  const emptyReconcile: SiMapLayerReconcileReport = {
    at: Date.now(),
    orphanAppLayerIdsRemoved: [],
    staleRevisionMountsRemoved: 0,
    remounted: [],
    stillMissing: [],
    hiddenPurged: [],
  };
  if (!map || !map.getStyle?.()) return { mounted: 0, missing: [], reconcile: emptyReconcile };

  const reconcile = reconcileLayerManagerWithMapCanvas(map, appLayers, mountOpts);
  const missing = [...reconcile.stillMissing];
  let mounted = 0;
  for (const layer of appLayers) {
    if (layer.visible === false) continue;
    const fc = countGeoJsonFeatures(layer.geojson);
    if (fc === 0 && layer.renderMode !== 'raster' && layer.renderMode !== 'bim') continue;
    if (layerMapboxLayersPresent(map, layer)) mounted += 1;
    else if (!missing.includes(layer.id)) missing.push(layer.id);
  }
  return { mounted, missing, reconcile };
}

/** In-place 2D ↔ 3D paint swap without remounting GeoJSON sources. */
export function syncSiElevationViewLayersOnMap(
  map: MapboxMap | null | undefined,
  appLayers: SiCustomLayerRegistryFields[],
  elevation3d: boolean,
): void {
  if (!map?.getStyle?.()) return;
  const mountOpts: SiCustomLayerMapMountOptions = { elevation3d };
  for (const layer of appLayers) {
    if (layer.visible === false) continue;
    const fc = countGeoJsonFeatures(layer.geojson);
    if (fc === 0 && layer.renderMode !== 'raster' && layer.renderMode !== 'bim') continue;
    flushSiCustomLayerOnMapCanvas(map, layer, mountOpts);
  }
  syncAllCustomLayersOnMap(map, appLayers, mountOpts);
  triggerSiMapLayerRenderSync(map);
  try {
    map.triggerRepaint?.();
  } catch {
    /* ignore */
  }
}

/**
 * Aggressive paint burst after add / catalog change — forces visible symbology and
 * re-stacks layers above basemap until Mapbox idles (ArcGIS view.requestRender loop).
 */
export function burstForceCustomLayersOnMap(
  map: MapboxMap | null | undefined,
  appLayers: SiCustomLayerRegistryFields[],
  mountOpts?: SiCustomLayerMapMountOptions,
): void {
  if (!map?.getStyle?.()) return;

  const run = () => {
    for (const layer of appLayers) {
      if (layer.visible === false) continue;
      const fc = countGeoJsonFeatures(layer.geojson);
      if (fc === 0 && layer.renderMode !== 'raster' && layer.renderMode !== 'bim') continue;
      flushSiCustomLayerOnMapCanvas(map, layer, mountOpts);
    }
    syncAllCustomLayersOnMap(map, appLayers, mountOpts);
    try {
      map.triggerRepaint?.();
    } catch {
      /* ignore */
    }
  };

  run();
  let frame = 0;
  const pump = () => {
    run();
    if (++frame < 14) requestAnimationFrame(pump);
  };
  requestAnimationFrame(pump);
  try {
    map.once('idle', run);
  } catch {
    /* ignore */
  }
  window.setTimeout(run, 180);
  window.setTimeout(run, 520);
}

/** Immediate style/symbology commit — drop stale GL mounts and repaint without long settle waits. */
export function flushCustomLayerStyleCommitOnMap(
  map: MapboxMap | null | undefined,
  layer: SiCustomLayerRegistryFields,
  allLayers: SiCustomLayerRegistryFields[],
  mountOpts?: SiCustomLayerMapMountOptions,
): void {
  if (!map?.getStyle?.()) return;
  const resolved = resolveSiCustomLayerMountOpts(layer, mountOpts);
  if (layer.symbologyPreview === true) {
    patchCustomLayerSymbologyPaintsOnMap(map, layer, resolved);
    try {
      map.triggerRepaint?.();
    } catch {
      /* ignore */
    }
    return;
  }
  removeStaleMapboxMountsForInstance(map, layer.id, customLayerMapboxSourceId(layer));
  flushSiCustomLayerOnMapCanvas(map, layer, resolved);
  reconcileLayerManagerWithMapCanvas(map, allLayers, resolved);
  syncAllCustomLayersOnMap(map, allLayers, resolved);
  burstForceCustomLayersOnMap(map, allLayers, resolved);
  triggerSiMapLayerRenderSync(map);
}

/** Post-add Mapbox refresh: reconcile GL stack after React commits the GeoJSON source. */
export async function refreshCustomLayerMapDisplay(
  map: MapboxMap | null | undefined,
  layer: SiCustomLayerRegistryFields,
  mountOpts?: SiCustomLayerMapMountOptions,
): Promise<void> {
  if (!map) return;
  const resolved = resolveSiCustomLayerMountOpts(layer, mountOpts);
  await waitForReactPaint();
  syncAllCustomLayersOnMap(map, [layer], resolved);
  flushSiCustomLayerOnMapCanvas(map, layer, resolved);
  await waitForSiCustomGeoJsonSourceReady(map, customLayerMapboxSourceId(layer));
  flushSiCustomLayerOnMapCanvas(map, layer, resolved);
  await waitForMapboxRasterSettle(map, { extraFrames: 2, rasterFadeMs: 0 });
  syncAllCustomLayersOnMap(map, [layer], resolved);
  flushSiCustomLayerOnMapCanvas(map, layer, resolved);
}

/**
 * Commit pipeline tail: imperative mount + repaint until the layer is on the GL stack
 * (Mapbox equivalent of ArcGIS `view.whenLayerView(layer)`).
 */
export async function publishCustomLayerToMapCanvas(
  map: MapboxMap | null | undefined,
  layer: SiCustomLayerRegistryFields,
  allLayers: SiCustomLayerRegistryFields[],
  mountOpts?: SiCustomLayerMapMountOptions,
): Promise<boolean> {
  if (!map) return false;
  const resolved = resolveSiCustomLayerMountOpts(layer, mountOpts);
  await refreshCustomLayerMapDisplay(map, layer, resolved);
  ensureSiCustomLayerMapboxMount(map, layer, resolved);
  syncAllCustomLayersOnMap(map, allLayers, resolved);
  flushSiCustomLayerOnMapCanvas(map, layer, resolved);
  burstForceCustomLayersOnMap(map, allLayers, resolved);
  await waitForMapboxRasterSettle(map, { extraFrames: 1, rasterFadeMs: 0 });
  reconcileLayerManagerWithMapCanvas(map, allLayers, resolved);
  flushSiCustomLayerOnMapCanvas(map, layer, resolved);
  return (
    layerMapboxLayersPresent(map, layer) &&
    isSiCustomLayerPaintedOnMap(map, layer, resolved)
  );
}

export { reconcileLayerManagerWithMapCanvas, type SiMapLayerReconcileReport } from './siMapLayerReconcile';

export function logSiMapLayerRuntimeReport(
  map: MapboxMap | null,
  appLayers: SiCustomLayerRegistryFields[],
  extra?: Record<string, unknown>,
): void {
  const snap = captureSiMapLayerRuntimeSnapshot(map, appLayers);
  if (!snap) {
    console.warn('[si-map][runtime] no map instance');
    return;
  }
  const panelCount = appLayers.filter(l => l.visible !== false).length;
  const ready = snap.layers.filter(r => r.layerViewStatus === 'ready').length;
  const missing = snap.layers.filter(r => r.layerViewStatus === 'missing').map(r => r.name);
  console.info('[si-map][runtime]', {
    panelVisibleLayers: panelCount,
    mapReadyLayerViews: ready,
    mapMissingLayerViews: snap.layers.length - ready,
    missingNames: missing.length ? missing : undefined,
    styleLayers: snap.totalStyleLayers,
    customVectorMapboxLayers: snap.customVectorLayerCount,
    wmsLayers: snap.wmsLayerCount,
    basemapLayers: snap.basemapLayerCount,
    stackTail: snap.layerOrderTail,
    ...extra,
  });
  for (const row of snap.layers) {
    console.info('[si-map][layer-view]', row);
  }
}

/** True when a style layer id belongs to the operational stack (not basemap-only). */
export function isOperationalMapboxLayerId(layerId: string): boolean {
  return isSiMapOperationalMapboxLayerId(layerId);
}

export function customLayerStyleKeyForRuntime(layer: SiCustomLayerRegistryFields): string {
  return buildCustomLayerMapboxStyleKey(layer, { mapOpacity: layer.mapOpacity ?? 1 });
}
