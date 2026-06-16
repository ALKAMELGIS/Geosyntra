import type { Map as MapboxMap } from 'mapbox-gl';
import {
  countGeoJsonFeatures,
  customLayerMapboxSourceId,
  layerMapboxLayersPresent,
  type SiCustomLayerRegistryFields,
} from './siMapCustomLayerRegistry';
import { isSiMapBasemapMapboxLayerId } from './siMapCustomVectorLayerStack';
import { isSiMapWmsRasterLayerId } from './siMapWmsRasterLayerStack';
import { BUILDINGS_LAYER_ID, HILLSHADE_LAYER_ID } from './siMapProjectionTerrain';
import {
  SI_MAP_SWIPE_LAYER_LIVE_KEY,
  SI_MAP_SWIPE_SIDE_A_KEY,
  SI_MAP_SWIPE_SIDE_B_KEY,
} from './siMapSwipeKeys';
import {
  computeSiMapFullCompareClipLayout,
  computeSiMapSpyglassClipLayout,
  computeSiMapSwipeClipLayout,
  type SiMapSwipeClipRect,
} from './siMapSwipeClipLayout';

export {
  computeSiMapSwipeClipLayout,
  computeSiMapSpyglassClipLayout,
  computeSiMapFullCompareClipLayout,
};
export type { SiMapSwipeClipRect };

export {
  SI_MAP_SWIPE_LAYER_LIVE_KEY,
  SI_MAP_SWIPE_SIDE_A_KEY,
  SI_MAP_SWIPE_SIDE_B_KEY,
} from './siMapSwipeKeys';

function isSiMapEarthHybridUnderlayLayerId(layerId: string): boolean {
  return (
    layerId === 'si-earth-terrain-underlay-layer' ||
    layerId === 'si-esri-elevation-hillshade-underlay-layer'
  );
}

export type SiMapSwipeLayerKind = 'basemap' | 'wms' | 'custom' | 'swipe-side';

export type SiMapSwipeLayerEntry = {
  key: string;
  label: string;
  kind: SiMapSwipeLayerKind;
  mapboxLayerIds: string[];
};

export const SI_MAP_SWIPE_BASEMAP_KEY = 'basemap';

export const SI_MAP_SWIPE_WMS_LAYER_A_ID = 'si-swipe-wms-layer-a';
export const SI_MAP_SWIPE_WMS_LAYER_B_ID = 'si-swipe-wms-layer-b';
export const SI_MAP_SWIPE_WMS_SOURCE_A_ID = 'si-swipe-wms-src-a';
export const SI_MAP_SWIPE_WMS_SOURCE_B_ID = 'si-swipe-wms-src-b';

export function isSiMapSwipeWmsLayerId(layerId: string): boolean {
  return layerId === SI_MAP_SWIPE_WMS_LAYER_A_ID || layerId === SI_MAP_SWIPE_WMS_LAYER_B_ID;
}

/** Basemap + scene context layers stay visible on both sides of the swipe divider. */
export function isSiMapSwipeContextMapboxLayerId(layerId: string): boolean {
  return (
    isSiMapBasemapMapboxLayerId(layerId) ||
    isSiMapEarthHybridUnderlayLayerId(layerId) ||
    layerId === BUILDINGS_LAYER_ID ||
    layerId === HILLSHADE_LAYER_ID ||
    layerId.startsWith('si-terrain-')
  );
}

export function isSiMapSwipeComparableCatalogEntry(entry: SiMapSwipeLayerEntry): boolean {
  return entry.kind !== 'basemap';
}

export function filterSiMapSwipeComparableKeys(keys: string[]): string[] {
  return keys.filter(k => k !== SI_MAP_SWIPE_BASEMAP_KEY);
}

export function buildSiMapSwipeComparableCatalog(catalog: SiMapSwipeLayerEntry[]): SiMapSwipeLayerEntry[] {
  return catalog.filter(isSiMapSwipeComparableCatalogEntry);
}

export function siMapSwipeKeyForCustomLayer(layerId: string): string {
  return `custom:${layerId}`;
}

export function siMapSwipeKeyForWmsLayer(mapboxLayerId: string): string {
  return `wms:${mapboxLayerId}`;
}

export function resolveSiMapSwipeMapboxLayerIds(
  map: MapboxMap | null,
  keys: string[],
  catalog: SiMapSwipeLayerEntry[],
): string[] {
  if (!map || !keys.length) return [];
  const byKey = new Map(catalog.map(e => [e.key, e]));
  const out = new Set<string>();
  for (const key of keys) {
    const entry = byKey.get(key);
    if (entry) {
      for (const id of entry.mapboxLayerIds) out.add(id);
      continue;
    }
    if (key === SI_MAP_SWIPE_BASEMAP_KEY) {
      for (const id of listSiMapBasemapLayerIds(map)) out.add(id);
      continue;
    }
    if (key === SI_MAP_SWIPE_LAYER_LIVE_KEY) {
      for (const id of listSiMapLayerLiveLayerIds(map)) out.add(id);
      continue;
    }
    if (key === SI_MAP_SWIPE_SIDE_A_KEY) {
      out.add(SI_MAP_SWIPE_WMS_LAYER_A_ID);
      continue;
    }
    if (key === SI_MAP_SWIPE_SIDE_B_KEY) {
      out.add(SI_MAP_SWIPE_WMS_LAYER_B_ID);
      continue;
    }
  }
  return [...out];
}

