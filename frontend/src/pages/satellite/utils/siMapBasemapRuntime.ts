import type { Map as MapboxMap } from 'mapbox-gl';
import type { BasemapCatalogEntry, LeafletTileSpec } from '../basemapCatalog';
import {
  isGooglePhotorealistic3dBasemapEntry,
  isImageryForwardBasemapEntry,
  rasterMaxZoomForTileUrl,
  rasterStyleFromTiles,
  tileUrlForMapboxGl,
} from '../basemapCatalog';
import { devMapboxProxyRewrite } from '../../../lib/mapboxProxyUrl';
import { isMapboxStyleReady } from './mapboxStyleReady';
import { siMapboxStyleWithGlyphs } from './siMap3DLabels';
import { syncSiMapOverlayLayerStack } from './siMapCustomVectorLayerStack';
import {
  raiseSiMapTerrainContourLayersAboveWms,
  siMapTerrainContourLayersMounted,
} from './siMapWmsRasterLayerStack';

/** Stable empty shell — MapGL `mapStyle` stays constant; basemap tiles swap in place. */
export const SI_MAP_BASEMAP_SHELL_STYLE: Record<string, unknown> = siMapboxStyleWithGlyphs({
  version: 8,
  sources: {},
  layers: [],
});

export const SI_BASEMAP_SOURCE_PREFIX = 'si-basemap-src';
export const SI_BASEMAP_LAYER_PREFIX = 'si-basemap-layer';

/** Tracks mounted raster stacks per catalog entry id (active basemap only — lazy loaded). */
const mountedBasemapLayerCounts = new Map<string, number>();
let lastVisibleBasemapEntryId: string | null = null;

export function isSiMapBasemapEntryMounted(entryId: string): boolean {
  return mountedBasemapLayerCounts.has(entryId) && lastVisibleBasemapEntryId === entryId;
}

function basemapEntrySlug(entryId: string): string {
  return entryId.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 56) || 'basemap';
}

function cachedSourceId(entryId: string, index: number): string {
  return `si-basemap-${basemapEntrySlug(entryId)}-src-${index}`;
}

function cachedLayerId(entryId: string, index: number): string {
  return `si-basemap-${basemapEntrySlug(entryId)}-layer-${index}`;
}

function legacySourceId(index: number): string {
  return `${SI_BASEMAP_SOURCE_PREFIX}-${index}`;
}

function legacyLayerId(index: number): string {
  return `${SI_BASEMAP_LAYER_PREFIX}-${index}`;
}

/** Quick chips — Esri World Imagery default, then hybrid / streets / dark / topo. */
export const SI_QUICK_BASEMAP_PRESETS = [
  { key: 'esri', label: 'Esri World Imagery', catalogId: 'esri', icon: 'fa-solid fa-globe' },
  { key: 'esri-imagery-hybrid', label: 'Imagery Hybrid', catalogId: 'esri-imagery-hybrid', icon: 'fa-solid fa-layer-group' },
  { key: 'streets', label: 'Streets', catalogId: 'esri-streets', icon: 'fa-regular fa-map' },
  { key: 'dark', label: 'Dark', catalogId: 'esri-dark-gray', icon: 'fa-regular fa-moon' },
  { key: 'topographic', label: 'Topographic', catalogId: 'esri-topo', icon: 'fa-solid fa-mountain-sun' },
] as const;

const styleObjectCache = new Map<string, Record<string, unknown>>();

export function entrySupportsInPlaceBasemapSwap(entry: BasemapCatalogEntry | null | undefined): boolean {
  if (isGooglePhotorealistic3dBasemapEntry(entry)) return true;
  if (!entry) return false;
  const layers = entry.leafletLayers?.filter(L => L.url?.trim()) ?? [];
  return layers.length > 0;
}

export function basemapTileLayersForEntry(entry: BasemapCatalogEntry): LeafletTileSpec[] {
  return entry.leafletLayers?.filter(L => L.url?.trim()) ?? [];
}

