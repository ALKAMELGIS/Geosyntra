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

function isSiMapEarthHybridUnderlayLayerId(layerId: string): boolean {
  return (
    layerId === 'si-earth-terrain-underlay-layer' ||
    layerId === 'si-esri-elevation-hillshade-underlay-layer'
  );
}

export type SiMapSwipeLayerKind = 'basemap' | 'wms' | 'custom';

export type SiMapSwipeLayerEntry = {
  /** Stable logical key — never a Mapbox layer id. */
  key: string;
  label: string;
  kind: SiMapSwipeLayerKind;
  mapboxLayerIds: string[];
};

export const SI_MAP_SWIPE_BASEMAP_KEY = 'basemap';
export const SI_MAP_SWIPE_LAYER_LIVE_KEY = 'layer-live';

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

/** Swipe compares operational layers only — basemap is always-on background. */
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

/** Resolve catalog keys to Mapbox style layer ids (no layers are added). */
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
    }
  }
  return [...out];
}

function listSiMapLayerLiveLayerIds(map: MapboxMap): string[] {
  try {
    return (map.getStyle()?.layers ?? [])
      .map(l => l.id)
      .filter(isSiMapWmsRasterLayerId);
  } catch {
    return [];
  }
}

function listSiMapBasemapLayerIds(map: MapboxMap): string[] {
  try {
    return (map.getStyle()?.layers ?? [])
      .map(l => l.id)
      .filter(id => isSiMapBasemapMapboxLayerId(id));
  } catch {
    return [];
  }
}

/** Build swipe catalog from layers already mounted on the map — never imports or adds layers. */
function collectCustomLayerMapboxIds(
  styleLayerIds: string[],
  layer: SiCustomLayerRegistryFields,
): string[] {
  const prefix = `${customLayerMapboxSourceId(layer)}-`;
  const ids = styleLayerIds.filter(id => id.startsWith(prefix));
  const rasterId = `${layer.id}-raster`;
  if (!ids.includes(rasterId) && styleLayerIds.includes(rasterId)) {
    ids.push(rasterId);
  }
  const extentId = `${layer.id}-extent-line`;
  if (!ids.includes(extentId) && styleLayerIds.includes(extentId)) {
    ids.push(extentId);
  }
  return ids;
}

export function buildSiMapSwipeLayerCatalog(
  map: MapboxMap | null,
  customLayers: SiCustomLayerRegistryFields[],
  opts?: { basemapLabel?: string; layerLiveLabel?: string; elevation3d?: boolean },
): SiMapSwipeLayerEntry[] {
  if (!map?.getStyle?.()) return [];

  const entries: SiMapSwipeLayerEntry[] = [];
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

/** Clip layout for comparison map overlay (screen-space swipe divider). */
export function computeSiMapSwipeClipLayout(
  bounds: { width: number; height: number },
  positionPct: number,
  orientation: 'vertical' | 'horizontal',
): {
  clipLeft: number;
  clipTop: number;
  clipWidth: number;
  clipHeight: number;
  innerLeft: number;
  innerTop: number;
  innerWidth: number;
  innerHeight: number;
} {
  const width = Math.max(0, bounds.width);
  const height = Math.max(0, bounds.height);
  const ratio = Math.max(0, Math.min(100, positionPct)) / 100;

  if (orientation === 'vertical') {
    const left = Math.max(0, Math.min(width, ratio * width));
    const visibleWidth = Math.max(0, width - left);
    return {
      clipLeft: left,
      clipTop: 0,
      clipWidth: visibleWidth,
      clipHeight: height,
      innerLeft: -left,
      innerTop: 0,
      innerWidth: width,
      innerHeight: height,
    };
  }

  const top = Math.max(0, Math.min(height, ratio * height));
  const visibleHeight = Math.max(0, height - top);
  return {
    clipLeft: 0,
    clipTop: top,
    clipWidth: width,
    clipHeight: visibleHeight,
    innerLeft: 0,
    innerTop: -top,
    innerWidth: width,
    innerHeight: height,
  };
}
