import type { Map as MapboxMap } from 'mapbox-gl';
import { siMapboxSourcesAccessible } from './mapboxStyleReady';
import {
  SI_CESIUM_WORLD_TERRAIN_DEM_MAX_ZOOM,
  SI_CESIUM_WORLD_TERRAIN_DEM_TILES,
  isSiCesiumWorldTerrainDemTemplate,
  resolveCesiumWorldTerrainDemTileUrl,
} from './siMapCesiumWorldTerrain';
import { isSiMap3dTerrainCameraMoving } from './siMap3dTerrainCameraMoving';
import {
  SI_MAPBOX_TERRAIN_DEM_V1_MAX_ZOOM,
  SI_MAPBOX_TERRAIN_DEM_V1_TILE_SIZE,
  SI_MAPBOX_TERRAIN_DEM_V1_URL,
  isSiMapboxTerrainDemV1Template,
  resolveSiMapboxTerrainDemV1TileTemplates,
  resolveSiMapboxTerrainDemV1TileUrl,
  siMapboxTerrainDemV1IsAvailable,
} from './siMapMapboxTerrainDem';
import {
  ensureSiMapEsriWorldElevationDemProtocol,
  SI_ESRI_WORLD_ELEVATION_DEM_MAX_ZOOM,
  SI_ESRI_WORLD_ELEVATION_DEM_TILE_TEMPLATE,
  isSiEsriWorldElevationDemTemplate,
  resolveSiEsriWorldElevationDemTileUrl,
  siMapEsriWorldElevationDemTileCacheSize,
  warmSiMapEsriWorldElevationDemTiles,
} from './siMapEsriWorldElevationTerrain';
import { SI_TERRAIN_DEM_SOURCE_ID } from './siMapProjectionTerrain';

export type SiMapTerrainDemKind = 'mapbox' | 'terrarium' | 'esri';

export type EnsureSiMapTerrainDemSourceOpts = {
  /** Mapbox terrain-dem-v1 pairs with terrain-v2 contours; default follows token availability. */
  preferMapboxDem?: boolean;
  /** Esri WorldElevation3D Terrain3D — pairs with Esri elevation underlay in 3D. */
  preferEsriDem?: boolean;
};

/** Legacy Mapbox Terrain-DEM source id — removed; migrate off the style on load. */
const LEGACY_MAPBOX_TERRAIN_DEM_SOURCE_ID = 'si-mapbox-terrain-dem';

/**
 * Cesium World Terrain equivalent for Mapbox `setTerrain` (Terrarium global DEM).
 * Replaces Esri Terrain3D LERC protocol — direct PNG tiles, no custom protocol.
 */
export const SI_TERRARIUM_GLOBAL_DEM_TILES = SI_CESIUM_WORLD_TERRAIN_DEM_TILES;

export const SI_TERRARIUM_DEM_MAX_ZOOM = SI_CESIUM_WORLD_TERRAIN_DEM_MAX_ZOOM;

function resolveTerrariumDemTileUrl(z: number, x: number, y: number): string {
  return resolveCesiumWorldTerrainDemTileUrl(z, x, y);
}

function readMountedDemSignature(map: MapboxMap): string | null {
  try {
    const src = map.getSource(SI_TERRAIN_DEM_SOURCE_ID) as
      | { tiles?: string[]; url?: string }
      | undefined;
    const tile = src?.tiles?.[0];
    if (typeof tile === 'string') return tile;
    if (typeof src?.url === 'string') return src.url;
    return null;
  } catch {
    return null;
  }
}

/** @deprecated Use {@link readMountedDemSignature} */
function readMountedDemTileTemplate(map: MapboxMap): string | null {
  return readMountedDemSignature(map);
}

export function siMapTerrainDemUsesMapboxV1(map: MapboxMap): boolean {
  return isSiMapboxTerrainDemV1Template(readMountedDemSignature(map));
}

export function resolveSiMapTerrainDemKind(opts?: EnsureSiMapTerrainDemSourceOpts): SiMapTerrainDemKind {
  /** Esri LERC protocol is flaky in-browser — keep for explicit legacy only. */
  if (opts?.preferEsriDem) return 'esri';
  if (opts?.preferMapboxDem && siMapboxTerrainDemV1IsAvailable()) return 'mapbox';
  return 'terrarium';
}

