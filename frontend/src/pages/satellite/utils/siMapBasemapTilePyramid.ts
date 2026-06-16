import type { Map as MapboxMap } from 'mapbox-gl';
import type { BasemapCatalogEntry } from '../basemapCatalog';
import { rasterMaxZoomForTileUrl, tileUrlForMapboxGl } from '../basemapCatalog';
import { isSiMap3dTerrainCameraMoving } from './siMap3dTerrainCameraMoving';
import { basemapTileLayersForEntry } from './siMapBasemapRuntime';
import { siMap3dTerrainOnCameraIdle } from './siMap3dTerrainCameraPerformance';
import {
  buildSiMapTileCacheKey,
  normalizeSiMapTileRequestUrl,
  replaceSlippyTileCoordsInUrl,
  warmSiMapTileToPyramidCache,
} from './siMapTilePyramidCache';

export type SiBasemapPrefetchView = {
  lng: number;
  lat: number;
  zoom: number;
  bearing?: number;
};

export type SiBasemapPrefetchOpts = {
  radius?: number;
  progressive?: boolean;
  lookaheadRing?: number;
  maxZoomOffset?: number;
  /** Motion vector in tile-space (lng/lat per frame) for direction-aware wedge. */
  velocityLng?: number;
  velocityLat?: number;
};

const MIN_LNG_LAT_DELTA = 0.0008;
const MIN_ZOOM_DELTA = 0.08;
const warmedKeys = new Set<string>();
const MAX_WARMED_KEYS = 8192;

function lngLatToTileXY(lng: number, lat: number, zoom: number, maxZoom?: number): { x: number; y: number } {
  const cap = maxZoom != null ? Math.min(zoom, maxZoom) : zoom;
  const z = Math.max(0, Math.min(22, Math.round(cap)));
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return {
    x: Math.max(0, Math.min(n - 1, x)),
    y: Math.max(0, Math.min(n - 1, y)),
  };
}

function rememberWarmedKey(key: string): void {
  if (warmedKeys.has(key)) return;
  warmedKeys.add(key);
  if (warmedKeys.size > MAX_WARMED_KEYS) {
    const drop = warmedKeys.size - MAX_WARMED_KEYS;
    let i = 0;
    for (const k of warmedKeys) {
      warmedKeys.delete(k);
      if (++i >= drop) break;
    }
  }
}

function warmTile(template: string, z: number, x: number, y: number): void {
  const n = 2 ** z;
  const tx = ((x % n) + n) % n;
  const ty = Math.max(0, Math.min(n - 1, y));
  const url = replaceSlippyTileCoordsInUrl(
    template.replace(/\{z\}/g, String(z)).replace(/\{x\}/g, String(tx)).replace(/\{y\}/g, String(ty)),
    z,
    tx,
    ty,
  );
  const key = buildSiMapTileCacheKey(url);
  if (warmedKeys.has(key)) return;
  rememberWarmedKey(key);
  warmSiMapTileToPyramidCache(url);
  if (typeof window !== 'undefined') {
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    img.src = normalizeSiMapTileRequestUrl(url);
  }
}

/** Progressive pyramid — coarse tiles first, then viewport detail (Google Earth LOD). */
export function buildSiBasemapPrefetchCoords(
  view: SiBasemapPrefetchView,
  template: string,
  opts?: SiBasemapPrefetchOpts,
): Array<{ z: number; x: number; y: number; dist: number }> {
  const radius = Math.max(0, opts?.radius ?? 2);
  const lookaheadRing = Math.max(0, opts?.lookaheadRing ?? 1);
  const maxZoomOffset = Math.max(0, opts?.maxZoomOffset ?? 0);
  const maxZoom = rasterMaxZoomForTileUrl(template) ?? 19;
  const targetZ = Math.max(2, Math.min(maxZoom, Math.round(view.zoom) - maxZoomOffset));
  const jobs: Array<{ z: number; x: number; y: number; dist: number }> = [];

  const velLng = opts?.velocityLng ?? 0;
  const velLat = opts?.velocityLat ?? 0;
  const motionBiasX = Math.abs(velLng) > 1e-6 ? Math.sign(velLng) : 0;
  const motionBiasY = Math.abs(velLat) > 1e-6 ? Math.sign(velLat) : 0;

  const pushRing = (z: number, ring: number, distBias: number, extraAhead = 0) => {
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
    if (extraAhead > 0 && (motionBiasX !== 0 || motionBiasY !== 0)) {
      for (let step = 1; step <= extraAhead; step++) {
        const ax = cx + motionBiasX * (ring + step);
        const ay = cy + motionBiasY * (ring + step);
        if (ax >= 0 && ay >= 0 && ax < n && ay < n) {
          jobs.push({ z, x: ax, y: ay, dist: distBias + ring + step - 0.5 });
        }
      }
    }
  };

  if (opts?.progressive !== false) {
    const coarseZ = Math.max(2, targetZ - 3);
    const midZ = Math.max(2, targetZ - 1);
    pushRing(coarseZ, 1, 0);
    if (midZ !== coarseZ) pushRing(midZ, Math.max(1, radius - 1), 10);
  }
  pushRing(targetZ, radius, 20, lookaheadRing);
  if (lookaheadRing > 0 && targetZ > 2) {
    pushRing(Math.max(2, targetZ - 1), radius + lookaheadRing, 30, lookaheadRing);
  }

  return jobs;
}