/** Memoized raster style JSON (ArcGIS-style cache — avoids realloc on each render). */
export function getCachedRasterStyleForEntry(entry: BasemapCatalogEntry): Record<string, unknown> | null {
  if (typeof entry.mapboxStyle === 'object' && entry.mapboxStyle !== null) {
    const cached = styleObjectCache.get(entry.id);
    if (cached) return cached;
    const withGlyphs = siMapboxStyleWithGlyphs(entry.mapboxStyle as Record<string, unknown>);
    styleObjectCache.set(entry.id, withGlyphs);
    return withGlyphs;
  }
  const layers = basemapTileLayersForEntry(entry);
  if (!layers.length) return null;
  const style = rasterStyleFromTiles(layers);
  styleObjectCache.set(entry.id, style);
  return style;
}

function sourceId(index: number): string {
  return `${SI_BASEMAP_SOURCE_PREFIX}-${index}`;
}

function layerId(index: number): string {
  return `${SI_BASEMAP_LAYER_PREFIX}-${index}`;
}

function isSiBasemapLayerId(id: string): boolean {
  return id.startsWith('si-basemap-') && id.includes('-layer-');
}

function isSiBasemapSourceId(id: string): boolean {
  return id.startsWith('si-basemap-') && id.includes('-src-');
}

/** True when in-place Esri/Mapbox raster basemap tiles are on the map. */
export function mapHasSiRasterBasemapStack(map: MapboxMap): boolean {
  try {
    const layers = map.getStyle()?.layers ?? [];
    return layers.some(L => {
      const id = (L as { id?: string }).id;
      return Boolean(id && isSiBasemapLayerId(id));
    });
  } catch {
    return false;
  }
}