/**
 * Free global DEM (Mapzen/Cesium Terrarium on S3) — reliable `setTerrain` mesh without tokens
 * or custom protocols. Use this for 3D Elevation dock mesh.
 */
export function ensureSiMapFreeTerrariumTerrainDemSource(map: MapboxMap): boolean {
  return ensureSiMapTerrainDemSource(map, { preferEsriDem: false, preferMapboxDem: false });
}

function siMapTerrainDemNeedsMigration(map: MapboxMap, targetKind: SiMapTerrainDemKind): boolean {
  const mounted = readMountedDemSignature(map);
  if (!mounted) return false;
  if (targetKind === 'esri') return !isSiEsriWorldElevationDemTemplate(mounted);
  if (targetKind === 'mapbox') return !isSiMapboxTerrainDemV1Template(mounted);
  return !isSiCesiumWorldTerrainDemTemplate(mounted);
}

function removeTerrainDemSource(map: MapboxMap): void {
  try {
    map.setTerrain(null);
    map.removeSource(SI_TERRAIN_DEM_SOURCE_ID);
  } catch {
    /* style reload */
  }
}

let activeDemPrefetchKind: SiMapTerrainDemKind = 'terrarium';

function demPrefetchMaxZoom(): number {
  if (activeDemPrefetchKind === 'mapbox') return SI_MAPBOX_TERRAIN_DEM_V1_MAX_ZOOM;
  if (activeDemPrefetchKind === 'esri') return SI_ESRI_WORLD_ELEVATION_DEM_MAX_ZOOM;
  return SI_TERRARIUM_DEM_MAX_ZOOM;
}

function resolveDemPrefetchTileUrl(z: number, x: number, y: number): string {
  if (activeDemPrefetchKind === 'mapbox') return resolveSiMapboxTerrainDemV1TileUrl(z, x, y);
  if (activeDemPrefetchKind === 'esri') return resolveSiEsriWorldElevationDemTileUrl(z, x, y);
  return resolveTerrariumDemTileUrl(z, x, y);
}

const demReadyResyncByMap = new WeakMap<MapboxMap, () => void>();
const mapPrefetchDetach = new WeakMap<MapboxMap, () => void>();

export function resetSiMapTerrainDemKindForTests(map?: MapboxMap): void {
  activeDemPrefetchKind = 'terrarium';
  if (map) {
    detachSiMapTerrainDemReadyResync(map);
    detachSiTerrainDemMapPrefetch(map);
  }
}

function removeLegacyMapboxTerrainDemSource(map: MapboxMap): void {
  try {
    if (!map.getSource(LEGACY_MAPBOX_TERRAIN_DEM_SOURCE_ID)) return;
    map.setTerrain(null);
    map.removeSource(LEGACY_MAPBOX_TERRAIN_DEM_SOURCE_ID);
  } catch {
    /* style reload */
  }
}

function addTerrariumDemSource(map: MapboxMap): void {
  activeDemPrefetchKind = 'terrarium';
  map.addSource(SI_TERRAIN_DEM_SOURCE_ID, {
    type: 'raster-dem',
    tiles: [...SI_TERRARIUM_GLOBAL_DEM_TILES],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: SI_TERRARIUM_DEM_MAX_ZOOM,
  });
}

function addEsriWorldElevationDemSource(map: MapboxMap): void {
  activeDemPrefetchKind = 'esri';
  ensureSiMapEsriWorldElevationDemProtocol();
  map.addSource(SI_TERRAIN_DEM_SOURCE_ID, {
    type: 'raster-dem',
    tiles: [SI_ESRI_WORLD_ELEVATION_DEM_TILE_TEMPLATE],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: SI_ESRI_WORLD_ELEVATION_DEM_MAX_ZOOM,
  });
}

function addMapboxTerrainDemV1Source(map: MapboxMap): void {
  activeDemPrefetchKind = 'mapbox';
  const tiles = resolveSiMapboxTerrainDemV1TileTemplates();
  if (tiles.length) {
    map.addSource(SI_TERRAIN_DEM_SOURCE_ID, {
      type: 'raster-dem',
      tiles,
      tileSize: SI_MAPBOX_TERRAIN_DEM_V1_TILE_SIZE,
      maxzoom: SI_MAPBOX_TERRAIN_DEM_V1_MAX_ZOOM,
    });
    return;
  }
  map.addSource(SI_TERRAIN_DEM_SOURCE_ID, {
    type: 'raster-dem',
    url: SI_MAPBOX_TERRAIN_DEM_V1_URL,
    tileSize: SI_MAPBOX_TERRAIN_DEM_V1_TILE_SIZE,
    maxzoom: SI_MAPBOX_TERRAIN_DEM_V1_MAX_ZOOM,
  });
}

