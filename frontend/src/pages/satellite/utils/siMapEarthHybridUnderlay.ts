import type { Map as MapboxMap } from 'mapbox-gl';
import type { BasemapCatalogEntry, LeafletTileSpec } from '../basemapCatalog';
import {
  basemapSupportsEarthHybridUnderlay,
  ESRI_WORLD_TERRAIN_MAX_ZOOM,
  is3dMeshBasemapEntry,
  isImageryForwardBasemapEntry,
  rasterMaxZoomForTileUrl,
  tileUrlForMapboxGl,
} from '../basemapCatalog';
import { esriWorldElevationTerrainUnderlayLayers } from '../esriWorldElevationTerrainBasemap';
import { findFirstSiBasemapLayerId } from './siMapBasemapRuntime';
import { siMapGlobeFreeCameraTerrainActive } from './siMapGlobeFreeCamera';
import { pinSiMapTerrainInfrastructureBelowBasemap } from './siMapPinnedTerrainInfrastructure';
import { siMapboxSourcesAccessible } from './mapboxStyleReady';
import {
  ensureSiMapFreeTerrariumTerrainDemSource,
  prefetchSiTerrainDemForViewport,
  scheduleSiMapTerrainDemReadyResync,
} from './siMapTerrainDemRuntime';

const SI_TERRAIN_DEM_SOURCE_ID = 'si-global-terrain-dem';

/** Inputs for deciding when the Esri elevation underlay is live (2D↔3D transitions included). */
export type SiMapEarthHybridUnderlayViewState = {
  pitchDeg: number;
  elevationDock3d: boolean;
  globeExtrusion3d: boolean;
  /** True while the camera is easing into 3D before pitch settles. */
  elevationTransitioningTo3d: boolean;
};

/** Esri World_Terrain_Base — pinned below the active basemap raster stack. */
export const SI_EARTH_TERRAIN_UNDERLAY_SOURCE_ID = 'si-earth-terrain-underlay-src';
export const SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID = 'si-earth-terrain-underlay-layer';

/** Esri World_Hillshade — relief shading under basemap (no reference labels). */
export const SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_SOURCE_ID = 'si-esri-elevation-hillshade-underlay-src';
export const SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID = 'si-esri-elevation-hillshade-underlay-layer';

const UNDERLAY_LAYER_SPECS = [
  {
    sourceId: SI_EARTH_TERRAIN_UNDERLAY_SOURCE_ID,
    layerId: SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID,
    index: 0,
  },
  {
    sourceId: SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_SOURCE_ID,
    layerId: SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID,
    index: 1,
  },
] as const;

export type SyncSiMapEarthHybridUnderlayOpts = {
  enabled: boolean;
  basemapEntry?: BasemapCatalogEntry | null;
  opacity?: number;
  /** Keep Esri DEM mesh when 3D Elevation dock is on — avoid tearing terrain on underlay sync. */
  elevationDock3d?: boolean;
};

/** True when the map is in (or entering) a 3D view — not only after pitch crosses threshold. */
export function resolveSiMapEarthHybridUnderlay3dActive(
  view: SiMapEarthHybridUnderlayViewState,
): boolean {
  if (view.elevationDock3d) return true;
  if (view.elevationTransitioningTo3d) return true;
  if (view.globeExtrusion3d) return true;
  return siMapGlobeFreeCameraTerrainActive(view.pitchDeg);
}

export function resolveSiMapEarthHybridUnderlayOpacity(
  basemapEntry: BasemapCatalogEntry | null | undefined,
  view: SiMapEarthHybridUnderlayViewState,
): number {
  if (!resolveSiMapEarthHybridUnderlay3dActive(view)) return 0;
  if (view.elevationDock3d || view.elevationTransitioningTo3d) return 1;
  return isImageryForwardBasemapEntry(basemapEntry) ? 0.9 : 1;
}

/** True when Esri World Elevation Terrain should sit under the active basemap (3D Earth). */
export function shouldMountEarthHybridUnderlayStack(
  basemapEntry?: BasemapCatalogEntry | null,
  opts?: { elevation3d?: boolean },
): boolean {
  if (!opts?.elevation3d) return false;
  if (!basemapSupportsEarthHybridUnderlay(basemapEntry)) return false;
  if (is3dMeshBasemapEntry(basemapEntry)) return false;
  return true;
}