/** Insert terrain relief below satellite tiles (keeps basemap vivid). */
export function findFirstSiBasemapLayerId(map: MapboxMap): string | undefined {
  try {
    const layers = map.getStyle()?.layers ?? [];
    for (const L of layers) {
      const id = (L as { id?: string }).id;
      if (id && isSiBasemapLayerId(id)) return id;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Topmost in-place basemap raster layer in the Mapbox stack. */
export function findTopSiBasemapLayerId(map: MapboxMap): string | undefined {
  try {
    const layers = map.getStyle()?.layers ?? [];
    let topId: string | undefined;
    for (const L of layers) {
      const id = (L as { id?: string }).id;
      if (id && isSiBasemapLayerId(id)) topId = id;
    }
    return topId;
  } catch {
    return undefined;
  }
}

/** First style layer directly above the basemap raster stack (contour insert anchor). */
export function findFirstLayerAboveSiBasemapStack(map: MapboxMap): string | undefined {
  try {
    const layers = map.getStyle()?.layers ?? [];
    let lastBasemapIdx = -1;
    for (let i = 0; i < layers.length; i++) {
      const id = (layers[i] as { id?: string }).id;
      if (id && isSiBasemapLayerId(id)) lastBasemapIdx = i;
    }
    if (lastBasemapIdx < 0) return undefined;
    return (layers[lastBasemapIdx + 1] as { id?: string } | undefined)?.id;
  } catch {
    return undefined;
  }
}

/** First non-basemap layer — insert new basemap raster below operational layers. */
export function findFirstNonBasemapLayerId(map: MapboxMap): string | undefined {
  try {
    const style = map.getStyle();
    const layers = style?.layers;
    if (!Array.isArray(layers)) return undefined;
    for (const L of layers) {
      const id = (L as { id?: string }).id;
      if (id && !isSiBasemapLayerId(id)) return id;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function topmostSiBasemapLayerIndex(map: MapboxMap): number {
  try {
    const layers = map.getStyle()?.layers ?? [];
    let top = -1;
    for (let i = 0; i < layers.length; i++) {
      const id = (layers[i] as { id?: string }).id;
      if (id && isSiBasemapLayerId(id)) top = i;
    }
    return top;
  } catch {
    return -1;
  }
}

/**
 * Mapbox `addLayer` / `moveLayer` `beforeId`: insert immediately above the basemap raster stack.
 * Skips optional layer ids (e.g. contour lines being re-stacked). Returns `undefined` to append on top.
 */
export function findMapboxInsertBeforeIdAboveBasemapStack(
  map: MapboxMap,
  opts?: { skipLayerIds?: string[] },
): string | undefined {
  try {
    const layers = map.getStyle()?.layers ?? [];
    const skip = new Set(opts?.skipLayerIds ?? []);
    const basemapTop = topmostSiBasemapLayerIndex(map);
    const start = basemapTop >= 0 ? basemapTop + 1 : 0;
    for (let i = start; i < layers.length; i++) {
      const id = (layers[i] as { id?: string }).id;
      if (!id || skip.has(id)) continue;
      return id;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Mapbox GL style JSON with entry-scoped `si-basemap-*` ids — matches {@link applySiMapBasemap} (no reload on first paint). */
export function buildSiBasemapMapStyleForEntry(entry: BasemapCatalogEntry): Record<string, unknown> {
  const cacheKey = `startup:${entry.id}`;
  const cached = styleObjectCache.get(cacheKey);
  if (cached) return cached;

  const layers = basemapTileLayersForEntry(entry);
  if (!layers.length) return SI_MAP_BASEMAP_SHELL_STYLE;

  const sources: Record<string, unknown> = {};
  const mapLayers: unknown[] = [];
  layers.forEach((L, i) => {
    const sid = cachedSourceId(entry.id, i);
    const lid = cachedLayerId(entry.id, i);
    const maxzoom = rasterMaxZoomForTileUrl(L.url);
    sources[sid] = {
      type: 'raster',
      tiles: [tileUrlForMapboxGl(L.url)],
      tileSize: 256,
      attribution: L.attribution,
      ...(maxzoom != null ? { maxzoom } : {}),
    };
    mapLayers.push({
      id: lid,
      type: 'raster',
      source: sid,
      paint: {
        'raster-opacity': L.opacity ?? 1,
        'raster-fade-duration': 0,
      },
    });
  });
  const style = siMapboxStyleWithGlyphs({ version: 8 as const, sources, layers: mapLayers });
  styleObjectCache.set(cacheKey, style);
  return style;
}

/** True when react-map-gl `mapStyle` already mounted this entry's raster stack. */
export function mapHasInitialBasemapStyleForEntry(map: MapboxMap, entry: BasemapCatalogEntry): boolean {
  if (!isMapboxStyleReady(map)) return false;
  const layers = basemapTileLayersForEntry(entry);
  if (!layers.length) return false;
  return layers.every((_, i) => Boolean(map.getLayer(cachedLayerId(entry.id, i))));
}

/** Register basemap from initial style JSON — avoids tear-down/re-add on map load. */
export function registerSiMapBasemapMounted(entry: BasemapCatalogEntry): void {
  const layers = basemapTileLayersForEntry(entry);
  if (!layers.length) return;
  mountedBasemapLayerCounts.set(entry.id, layers.length);
  lastVisibleBasemapEntryId = entry.id;
}

/** Mount or register basemap after style is ready — skips redundant tile stack rebuild. */
export function syncSiMapBasemapOnStyleReady(map: MapboxMap, entry: BasemapCatalogEntry): void {
  if (!entrySupportsInPlaceBasemapSwap(entry)) return;
  if (mapHasInitialBasemapStyleForEntry(map, entry)) {
    registerSiMapBasemapMounted(entry);
    try {
      syncSiMapOverlayLayerStack(map);
    } catch {
      /* ignore */
    }
    map.triggerRepaint?.();
    return;
  }
  applySiMapBasemap(map, entry, { fadeMs: 0 });
}

function removeLegacyIndexBasemapStack(map: MapboxMap): void {
  if (!isMapboxStyleReady(map)) return;
  let i = 0;
  while (map.getLayer(legacyLayerId(i)) || map.getSource(legacySourceId(i))) {
    safeRemoveSiBasemapLayerAndSourceLegacy(map, i);
    i += 1;
  }
}

function safeRemoveSiBasemapLayerAndSourceLegacy(map: MapboxMap, index: number): void {
  if (!isMapboxStyleReady(map)) return;
  const lid = legacyLayerId(index);
  const sid = legacySourceId(index);
  try {
    if (map.getLayer(lid)) map.removeLayer(lid);
  } catch {
    /* style reloading */
  }
  try {
    if (map.getSource(sid)) map.removeSource(sid);
  } catch {
    /* raster cache may be undefined during setStyle */
  }
}

function safeRemoveSiBasemapLayerAndSource(map: MapboxMap, index: number): void {
  safeRemoveSiBasemapLayerAndSourceLegacy(map, index);
}

/** Remove a cached basemap stack from the map (sources + layers) to free memory and stop tile requests. */
export function removeBasemapEntryFromMap(map: MapboxMap, entryId: string): void {
  if (!isMapboxStyleReady(map)) return;
  const count = mountedBasemapLayerCounts.get(entryId) ?? 0;
  for (let i = 0; i < count; i++) {
    const lid = cachedLayerId(entryId, i);
    const sid = cachedSourceId(entryId, i);
    try {
      if (map.getLayer(lid)) map.removeLayer(lid);
    } catch {
      /* style reloading */
    }
    try {
      if (map.getSource(sid)) map.removeSource(sid);
    } catch {
      /* raster cache may be undefined during setStyle */
    }
  }
  mountedBasemapLayerCounts.delete(entryId);
}

/** Unload every in-place basemap except the active entry (on-demand loading). */
export function unloadInactiveBasemapEntries(map: MapboxMap, activeEntryId: string): void {
  if (!isMapboxStyleReady(map)) return;
  for (const entryId of [...mountedBasemapLayerCounts.keys()]) {
    if (entryId === activeEntryId || entryId === '__legacy__') continue;
    removeBasemapEntryFromMap(map, entryId);
  }
}

function upsertCachedBasemapRasterLayer(
  map: MapboxMap,
  entryId: string,
  index: number,
  L: LeafletTileSpec,
  beforeId: string | undefined,
  fadeMs: number,
  visible = true,
): void {
  if (!isMapboxStyleReady(map)) return;
  const sid = cachedSourceId(entryId, index);
  const lid = cachedLayerId(entryId, index);
  const tiles = [tileUrlForMapboxGl(L.url)];
  const paint: Record<string, unknown> = {
    'raster-opacity': L.opacity ?? 1,
    'raster-fade-duration': fadeMs,
  };
  const visibility = visible ? 'visible' : 'none';

  if (!map.getSource(sid)) {
    const maxzoom = rasterMaxZoomForTileUrl(L.url);
    map.addSource(sid, {
      type: 'raster',
      tiles,
      tileSize: 256,
      attribution: L.attribution,
      ...(maxzoom != null ? { maxzoom } : {}),
    });
  }
  if (!map.getLayer(lid)) {
    map.addLayer({ id: lid, type: 'raster', source: sid, paint, layout: { visibility } }, beforeId);
  } else {
    map.setLayoutProperty(lid, 'visibility', visibility);
    map.setPaintProperty(lid, 'raster-opacity', L.opacity ?? 1);
    map.setPaintProperty(lid, 'raster-fade-duration', fadeMs);
    try {
      const anchor = findFirstNonBasemapLayerId(map);
      if (anchor && map.getLayer(anchor)) map.moveLayer(lid, anchor);
    } catch {
      /* style reloading */
    }
  }
}

function upsertSiBasemapRasterLayer(
  map: MapboxMap,
  index: number,
  L: LeafletTileSpec,
  beforeId: string | undefined,
  fadeMs: number,
): void {
  upsertCachedBasemapRasterLayer(map, '__legacy__', index, L, beforeId, fadeMs);
}

export type ApplySiMapBasemapOptions = {
  prevEntry?: BasemapCatalogEntry;
  /** Crossfade when tile templates change (Mapbox raster-fade-duration). */
  fadeMs?: number;
};

/**
 * Swap basemap raster tiles without `setStyle` — preserves camera, zoom, terrain, and layers.
 * Safe to call repeatedly; only touches `si-basemap-*` sources/layers.
 */
export function applySiMapBasemap(
  map: MapboxMap,
  entry: BasemapCatalogEntry,
  opts?: ApplySiMapBasemapOptions,
): boolean {
  if (!isMapboxStyleReady(map)) return false;

  if (isSiMapBasemapEntryMounted(entry.id) && mapHasInitialBasemapStyleForEntry(map, entry)) {
    try {
      syncSiMapOverlayLayerStack(map);
      if (siMapTerrainContourLayersMounted(map)) {
        raiseSiMapTerrainContourLayersAboveWms(map, { force: true });
      }
    } catch {
      /* ignore */
    }
    map.triggerRepaint?.();
    return true;
  }

  const layers = basemapTileLayersForEntry(entry);
  if (!layers.length) {
    unloadInactiveBasemapEntries(map, '__none__');
    lastVisibleBasemapEntryId = isGooglePhotorealistic3dBasemapEntry(entry) ? entry.id : null;
    removeLegacyIndexBasemapStack(map);
    return true;
  }

  const fadeMs = opts?.fadeMs ?? 0;
  const beforeId = findFirstNonBasemapLayerId(map);
  removeLegacyIndexBasemapStack(map);
  unloadInactiveBasemapEntries(map, entry.id);

  try {
    layers.forEach((L, i) => {
      upsertCachedBasemapRasterLayer(map, entry.id, i, L, beforeId, fadeMs, true);
    });
    mountedBasemapLayerCounts.set(entry.id, layers.length);
    lastVisibleBasemapEntryId = entry.id;
    try {
      syncSiMapOverlayLayerStack(map);
      if (siMapTerrainContourLayersMounted(map)) {
        raiseSiMapTerrainContourLayersAboveWms(map, { force: true });
      }
    } catch {
      /* ignore */
    }
    map.triggerRepaint?.();
    return true;
  } catch {
    return false;
  }
}

/** Re-mount basemap rasters + fix layer stack after operational layers churn (timeline / WMS). */
export function ensureSiMapBasemapVisible(map: MapboxMap, entry: BasemapCatalogEntry | null | undefined): void {
  if (!entry || !isMapboxStyleReady(map)) return;
  try {
    syncSiMapBasemapOnStyleReady(map, entry);
    syncSiMapOverlayLayerStack(map);
    map.triggerRepaint?.();
  } catch {
    /* style mid-reload */
  }
}

/** Clear in-memory basemap layer registry (e.g. after full style reload). */
export function resetSiMapBasemapCache(): void {
  mountedBasemapLayerCounts.clear();
  lastVisibleBasemapEntryId = null;
}

/** Warm browser cache for the startup/active basemap only (no extra providers). */
export function prefetchStartupBasemap(
  entry: BasemapCatalogEntry,
  view?: { lng: number; lat: number; zoom: number },
): void {
  prefetchActiveBasemapTiles(entry, view);
}

/** Optional low-zoom tile warm-up for the **selected** basemap only. */
export function prefetchActiveBasemapTiles(
  entry: BasemapCatalogEntry,
  view?: { lng: number; lat: number; zoom: number },
): void {
  prefetchBasemapTiles(entry, 2);
  if (view && Number.isFinite(view.lng) && Number.isFinite(view.lat)) {
    prefetchBasemapTilesNearView(entry, view);
  }
}

/** Lazy warm-up: fetch low-zoom tiles for a single entry (no map mount). */
export function prefetchBasemapTiles(entry: BasemapCatalogEntry, zoom = 2): void {
  if (typeof window === 'undefined') return;
  for (const L of basemapTileLayersForEntry(entry)) {
    prefetchTileUrl(tileUrlForMapboxGl(L.url), zoom, 1, 1);
    prefetchTileUrl(tileUrlForMapboxGl(L.url), zoom, 2, 1);
  }
}

function lngLatToTileXY(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const z = Math.max(0, Math.min(22, Math.round(zoom)));
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return {
    x: Math.max(0, Math.min(n - 1, x)),
    y: Math.max(0, Math.min(n - 1, y)),
  };
}

function prefetchTileUrl(template: string, zoom: number, x: number, y: number): void {
  const url = template
    .replace(/\{z\}/g, String(zoom))
    .replace(/\{x\}/g, String(x))
    .replace(/\{y\}/g, String(y))
    .replace(/\{s\}/g, 'a')
    .replace(/\{r\}/g, '');
  if (!url.startsWith('http')) return;
  const img = new Image();
  img.decoding = 'async';
  img.loading = 'eager';
  img.src = devMapboxProxyRewrite(url);
}

/** Preload visible + neighboring tiles at the current viewport (Mapbox satellite fast path). */
export function prefetchBasemapTilesNearView(
  entry: BasemapCatalogEntry,
  view: { lng: number; lat: number; zoom: number },
  radius = 1,
): void {
  if (typeof window === 'undefined') return;
  if (!Number.isFinite(view.lng) || !Number.isFinite(view.lat)) return;
  const z = Math.max(2, Math.min(16, Math.round(view.zoom)));
  const { x, y } = lngLatToTileXY(view.lng, view.lat, z);
  for (const L of basemapTileLayersForEntry(entry)) {
    const template = tileUrlForMapboxGl(L.url);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        prefetchTileUrl(template, z, x + dx, y + dy);
      }
    }
    if (z > 2) {
      const zLow = Math.max(2, z - 2);
      const low = lngLatToTileXY(view.lng, view.lat, zLow);
      prefetchTileUrl(template, zLow, low.x, low.y);
    }
  }
}