/**
 * Ensure raster-dem for `map.setTerrain` — Mapbox terrain-dem-v1 when a token/proxy is
 * available (pairs with terrain-v2 contours), else Terrarium world DEM fallback.
 */
export function ensureSiMapTerrainDemSource(
  map: MapboxMap,
  opts?: EnsureSiMapTerrainDemSourceOpts,
): boolean {
  if (!siMapboxSourcesAccessible(map)) return false;
  try {
    removeLegacyMapboxTerrainDemSource(map);
    const kind = resolveSiMapTerrainDemKind(opts);
    if (map.getSource(SI_TERRAIN_DEM_SOURCE_ID)) {
      if (!siMapTerrainDemNeedsMigration(map, kind)) {
        activeDemPrefetchKind = kind;
        return true;
      }
      removeTerrainDemSource(map);
    }
    if (kind === 'esri') addEsriWorldElevationDemSource(map);
    else if (kind === 'mapbox') addMapboxTerrainDemV1Source(map);
    else addTerrariumDemSource(map);
    attachSiTerrainDemMapPrefetch(map);
    prefetchSiTerrainDemForViewport(map, true);
    return true;
  } catch {
    return false;
  }
}

/** True once the DEM source is mounted — mesh can boot before all tiles finish. */
export function siMapTerrainDemCanBootMesh(map: MapboxMap): boolean {
  try {
    return Boolean(map.getSource(SI_TERRAIN_DEM_SOURCE_ID));
  } catch {
    return false;
  }
}