function listSiMapLayerLiveLayerIds(map: MapboxMap): string[] {
  try {
    return (map.getStyle()?.layers ?? []).map(l => l.id).filter(isSiMapWmsRasterLayerId);
  } catch {
    return [];
  }
}

function listSiMapBasemapLayerIds(map: MapboxMap): string[] {
  try {
    return (map.getStyle()?.layers ?? []).map(l => l.id).filter(id => isSiMapBasemapMapboxLayerId(id));
  } catch {
    return [];
  }
}

function collectCustomLayerMapboxIds(styleLayerIds: string[], layer: SiCustomLayerRegistryFields): string[] {
  const prefix = `${customLayerMapboxSourceId(layer)}-`;
  const ids = styleLayerIds.filter(id => id.startsWith(prefix));
  const rasterId = `${layer.id}-raster`;
  if (!ids.includes(rasterId) && styleLayerIds.includes(rasterId)) ids.push(rasterId);
  const extentId = `${layer.id}-extent-line`;
  if (!ids.includes(extentId) && styleLayerIds.includes(extentId)) ids.push(extentId);
  return ids;
}

/** Dedicated swipe A/B raster layers in the same Mapbox style (mounted by SiMapSwipeRasterLayers). */
export function buildSiMapSwipeSideCatalogEntries(opts?: {
  layerALabel?: string;
  layerBLabel?: string;
}): SiMapSwipeLayerEntry[] {
  return [
    {
      key: SI_MAP_SWIPE_SIDE_A_KEY,
      label: opts?.layerALabel?.trim() || 'Layer A',
      kind: 'swipe-side',
      mapboxLayerIds: [SI_MAP_SWIPE_WMS_LAYER_A_ID],
    },
    {
      key: SI_MAP_SWIPE_SIDE_B_KEY,
      label: opts?.layerBLabel?.trim() || 'Layer B',
      kind: 'swipe-side',
      mapboxLayerIds: [SI_MAP_SWIPE_WMS_LAYER_B_ID],
    },
  ];
}

export function buildSiMapSwipeLayerCatalog(
  map: MapboxMap | null,
  customLayers: SiCustomLayerRegistryFields[],
  opts?: {
    basemapLabel?: string;
    layerLiveLabel?: string;
    layerALabel?: string;
    layerBLabel?: string;
    includeSwipeSides?: boolean;
  },
): SiMapSwipeLayerEntry[] {
  const entries: SiMapSwipeLayerEntry[] = [];
  if (opts?.includeSwipeSides !== false) {
    entries.push(...buildSiMapSwipeSideCatalogEntries(opts));
  }

  if (!map?.getStyle?.()) return entries;

  const styleLayerIds = (map.getStyle()?.layers ?? []).map(l => l.id);

  const basemapIds = styleLayerIds.filter(isSiMapBasemapMapboxLayerId);
  if (basemapIds.length) {
    entries.push({
      key: SI_MAP_SWIPE_BASEMAP_KEY,
      label: opts?.basemapLabel?.trim() || 'Base Map Layer',
      kind: 'basemap',
      mapboxLayerIds: basemapIds,
    });
  }

  const wmsIds = styleLayerIds.filter(isSiMapWmsRasterLayerId);
  if (wmsIds.length) {
    entries.push({
      key: SI_MAP_SWIPE_LAYER_LIVE_KEY,
      label: opts?.layerLiveLabel?.trim() || 'Layer Live',
      kind: 'wms',
      mapboxLayerIds: wmsIds,
    });
  }

  for (const layer of customLayers) {
    if (layer.visible === false) continue;
    const fc = countGeoJsonFeatures(layer.geojson);
    const hasRaster = layer.renderMode === 'raster' && Boolean(layer.raster?.url);
    const hasBim = layer.renderMode === 'bim' || Boolean(layer.bimModelId);
    const mounted = layerMapboxLayersPresent(map, layer);
    if (!mounted && fc === 0 && !hasRaster && !hasBim) continue;

    let mapboxLayerIds = collectCustomLayerMapboxIds(styleLayerIds, layer);
    if (!mapboxLayerIds.length && (fc > 0 || hasRaster || hasBim)) {
      mapboxLayerIds = [`${customLayerMapboxSourceId(layer)}-fill`];
    }
    if (!mapboxLayerIds.length) continue;

    entries.push({
      key: siMapSwipeKeyForCustomLayer(layer.id),
      label: layer.name?.trim() || layer.id,
      kind: 'custom',
      mapboxLayerIds,
    });
  }

  return entries;
}

export type SiMapSwipeMode = 'vertical' | 'horizontal' | 'spyglass' | 'split' | 'full';

export function resolveSiMapSwipeClipRect(
  bounds: { width: number; height: number },
  mode: SiMapSwipeMode,
  position: number,
  spyPosition: { x: number; y: number },
  spyRadiusPct: number,
  fullSide: 'a' | 'b',
): SiMapSwipeClipRect {
  if (mode === 'full') return computeSiMapFullCompareClipLayout(bounds, fullSide);
  if (mode === 'spyglass') return computeSiMapSpyglassClipLayout(bounds, spyPosition, spyRadiusPct);
  const orientation = mode === 'horizontal' ? 'horizontal' : 'vertical';
  return computeSiMapSwipeClipLayout(bounds, position, orientation);
}
