import type { Map as MapboxMap } from 'mapbox-gl';
import type { BasemapCatalogEntry, LeafletTileSpec } from '../basemapCatalog';
import { catalogEntryById, rasterStyleFromTiles, tileUrlForMapboxGl } from '../basemapCatalog';

/** Stable empty shell — MapGL `mapStyle` stays constant; basemap tiles swap in place. */
export const SI_MAP_BASEMAP_SHELL_STYLE: Record<string, unknown> = {
  version: 8,
  sources: {},
  layers: [],
};

export const SI_BASEMAP_SOURCE_PREFIX = 'si-basemap-src';
export const SI_BASEMAP_LAYER_PREFIX = 'si-basemap-layer';

/** Fast Esri/Carto rasters — Satellite, Streets, Dark, Topographic. */
export const SI_QUICK_BASEMAP_PRESETS = [
  { key: 'satellite', label: 'Satellite', catalogId: 'satellite' },
  { key: 'streets', label: 'Streets', catalogId: 'esri-streets' },
  { key: 'dark', label: 'Dark', catalogId: 'esri-dark-gray' },
  { key: 'topographic', label: 'Topographic', catalogId: 'esri-topo' },
] as const;

const styleObjectCache = new Map<string, Record<string, unknown>>();

export function entrySupportsInPlaceBasemapSwap(entry: BasemapCatalogEntry | null | undefined): boolean {
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
    styleObjectCache.set(entry.id, entry.mapboxStyle as Record<string, unknown>);
    return entry.mapboxStyle as Record<string, unknown>;
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
  return id.startsWith(SI_BASEMAP_LAYER_PREFIX);
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

function removeStaleBasemapStack(map: MapboxMap, keepCount: number): void {
  let i = keepCount;
  while (true) {
    const lid = layerId(i);
    const sid = sourceId(i);
    if (!map.getLayer(lid)) break;
    try {
      if (map.getLayer(lid)) map.removeLayer(lid);
      if (map.getSource(sid)) map.removeSource(sid);
    } catch {
      break;
    }
    i += 1;
  }
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
  const layers = basemapTileLayersForEntry(entry);
  if (!layers.length) return false;

  const fadeMs = opts?.fadeMs ?? 280;
  const beforeId = findFirstNonBasemapLayerId(map);

  layers.forEach((L, i) => {
    const sid = sourceId(i);
    const lid = layerId(i);
    const tiles = [tileUrlForMapboxGl(L.url)];
    const paint: Record<string, unknown> = {
      'raster-opacity': L.opacity ?? 1,
      'raster-fade-duration': fadeMs,
    };

    const existing = map.getSource(sid);
    if (existing && existing.type === 'raster') {
      const raster = existing as { setTiles?: (tiles: string[]) => void };
      if (typeof raster.setTiles === 'function') {
        raster.setTiles(tiles);
      } else {
        try {
          if (map.getLayer(lid)) map.removeLayer(lid);
          map.removeSource(sid);
        } catch {
          /* ignore */
        }
        map.addSource(sid, {
          type: 'raster',
          tiles,
          tileSize: 256,
          attribution: L.attribution,
        });
        map.addLayer(
          { id: lid, type: 'raster', source: sid, paint },
          beforeId,
        );
      }
      try {
        map.setPaintProperty(lid, 'raster-opacity', L.opacity ?? 1);
        map.setPaintProperty(lid, 'raster-fade-duration', fadeMs);
      } catch {
        /* layer may not exist yet */
      }
      return;
    }

    map.addSource(sid, {
      type: 'raster',
      tiles,
      tileSize: 256,
      attribution: L.attribution,
    });
    map.addLayer(
      { id: lid, type: 'raster', source: sid, paint },
      beforeId,
    );
  });

  removeStaleBasemapStack(map, layers.length);
  return true;
}

/** Lazy warm-up: fetch low-zoom tiles (ArcGIS / Google style prefetch). */
export function prefetchBasemapTiles(entry: BasemapCatalogEntry, zoom = 2): void {
  if (typeof window === 'undefined') return;
  for (const L of basemapTileLayersForEntry(entry)) {
    const url = tileUrlForMapboxGl(L.url)
      .replace(/\{z\}/g, String(zoom))
      .replace(/\{x\}/g, '1')
      .replace(/\{y\}/g, '1');
    if (!url.startsWith('http')) continue;
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    img.src = url;
  }
}

export function prefetchSiQuickBasemaps(
  catalog: BasemapCatalogEntry[],
  resolveId: (id: string) => string = id => id,
): void {
  for (const preset of SI_QUICK_BASEMAP_PRESETS) {
    const entry = catalogEntryById(catalog, resolveId(preset.catalogId));
    if (entry) prefetchBasemapTiles(entry);
  }
}