export function isSiMapEarthHybridUnderlayLayerId(layerId: string): boolean {
  return (
    layerId === SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID ||
    layerId === SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID
  );
}

/** True when Esri World Elevation underlay raster stack is mounted on the map. */
export function siMapEarthHybridUnderlayIsActive(map: MapboxMap): boolean {
  try {
    return Boolean(map.getLayer(SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID));
  } catch {
    return false;
  }
}

function lngLatToTileXY(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return {
    x: Math.max(0, Math.min(n - 1, x)),
    y: Math.max(0, Math.min(n - 1, y)),
  };
}

/** Warm Esri terrain-base + hillshade rasters from root LOD through viewport detail. */
export function warmSiMapEarthHybridUnderlayRasterTiles(
  map: MapboxMap,
  opts?: { aggressive?: boolean },
): void {
  if (typeof window === 'undefined') return;
  let lng = 0;
  let lat = 20;
  let zoom = 8;
  try {
    const center = map.getCenter?.();
    const mapZoom = map.getZoom?.();
    if (center && Number.isFinite(center.lng) && Number.isFinite(center.lat)) {
      lng = center.lng;
      lat = center.lat;
    }
    if (typeof mapZoom === 'number' && Number.isFinite(mapZoom)) zoom = mapZoom;
  } catch {
    /* ignore */
  }

  const radius = opts?.aggressive ? 3 : 2;
  const targetZ = Math.max(
    2,
    Math.min(ESRI_WORLD_TERRAIN_MAX_ZOOM, Math.round(zoom) + (opts?.aggressive ? 1 : 0)),
  );
  const layers = esriWorldElevationTerrainUnderlayLayers();
  const urls: string[] = [];

  const pushRing = (z: number, ring: number) => {
    const { x: cx, y: cy } = lngLatToTileXY(lng, lat, z);
    const n = 2 ** z;
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        for (const layer of layers) {
          urls.push(
            tileUrlForMapboxGl(layer.url)
              .replace('{z}', String(z))
              .replace('{x}', String(x))
              .replace('{y}', String(y)),
          );
        }
      }
    }
  };

  pushRing(2, 1);
  const midZ = Math.max(2, targetZ - 1);
  if (midZ > 2) pushRing(midZ, Math.max(1, radius - 1));
  pushRing(targetZ, radius);

  for (const url of urls) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }
}

function bootSiMapEsriElevationDemForUnderlay(map: MapboxMap): void {
  if (!ensureSiMapFreeTerrariumTerrainDemSource(map)) return;
  prefetchSiTerrainDemForViewport(map, true);
  warmSiMapEarthHybridUnderlayRasterTiles(map, { aggressive: true });

  const remountTerrainMesh = () => {
    try {
      const mesh = map.getTerrain?.();
      if (!mesh) return;
      const exag =
        typeof mesh.exaggeration === 'number' && Number.isFinite(mesh.exaggeration)
          ? mesh.exaggeration
          : 1;
      map.setTerrain({ source: SI_TERRAIN_DEM_SOURCE_ID, exaggeration: exag });
      map.triggerRepaint?.();
    } catch {
      /* style reload */
    }
  };

  remountTerrainMesh();
  scheduleSiMapTerrainDemReadyResync(map, remountTerrainMesh);
}

function removeEarthHybridUnderlay(map: MapboxMap): void {
  for (const spec of [...UNDERLAY_LAYER_SPECS].reverse()) {
    try {
      if (map.getLayer(spec.layerId)) map.removeLayer(spec.layerId);
    } catch {
      /* style reloading */
    }
    try {
      if (map.getSource(spec.sourceId)) map.removeSource(spec.sourceId);
    } catch {
      /* ignore */
    }
  }
}

function resolveLayerOpacity(
  opts: SyncSiMapEarthHybridUnderlayOpts,
  tileOpacity?: number,
): number {
  const base = typeof opts.opacity === 'number' && Number.isFinite(opts.opacity) ? opts.opacity : 1;
  if (base <= 0) return 0;
  const mul = tileOpacity ?? 1;
  return Math.min(1, Math.max(0, base * mul));
}