export function prefetchBasemapTilePyramid(
  entry: BasemapCatalogEntry,
  view?: SiBasemapPrefetchView,
  opts?: SiBasemapPrefetchOpts,
): void {
  if (typeof window === 'undefined') return;
  const layers = basemapTileLayersForEntry(entry);
  if (!layers.length) return;

  const globalView: SiBasemapPrefetchView = { lng: 0, lat: 20, zoom: 2 };
  for (const L of layers) {
    const template = tileUrlForMapboxGl(L.url);
    const globalJobs = buildSiBasemapPrefetchCoords(globalView, template, {
      radius: 1,
      progressive: true,
      maxZoomOffset: 2,
    }).sort((a, b) => a.z - b.z || a.dist - b.dist);
    for (const job of globalJobs) warmTile(template, job.z, job.x, job.y);

    if (view && Number.isFinite(view.lng) && Number.isFinite(view.lat)) {
      const viewportJobs = buildSiBasemapPrefetchCoords(view, template, {
        ...opts,
        progressive: true,
      }).sort((a, b) => a.z - b.z || a.dist - b.dist);
      for (const job of viewportJobs) warmTile(template, job.z, job.x, job.y);
    }
  }
}

export function shouldPrefetchBasemapView(
  prev: SiBasemapPrefetchView | null,
  next: SiBasemapPrefetchView,
): boolean {
  if (!prev) return true;
  return (
    Math.abs(next.lng - prev.lng) >= MIN_LNG_LAT_DELTA ||
    Math.abs(next.lat - prev.lat) >= MIN_LNG_LAT_DELTA ||
    Math.abs(next.zoom - prev.zoom) >= MIN_ZOOM_DELTA
  );
}

const prefetchDetachByMap = new WeakMap<MapboxMap, () => void>();

/** Direction-aware pyramid warm — append during pan, full refresh on moveend. */
export function attachSiBasemapTilePyramidPrefetch(
  map: MapboxMap,
  resolveEntry: () => BasemapCatalogEntry | null | undefined,
): () => void {
  const existing = prefetchDetachByMap.get(map);
  if (existing) existing();

  let lastView: (SiBasemapPrefetchView & { velocityLng: number; velocityLat: number }) | null = null;
  let lastMovePrefetchMs = 0;
  let moveThrottleTimer = 0;
  let idleTimer = 0;
  let cameraIdleOff: (() => void) | null = null;

  const readView = (): SiBasemapPrefetchView | null => {
    try {
      const center = map.getCenter?.();
      const zoom = map.getZoom?.();
      const bearing = map.getBearing?.();
      if (!center || !Number.isFinite(center.lng) || !Number.isFinite(center.lat)) return null;
      return {
        lng: center.lng,
        lat: center.lat,
        zoom: typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : 2,
        bearing: typeof bearing === 'number' && Number.isFinite(bearing) ? bearing : 0,
      };
    } catch {
      return null;
    }
  };

  const runPrefetch = (aggressive: boolean, allowDuringMotion = false) => {
    if (!allowDuringMotion && isSiMap3dTerrainCameraMoving()) return;
    const entry = resolveEntry();
    if (!entry) return;
    const view = readView();
    if (!view) return;

    let velocityLng = 0;
    let velocityLat = 0;
    if (lastView) {
      velocityLng = view.lng - lastView.lng;
      velocityLat = view.lat - lastView.lat;
    }
    const nextView = { ...view, velocityLng, velocityLat };
    if (!aggressive && !shouldPrefetchBasemapView(lastView, nextView)) return;
    lastView = nextView;

    prefetchBasemapTilePyramid(entry, view, {
      radius: aggressive ? 3 : 2,
      progressive: true,
      lookaheadRing: aggressive ? 2 : 1,
      maxZoomOffset: aggressive ? 0 : 1,
      velocityLng,
      velocityLat,
    });
  };

  const onMove = () => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastMovePrefetchMs < 64) return;
    lastMovePrefetchMs = now;
    window.clearTimeout(moveThrottleTimer);
    moveThrottleTimer = window.setTimeout(() => runPrefetch(false, true), 48);
  };

  const onMoveEnd = () => {
    window.clearTimeout(moveThrottleTimer);
    window.setTimeout(() => runPrefetch(true), 36);
  };

  const onIdle = () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => runPrefetch(true), 120);
  };

  map.on('move', onMove);
  map.on('moveend', onMoveEnd);
  map.on('zoomend', onMoveEnd);
  map.on('idle', onIdle);

  cameraIdleOff = siMap3dTerrainOnCameraIdle(() => runPrefetch(true));

  runPrefetch(true);

  const detach = () => {
    window.clearTimeout(moveThrottleTimer);
    window.clearTimeout(idleTimer);
    cameraIdleOff?.();
    cameraIdleOff = null;
    try {
      map.off('move', onMove);
      map.off('moveend', onMoveEnd);
      map.off('zoomend', onMoveEnd);
      map.off('idle', onIdle);
    } catch {
      /* map destroyed */
    }
    prefetchDetachByMap.delete(map);
  };

  prefetchDetachByMap.set(map, detach);
  return detach;
}

export function detachSiBasemapTilePyramidPrefetch(map: MapboxMap): void {
  prefetchDetachByMap.get(map)?.();
}

export function resetSiBasemapTilePyramidForTests(): void {
  warmedKeys.clear();
}
