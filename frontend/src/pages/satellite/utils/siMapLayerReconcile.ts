import type { Map as MapboxMap } from 'mapbox-gl';
import {
  countGeoJsonFeatures,
  customLayerMapboxSourceId,
  ensureSiCustomLayerMapboxMount,
  isSiCustomLayerPaintedOnMap,
  layerMapboxLayersPresent,
  triggerSiMapLayerRenderSync,
  type SiCustomLayerMapMountOptions,
  type SiCustomLayerRegistryFields,
} from './siMapCustomLayerRegistry';
import {
  collectMapboxCustomLayerAppIds,
  removeAllMapboxMountsForAppLayerId,
  removeStaleMapboxMountsForInstance,
} from './siMapLayerMapboxMountCleanup';
import { isSiCustomLayerMapRefreshInFlight } from './siMapCustomLayerRegistry';
import { withSiMapLayerMountElevation3d } from './siMapLayerElevation3dState';
import { isSiMapElevationTransitionActive } from './siMapLayerTransitionGuard';

export {
  collectMapboxCustomLayerAppIds,
  extractSiAppLayerIdFromMapboxLayerId,
  extractSiAppLayerIdFromMapboxSourceId,
  removeAllMapboxMountsForAppLayerId,
} from './siMapLayerMapboxMountCleanup';

export type SiMapLayerReconcileReport = {
  at: number;
  orphanAppLayerIdsRemoved: string[];
  staleRevisionMountsRemoved: number;
  remounted: string[];
  stillMissing: string[];
  hiddenPurged: string[];
};

/**
 * Layer Manager is SSOT: purge map orphans, stale revision mounts, and remount missing layers.
 */
export function reconcileLayerManagerWithMapCanvas(
  map: MapboxMap | null | undefined,
  appLayers: SiCustomLayerRegistryFields[],
  mountOpts?: SiCustomLayerMapMountOptions,
): SiMapLayerReconcileReport {
  const report: SiMapLayerReconcileReport = {
    at: Date.now(),
    orphanAppLayerIdsRemoved: [],
    staleRevisionMountsRemoved: 0,
    remounted: [],
    stillMissing: [],
    hiddenPurged: [],
  };
  if (!map?.getStyle?.()) return report;
  if (isSiMapElevationTransitionActive()) return report;

  const activeById = new Map(appLayers.map(l => [l.id, l]));
  const mapAppIds = collectMapboxCustomLayerAppIds(map);

  for (const appId of mapAppIds) {
    if (!activeById.has(appId)) {
      removeAllMapboxMountsForAppLayerId(map, appId);
      report.orphanAppLayerIdsRemoved.push(appId);
    }
  }

  for (const layer of appLayers) {
    const refreshInFlight = isSiCustomLayerMapRefreshInFlight(layer);
    if (layer.symbologyPreview !== true && !refreshInFlight) {
      report.staleRevisionMountsRemoved += removeStaleMapboxMountsForInstance(
        map,
        layer.id,
        customLayerMapboxSourceId(layer),
      );
    }

    if (layer.visible === false) {
      if (layerMapboxLayersPresent(map, layer) || mapAppIds.has(layer.id)) {
        removeAllMapboxMountsForAppLayerId(map, layer.id);
        report.hiddenPurged.push(layer.id);
      }
      continue;
    }

    const fc = countGeoJsonFeatures(layer.geojson);
    if (fc === 0 && layer.renderMode !== 'raster' && layer.renderMode !== 'bim') continue;

    const resolvedOpts = withSiMapLayerMountElevation3d({
      ...mountOpts,
      forceVisiblePaints:
        mountOpts?.forceVisiblePaints ?? layer.symbology?.userConfigured !== true,
    });

    if (layerMapboxLayersPresent(map, layer)) {
      const painted = isSiCustomLayerPaintedOnMap(map, layer, resolvedOpts);
      if (!painted || resolvedOpts.forceVisiblePaints) {
        const ok = ensureSiCustomLayerMapboxMount(map, layer, resolvedOpts);
        if (ok) report.remounted.push(layer.id);
      }
      continue;
    }

    const ok = ensureSiCustomLayerMapboxMount(map, layer, resolvedOpts);
    if (ok || layerMapboxLayersPresent(map, layer)) report.remounted.push(layer.id);
    else report.stillMissing.push(layer.id);
  }

  triggerSiMapLayerRenderSync(map);
  return report;
}