function upsertUnderlayRasterLayer(
  map: MapboxMap,
  spec: (typeof UNDERLAY_LAYER_SPECS)[number],
  tile: LeafletTileSpec,
  beforeId: string | undefined,
  opacity: number,
): void {
  const tiles = [tileUrlForMapboxGl(tile.url)];
  const maxzoom = rasterMaxZoomForTileUrl(tile.url);

  if (!map.getSource(spec.sourceId)) {
    map.addSource(spec.sourceId, {
      type: 'raster',
      tiles,
      tileSize: 256,
      attribution: tile.attribution,
      ...(maxzoom != null ? { maxzoom } : {}),
    });
  }

  const paint = {
    'raster-opacity': opacity,
    'raster-fade-duration': 0,
  };
  const visibility = opacity > 0.02 ? 'visible' : 'none';

  if (!map.getLayer(spec.layerId)) {
    map.addLayer(
      {
        id: spec.layerId,
        type: 'raster',
        source: spec.sourceId,
        paint,
        layout: { visibility },
      },
      beforeId,
    );
  } else {
    map.setPaintProperty(spec.layerId, 'raster-opacity', opacity);
    map.setLayoutProperty(spec.layerId, 'visibility', visibility);
  }
}

/**
 * Mount Esri World Elevation Terrain (terrain base + hillshade) directly under the basemap.
 * Mirrors ArcGIS `Basemap.baseLayers` while keeping imagery / streets as the visible surface.
 */
export function syncSiMapEarthHybridUnderlay(
  map: MapboxMap,
  opts: SyncSiMapEarthHybridUnderlayOpts,
): void {
  if (!siMapboxSourcesAccessible(map)) return;

  const shouldMount =
    opts.enabled && shouldMountEarthHybridUnderlayStack(opts.basemapEntry, { elevation3d: true });

  if (!shouldMount) {
    removeEarthHybridUnderlay(map);
    if (!opts.elevationDock3d) {
      ensureSiMapFreeTerrariumTerrainDemSource(map);
    }
    return;
  }

  const tiles = esriWorldElevationTerrainUnderlayLayers();
  const beforeId = findFirstSiBasemapLayerId(map);

  for (const spec of UNDERLAY_LAYER_SPECS) {
    const tile = tiles[spec.index];
    if (!tile) continue;
    upsertUnderlayRasterLayer(
      map,
      spec,
      tile,
      beforeId,
      resolveLayerOpacity(opts, tile.opacity),
    );
  }

  pinSiMapTerrainInfrastructureBelowBasemap(map);
  bootSiMapEsriElevationDemForUnderlay(map);
  try {
    map.triggerRepaint?.();
  } catch {
    /* ignore */
  }
}

export function syncSiMapEarthHybridUnderlayForBasemap(
  map: MapboxMap,
  basemapEntry: BasemapCatalogEntry | null | undefined,
  enabled: boolean,
  opacity?: number,
): void {
  syncSiMapEarthHybridUnderlay(map, { enabled, basemapEntry, opacity });
}

/** Mount or strip the underlay from live 3D view state — safe during projection switches. */
export function syncSiMapEarthHybridUnderlayFor3dView(
  map: MapboxMap,
  basemapEntry: BasemapCatalogEntry | null | undefined,
  view: SiMapEarthHybridUnderlayViewState,
): boolean {
  const elevation3d = resolveSiMapEarthHybridUnderlay3dActive(view);
  const enabled = shouldMountEarthHybridUnderlayStack(basemapEntry, { elevation3d });
  syncSiMapEarthHybridUnderlay(map, {
    enabled,
    basemapEntry,
    opacity: enabled ? resolveSiMapEarthHybridUnderlayOpacity(basemapEntry, view) : 0,
    elevationDock3d: view.elevationDock3d,
  });
  return enabled;
}

export function detachSiMapEarthHybridUnderlay(map: MapboxMap): void {
  removeEarthHybridUnderlay(map);
}