/** True when viewport DEM tiles have finished loading. */
export function siMapTerrainDemTilesReady(map: MapboxMap): boolean {
  try {
    if (!map.getSource(SI_TERRAIN_DEM_SOURCE_ID)) return false;
    const mounted = readMountedDemSignature(map);
    if (isSiEsriWorldElevationDemTemplate(mounted) && siMapEsriWorldElevationDemTileCacheSize() > 0) {
      return true;
    }
    if (typeof map.isSourceLoaded === 'function' && map.isSourceLoaded(SI_TERRAIN_DEM_SOURCE_ID)) {
      return true;
    }
    if (typeof map.areTilesLoaded === 'function' && map.areTilesLoaded()) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export type SiTerrainMeshReadinessMode = 'progressive' | 'strict';

/**
 * Resolve terrain mesh exaggeration for the current DEM load state.
 * `strict` keeps the mesh flat until viewport tiles finish (2D→3D transition).
 * `progressive` ramps partially while tiles stream (live pan/tilt after 3D is active).
 */
export function siMapTerrainMeshExaggerationForReadiness(
  map: MapboxMap,
  target: number,
  mode: SiTerrainMeshReadinessMode = 'progressive',
): number {
  const exag = Number.isFinite(target) ? Math.max(0, target) : 0;
  if (exag <= 0) return 0;
  if (siMapTerrainDemTilesReady(map)) return exag;
  if (mode === 'strict') return 0;
  const partial = Math.max(0.82, exag * 0.94);
  return Math.min(exag, partial);
}

/** Re-run callback when DEM tiles become ready (sourcedata / idle). */
export function scheduleSiMapTerrainDemReadyResync(map: MapboxMap, onReady: () => void): void {
  detachSiMapTerrainDemReadyResync(map);

  const run = () => {
    if (!siMapTerrainDemCanBootMesh(map)) return;
    if (!siMapTerrainDemTilesReady(map)) return;
    detachSiMapTerrainDemReadyResync(map);
    onReady();
  };

  const onSourceData = (ev: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (ev?.sourceId && ev.sourceId !== SI_TERRAIN_DEM_SOURCE_ID) return;
    run();
  };
  const onIdle = () => run();

  try {
    map.on('sourcedata', onSourceData);
    map.on('idle', onIdle);
  } catch {
    return;
  }

  demReadyResyncByMap.set(map, () => {
    try {
      map.off('sourcedata', onSourceData);
      map.off('idle', onIdle);
    } catch {
      /* map destroyed */
    }
    demReadyResyncByMap.delete(map);
  });

  run();
}

export function detachSiMapTerrainDemReadyResync(map: MapboxMap): void {
  demReadyResyncByMap.get(map)?.();
}

export type SiTerrainDemPrefetchView = { lng: number; lat: number; zoom: number };

export type PrefetchSiTerrainDemOpts = {
  radius?: number;
  progressive?: boolean;
  lookaheadRing?: number;
  maxZoomOffset?: number;
};

const MIN_LNG_LAT_DELTA = 0.018;
const MIN_ZOOM_DELTA = 0.22;
const MAX_CONCURRENT = 16;
const MAX_TILE_CACHE = 4096;

type QueuedTile = { url: string; z: number; dist: number; gen: number };

let prefetchGeneration = 0;
let activeFetches = 0;
const pendingQueue: QueuedTile[] = [];
const loadedTileUrls = new Set<string>();
const loadingTileUrls = new Set<string>();

export function resetSiTerrainDemPrefetchForTests(): void {
  prefetchGeneration = 0;
  activeFetches = 0;
  pendingQueue.length = 0;
  loadedTileUrls.clear();
  loadingTileUrls.clear();
}

export function siTerrainDemTilePrefetchCacheSize(): number {
  return loadedTileUrls.size;
}

function lngLatToTileXY(
  lng: number,
  lat: number,
  z: number,
  maxZoom: number,
): { x: number; y: number } {
  const zoom = Math.max(0, Math.min(maxZoom, Math.round(z)));
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

function rememberLoadedTile(url: string): void {
  loadedTileUrls.add(url);
  if (loadedTileUrls.size <= MAX_TILE_CACHE) return;
  const drop = loadedTileUrls.size - MAX_TILE_CACHE;
  let i = 0;
  for (const key of loadedTileUrls) {
    loadedTileUrls.delete(key);
    if (++i >= drop) break;
  }
}

function loadTileImage(url: string, gen: number): Promise<void> {
  if (loadedTileUrls.has(url) || loadingTileUrls.has(url)) return Promise.resolve();
  if (gen !== prefetchGeneration) return Promise.resolve();

  loadingTileUrls.add(url);
  return new Promise(resolve => {
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    const finish = () => {
      loadingTileUrls.delete(url);
      if (gen === prefetchGeneration) rememberLoadedTile(url);
      resolve();
    };
    img.onload = finish;
    img.onerror = finish;
    img.src = url;
  });
}

function drainPrefetchQueue(): void {
  while (activeFetches < MAX_CONCURRENT && pendingQueue.length > 0) {
    const job = pendingQueue.shift();
    if (!job) break;
    if (job.gen !== prefetchGeneration) continue;
    if (loadedTileUrls.has(job.url)) continue;
    activeFetches += 1;
    void loadTileImage(job.url, job.gen).finally(() => {
      activeFetches -= 1;
      drainPrefetchQueue();
    });
  }
}

function enqueueTile(url: string, z: number, dist: number, gen: number): void {
  if (loadedTileUrls.has(url) || loadingTileUrls.has(url)) return;
  pendingQueue.push({ url, z, dist, gen });
}

/** Build progressive LOD tile coords — coarse root tiles first, then viewport detail. */
export function buildSiTerrainDemPrefetchCoords(
  view: SiTerrainDemPrefetchView,
  opts?: PrefetchSiTerrainDemOpts,
): Array<{ z: number; x: number; y: number; dist: number }> {
  const radius = Math.max(0, opts?.radius ?? 2);
  const lookaheadRing = Math.max(0, opts?.lookaheadRing ?? 1);
  const maxZoomOffset = Math.max(0, opts?.maxZoomOffset ?? 0);
  const maxZoom = demPrefetchMaxZoom();
  const targetZ = Math.max(2, Math.min(maxZoom, Math.round(view.zoom) - maxZoomOffset));
  const jobs: Array<{ z: number; x: number; y: number; dist: number }> = [];

  const pushRing = (z: number, ring: number, distBias: number) => {
    const n = 2 ** z;
    const { x: cx, y: cy } = lngLatToTileXY(view.lng, view.lat, z, maxZoom);
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const dist = distBias + Math.max(Math.abs(dx), Math.abs(dy));
        jobs.push({ z, x, y, dist });
      }
    }
  };

  if (opts?.progressive !== false) {
    const coarseZ = Math.max(2, targetZ - 3);
    const midZ = Math.max(2, targetZ - 1);
    pushRing(coarseZ, 1, 0);
    if (midZ !== coarseZ) pushRing(midZ, Math.max(1, radius - 1), 10);
  }
  pushRing(targetZ, radius, 20);
  if (lookaheadRing > 0 && targetZ > 2) {
    pushRing(Math.max(2, targetZ - 1), radius + lookaheadRing, 30);
  }

  return jobs;
}

/** Build progressive LOD tile jobs — coarse tiles first, then viewport detail. */
export function buildSiTerrainDemPrefetchJobs(
  view: SiTerrainDemPrefetchView,
  opts?: PrefetchSiTerrainDemOpts,
): Array<{ url: string; z: number; dist: number }> {
  return buildSiTerrainDemPrefetchCoords(view, opts).map(({ z, x, y, dist }) => ({
    url: resolveDemPrefetchTileUrl(z, x, y),
    z,
    dist,
  }));
}

export function shouldPrefetchSiTerrainDemView(
  prev: SiTerrainDemPrefetchView | null,
  next: SiTerrainDemPrefetchView,
): boolean {
  if (!prev) return true;
  const dLng = Math.abs(next.lng - prev.lng);
  const dLat = Math.abs(next.lat - prev.lat);
  const dZoom = Math.abs(next.zoom - prev.zoom);
  return dLng >= MIN_LNG_LAT_DELTA || dLat >= MIN_LNG_LAT_DELTA || dZoom >= MIN_ZOOM_DELTA;
}

/**
 * Append viewport DEM jobs without resetting the in-flight prefetch generation —
 * safe to call during pan/zoom (coarse LOD warms first, detail follows on moveend).
 */
export function appendSiTerrainDemPrefetchTiles(
  view: SiTerrainDemPrefetchView,
  opts?: PrefetchSiTerrainDemOpts,
): void {
  if (typeof window === 'undefined') return;
  if (activeDemPrefetchKind === 'esri') {
    ensureSiMapEsriWorldElevationDemProtocol();
    const merged = buildSiTerrainDemPrefetchCoords(view, opts).sort(
      (a, b) => a.z - b.z || a.dist - b.dist,
    );
    warmSiMapEsriWorldElevationDemTiles(merged);
    return;
  }
  const gen = prefetchGeneration;
  for (const coord of buildSiTerrainDemPrefetchCoords(view, opts)) {
    enqueueTile(resolveDemPrefetchTileUrl(coord.z, coord.x, coord.y), coord.z, coord.dist, gen);
  }
  pendingQueue.sort((a, b) => a.z - b.z || a.dist - b.dist);
  drainPrefetchQueue();
}

/** Warm DEM tiles in the browser cache before 3D entry (progressive LOD). */
export function prefetchSiTerrainDemTiles(
  view?: SiTerrainDemPrefetchView,
  opts?: PrefetchSiTerrainDemOpts,
): void {
  if (typeof window === 'undefined') return;

  const globalCoords = buildSiTerrainDemPrefetchCoords(
    { lng: 0, lat: 20, zoom: 2 },
    { radius: 1, progressive: true },
  );
  const viewportCoords =
    view && Number.isFinite(view.lng) && Number.isFinite(view.lat)
      ? buildSiTerrainDemPrefetchCoords(view, opts)
      : [];

  if (activeDemPrefetchKind === 'esri') {
    ensureSiMapEsriWorldElevationDemProtocol();
    const merged = [...globalCoords, ...viewportCoords].sort((a, b) => a.z - b.z || a.dist - b.dist);
    warmSiMapEsriWorldElevationDemTiles(merged);
    return;
  }

  prefetchGeneration += 1;
  const gen = prefetchGeneration;
  pendingQueue.length = 0;

  for (const coord of globalCoords) {
    enqueueTile(resolveDemPrefetchTileUrl(coord.z, coord.x, coord.y), coord.z, coord.dist, gen);
  }
  for (const coord of viewportCoords) {
    enqueueTile(resolveDemPrefetchTileUrl(coord.z, coord.x, coord.y), coord.z, coord.dist, gen);
  }

  pendingQueue.sort((a, b) => a.z - b.z || a.dist - b.dist);
  drainPrefetchQueue();
}

/** Viewport-aware warm — reads map center/zoom and prefetches DEM tiles. */
export function prefetchSiTerrainDemForViewport(map: MapboxMap, aggressive = false): void {
  try {
    const center = map.getCenter?.();
    const zoom = map.getZoom?.();
    if (!center || !Number.isFinite(center.lng) || !Number.isFinite(center.lat)) return;
    prefetchSiTerrainDemTiles(
      {
        lng: center.lng,
        lat: center.lat,
        zoom: typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : 2,
      },
      {
        radius: aggressive ? 3 : 2,
        progressive: true,
        lookaheadRing: aggressive ? 2 : 1,
        maxZoomOffset: aggressive ? 0 : 1,
      },
    );
  } catch {
    /* style not ready */
  }
}

/** Debounced moveend + idle lookahead prefetch — keeps DEM tiles warm while panning. */
export function attachSiTerrainDemMapPrefetch(map: MapboxMap): () => void {
  const existing = mapPrefetchDetach.get(map);
  if (existing) existing();

  let lastView: SiTerrainDemPrefetchView | null = null;
  let moveTimer = 0;
  let idleTimer = 0;

  const readView = (): SiTerrainDemPrefetchView | null => {
    try {
      const center = map.getCenter?.();
      const zoom = map.getZoom?.();
      if (!center || !Number.isFinite(center.lng) || !Number.isFinite(center.lat)) return null;
      return {
        lng: center.lng,
        lat: center.lat,
        zoom: typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : 2,
      };
    } catch {
      return null;
    }
  };

  const run = (aggressive: boolean) => {
    if (isSiMap3dTerrainCameraMoving()) return;
    const view = readView();
    if (!view) return;
    if (!shouldPrefetchSiTerrainDemView(lastView, view)) return;
    lastView = view;
    prefetchSiTerrainDemTiles(view, {
      radius: aggressive ? 3 : 2,
      progressive: true,
      lookaheadRing: aggressive ? 2 : 1,
      maxZoomOffset: aggressive ? 0 : 1,
    });
  };

  let moveThrottleTimer = 0;
  let lastMovePrefetchMs = 0;

  const onMove = () => {
    if (isSiMap3dTerrainCameraMoving()) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastMovePrefetchMs < 64) return;
    lastMovePrefetchMs = now;
    window.clearTimeout(moveThrottleTimer);
    moveThrottleTimer = window.setTimeout(() => {
      const view = readView();
      if (!view) return;
      appendSiTerrainDemPrefetchTiles(view, {
        radius: 1,
        progressive: true,
        lookaheadRing: 1,
        maxZoomOffset: 2,
      });
    }, 0);
  };

  const onMoveEnd = () => {
    window.clearTimeout(moveTimer);
    moveTimer = window.setTimeout(() => run(true), 36);
  };

  const onIdle = () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => run(false), 120);
  };

  map.on('move', onMove);
  map.on('moveend', onMoveEnd);
  map.on('idle', onIdle);
  run(true);

  const detach = () => {
    window.clearTimeout(moveTimer);
    window.clearTimeout(idleTimer);
    window.clearTimeout(moveThrottleTimer);
    try {
      map.off('move', onMove);
      map.off('moveend', onMoveEnd);
      map.off('idle', onIdle);
    } catch {
      /* map destroyed */
    }
    mapPrefetchDetach.delete(map);
  };

  mapPrefetchDetach.set(map, detach);
  return detach;
}

export function detachSiTerrainDemMapPrefetch(map: MapboxMap): void {
  mapPrefetchDetach.get(map)?.();
}

/** Viewport warm + moveend prefetch — idempotent per map. */
export function ensureSiMapTerrainDemLifecycle(map: MapboxMap): void {
  ensureSiMapFreeTerrariumTerrainDemSource(map);
  if (siMapTerrainDemCanBootMesh(map)) {
    attachSiTerrainDemMapPrefetch(map);
    prefetchSiTerrainDemForViewport(map, true);
  }
}

/** @deprecated Use SI_CESIUM_WORLD_TERRAIN_DEM_TILE_TEMPLATE */
export const SI_TERRARIUM_GLOBAL_DEM_TILES_FALLBACK = SI_CESIUM_WORLD_TERRAIN_DEM_TILES;
