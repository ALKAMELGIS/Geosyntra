/**
 * Esri WorldElevation3D Terrain3D — Mapbox raster-dem via custom protocol (LERC → Terrarium PNG).
 * @see https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer
 */
import { decode as decodeLerc } from 'lerc';
import mapboxgl from 'mapbox-gl';
import { isSiMap3dTerrainCameraMoving } from './siMap3dTerrainCameraMoving';
import {
  elevationsToTerrariumRgba,
  encodeRgbaPngFast,
  terrariumRgbFromMeters,
} from './siMapTerrariumPngEncode';

export const ESRI_WORLD_ELEVATION_TERRAIN3D_IMAGE_SERVER =
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';

/** Mapbox raster-dem tile template — handled by {@link SI_ESRI_WORLD_ELEVATION_DEM_PROTOCOL}. */
export const SI_ESRI_WORLD_ELEVATION_DEM_TILE_TEMPLATE =
  'si-esri-world-elevation://tile/{z}/{x}/{y}';

/** Esri Terrain3D ImageServer max LOD (tileInfo.lods.length - 1). */
export const SI_ESRI_WORLD_ELEVATION_DEM_MAX_ZOOM = 16;

export function resolveSiEsriWorldElevationDemTileUrl(z: number, x: number, y: number): string {
  return SI_ESRI_WORLD_ELEVATION_DEM_TILE_TEMPLATE.replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

/** True when the mounted DEM source uses the Esri WorldElevation3D protocol. */
export function isSiEsriWorldElevationDemTemplate(tileTemplate: string | null | undefined): boolean {
  return tileTemplate === SI_ESRI_WORLD_ELEVATION_DEM_TILE_TEMPLATE;
}

const MAPBOX_DEM_TILE_PX = 256;

const PROTOCOL_ID = 'si-esri-world-elevation';
const TILE_PATH_RE = /^tile\/(\d+)\/(\d+)\/(\d+)$/;

let protocolRegistered = false;

type DemTileCacheEntry = {
  data: ArrayBuffer;
  elevations: Float32Array;
  cacheControl?: string | null;
  expires?: string | null;
};

const demTileCache = new Map<string, DemTileCacheEntry>();
const demTileInflight = new Map<string, Promise<DemTileCacheEntry | null>>();
const MAX_DEM_TILE_CACHE = 2048;
const MAX_INFLIGHT_TILES = 24;

type DemTileLoadResult = DemTileCacheEntry | null;
type DemProtocolCallback = (
  err: Error | null,
  data?: ArrayBuffer,
  cacheControl?: string | null,
  expires?: string | null,
) => void;

const demTileWaiters: Array<() => void> = [];
let activeDemFetches = 0;

function notifyDemTileWaiters(): void {
  while (activeDemFetches < MAX_INFLIGHT_TILES && demTileWaiters.length > 0) {
    const next = demTileWaiters.shift();
    next?.();
  }
}

function waitForDemTileSlot(): Promise<void> {
  if (activeDemFetches < MAX_INFLIGHT_TILES) return Promise.resolve();
  return new Promise(resolve => {
    demTileWaiters.push(resolve);
  });
}

function releaseDemTileSlot(): void {
  activeDemFetches = Math.max(0, activeDemFetches - 1);
  notifyDemTileWaiters();
}

const demReadyListeners = new Set<() => void>();

function demTileCacheKey(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}

function rememberDemTile(key: string, entry: DemTileCacheEntry): void {
  const hadTiles = demTileCache.size > 0;
  demTileCache.set(key, entry);
  if (!hadTiles && demTileCache.size > 0) {
    for (const fn of demReadyListeners) {
      try {
        fn();
      } catch {
        /* listener */
      }
    }
  }
  if (demTileCache.size <= MAX_DEM_TILE_CACHE) return;
  const drop = demTileCache.size - MAX_DEM_TILE_CACHE;
  let i = 0;
  for (const k of demTileCache.keys()) {
    demTileCache.delete(k);
    if (++i >= drop) break;
  }
}

export function resetSiMapEsriWorldElevationTerrainCacheForTests(): void {
  demTileCache.clear();
  demTileInflight.clear();
  demTileWaiters.length = 0;
  activeDemFetches = 0;
  protocolRegistered = false;
  demReadyListeners.clear();
}

export function siMapEsriWorldElevationDemTileCacheSize(): number {
  return demTileCache.size;
}

/** Fires once when the first Esri DEM tile lands in the protocol cache. */
export function onSiMapEsriWorldElevationDemReady(fn: () => void): () => void {
  if (demTileCache.size > 0) {
    fn();
    return () => {};
  }
  demReadyListeners.add(fn);
  return () => demReadyListeners.delete(fn);
}

function esriTerrain3dTileUrl(z: number, y: number, x: number): string {
  return `${ESRI_WORLD_ELEVATION_TERRAIN3D_IMAGE_SERVER}/tile/${z}/${y}/${x}`;
}

/** Terrarium RGB encoding for Mapbox `raster-dem` (meters orthometric). */
/** Esri LERC tiles are often 257×257; Mapbox `raster-dem` expects 256×256 Terrarium PNG. */
export function cropLercElevationToMapbox256(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
): { values: Float32Array; width: number; height: number } {
  const target = MAPBOX_DEM_TILE_PX;
  if (width === target && height === target) {
    return { values: Float32Array.from(pixels as ArrayLike<number>), width: target, height: target };
  }
  const out = new Float32Array(target * target);
  const srcW = Math.max(1, width);
  for (let y = 0; y < target; y++) {
    for (let x = 0; x < target; x++) {
      out[y * target + x] = pixels[y * srcW + x] as number;
    }
  }
  return { values: out, width: target, height: target };
}

export function encodeTerrariumRgb(heightM: number): [number, number, number] {
  return terrariumRgbFromMeters(heightM);
}

function decodeLercElevations(lercBytes: ArrayBuffer): { values: Float32Array; noData: number } | null {
  try {
    const decoded = decodeLerc(lercBytes) as {
      pixels: ArrayLike<number>[];
      width: number;
      height: number;
      noDataValue?: number;
    };
    const pixels = decoded.pixels?.[0];
    if (!pixels?.length) return null;
    const cropped = cropLercElevationToMapbox256(
      pixels,
      decoded.width || MAPBOX_DEM_TILE_PX,
      decoded.height || MAPBOX_DEM_TILE_PX,
    );
    return { values: cropped.values, noData: decoded.noDataValue ?? -9999 };
  } catch {
    return null;
  }
}

async function rgbaToPngFallback(width: number, height: number, rgba: Uint8Array): Promise<ArrayBuffer | null> {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return blob.arrayBuffer();
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    const bin = atob(dataUrl.split(',')[1] ?? '');
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  } catch {
    return null;
  }
}

async function elevationsToTerrariumPng(elevations: Float32Array, noData: number): Promise<ArrayBuffer | null> {
  const rgba = elevationsToTerrariumRgba(elevations, noData);
  try {
    return await encodeRgbaPngFast(MAPBOX_DEM_TILE_PX, MAPBOX_DEM_TILE_PX, rgba);
  } catch {
    return rgbaToPngFallback(MAPBOX_DEM_TILE_PX, MAPBOX_DEM_TILE_PX, rgba);
  }
}

/** ArcGIS-style ancestor reuse — crop + upscale parent elevation grid for child tile. */
export function synthesizeChildElevationsFromParent(
  parent: Float32Array,
  parentZ: number,
  parentX: number,
  parentY: number,
  childZ: number,
  childX: number,
  childY: number,
): Float32Array | null {
  const dz = childZ - parentZ;
  if (dz <= 0) return null;
  const scale = 2 ** dz;
  const localX = childX - parentX * scale;
  const localY = childY - parentY * scale;
  if (localX < 0 || localY < 0 || localX >= scale || localY >= scale) return null;

  const out = new Float32Array(MAPBOX_DEM_TILE_PX * MAPBOX_DEM_TILE_PX);
  const size = MAPBOX_DEM_TILE_PX;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.min(size - 1, Math.floor(((localX * size + x) * size) / scale));
      const sy = Math.min(size - 1, Math.floor(((localY * size + y) * size) / scale));
      out[y * size + x] = parent[sy * size + sx]!;
    }
  }
  return out;
}

async function buildDemTileEntry(
  elevations: Float32Array,
  noData: number,
  headers: { cacheControl: string | null; expires: string | null },
): Promise<DemTileCacheEntry | null> {
  const png = await elevationsToTerrariumPng(elevations, noData);
  if (!png) return null;
  return {
    data: png,
    elevations,
    cacheControl: headers.cacheControl,
    expires: headers.expires,
  };
}

export async function fetchEsriTerrariumDemTile(z: number, x: number, y: number): Promise<DemTileLoadResult> {
  const key = demTileCacheKey(z, x, y);
  const cached = demTileCache.get(key);
  if (cached) return cached;

  const inflight = demTileInflight.get(key);
  if (inflight) return inflight;

  const job = (async (): Promise<DemTileLoadResult> => {
    await waitForDemTileSlot();
    const again = demTileCache.get(key);
    if (again) return again;
    activeDemFetches += 1;
    try {
      const res = await fetch(esriTerrain3dTileUrl(z, y, x));
      if (!res.ok) return null;
      const lercBuf = await res.arrayBuffer();
      const decoded = decodeLercElevations(lercBuf);
      if (!decoded) return null;
      const entry = await buildDemTileEntry(decoded.values, decoded.noData, {
        cacheControl: res.headers.get('Cache-Control'),
        expires: res.headers.get('Expires'),
      });
      if (!entry) return null;
      rememberDemTile(key, entry);
      return entry;
    } catch {
      return null;
    } finally {
      demTileInflight.delete(key);
      releaseDemTileSlot();
    }
  })();

  demTileInflight.set(key, job);
  return job;
}

async function resolveAncestorDemTile(
  z: number,
  x: number,
  y: number,
  maxLevels = 4,
): Promise<DemTileCacheEntry | null> {
  for (let dz = 1; dz <= maxLevels; dz++) {
    const parentZ = Math.max(0, z - dz);
    const scale = 2 ** dz;
    const parentX = Math.floor(x / scale);
    const parentY = Math.floor(y / scale);
    const parentKey = demTileCacheKey(parentZ, parentX, parentY);
    let parent = demTileCache.get(parentKey);
    if (!parent) {
      parent = (await fetchEsriTerrariumDemTile(parentZ, parentX, parentY)) ?? undefined;
    }
    if (!parent?.elevations?.length) continue;

    const childElev = synthesizeChildElevationsFromParent(
      parent.elevations,
      parentZ,
      parentX,
      parentY,
      z,
      x,
      y,
    );
    if (!childElev) continue;

    const entry = await buildDemTileEntry(childElev, -9999, {
      cacheControl: parent.cacheControl ?? null,
      expires: parent.expires ?? null,
    });
    if (entry) {
      rememberDemTile(demTileCacheKey(z, x, y), entry);
      return entry;
    }
  }
  return null;
}

function parseEsriDemProtocolCoords(url: string): { z: number; x: number; y: number } | null {
  const match = TILE_PATH_RE.exec(url.replace(`${PROTOCOL_ID}://`, ''));
  if (!match) return null;
  const z = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { z, x, y };
}

async function loadEsriDemProtocolTile(z: number, x: number, y: number): Promise<DemTileLoadResult> {
  const key = demTileCacheKey(z, x, y);
  const cached = demTileCache.get(key);
  if (cached) return cached;

  const moving = isSiMap3dTerrainCameraMoving();
  if (moving) {
    for (let dz = 1; dz <= 4; dz++) {
      const parentZ = Math.max(0, z - dz);
      const scale = 2 ** dz;
      const parentX = Math.floor(x / scale);
      const parentY = Math.floor(y / scale);
      const parent = demTileCache.get(demTileCacheKey(parentZ, parentX, parentY));
      if (!parent?.elevations?.length) continue;
      const childElev = synthesizeChildElevationsFromParent(
        parent.elevations,
        parentZ,
        parentX,
        parentY,
        z,
        x,
        y,
      );
      if (!childElev) return parent;
      const entry = await buildDemTileEntry(childElev, -9999, {
        cacheControl: parent.cacheControl ?? null,
        expires: parent.expires ?? null,
      });
      if (entry) {
        rememberDemTile(key, entry);
        return entry;
      }
      return parent;
    }
  }

  const fetched = await fetchEsriTerrariumDemTile(z, x, y);
  if (fetched) return fetched;
  return resolveAncestorDemTile(z, x, y);
}

/** Register once — Mapbox calls this for `si-esri-world-elevation://tile/z/x/y` DEM tiles. */
export function ensureSiMapEsriWorldElevationDemProtocol(): void {
  if (protocolRegistered) return;
  if (typeof mapboxgl?.addProtocol !== 'function') {
    console.warn('[siMapEsriWorldElevationTerrain] mapboxgl.addProtocol unavailable');
    return;
  }
  protocolRegistered = true;

  try {
    mapboxgl.addProtocol(PROTOCOL_ID, (params, callback?: DemProtocolCallback) => {
    const coords = parseEsriDemProtocolCoords(params.url);
    if (!coords) {
      const err = new Error(`Invalid Esri DEM tile url: ${params.url}`);
      if (typeof callback === 'function') {
        callback(err);
        return { cancel: () => {} };
      }
      return Promise.reject(err);
    }

    const { z, x, y } = coords;
    let cancelled = false;

    const job = loadEsriDemProtocolTile(z, x, y);

    if (typeof callback === 'function') {
      void job
        .then(entry => {
          if (cancelled) return;
          if (!entry) {
            callback(new Error('Esri DEM tile unavailable'));
            return;
          }
          callback(null, entry.data, entry.cacheControl ?? undefined, entry.expires ?? undefined);
        })
        .catch(err => {
          if (!cancelled) callback(err instanceof Error ? err : new Error(String(err)));
        });
      return {
        cancel: () => {
          cancelled = true;
        },
      };
    }

    return job.then(entry => {
      if (cancelled) throw new Error('Esri DEM tile request cancelled');
      if (!entry) throw new Error('Esri DEM tile unavailable');
      return {
        data: entry.data,
        cacheControl: entry.cacheControl ?? undefined,
        expires: entry.expires ?? undefined,
      };
    });
  });
  } catch (err) {
    protocolRegistered = false;
    console.warn('[siMapEsriWorldElevationTerrain] addProtocol failed', err);
  }
}

/** Warm Esri DEM protocol cache for viewport tiles (LERC → Terrarium PNG). */
export function warmSiMapEsriWorldElevationDemTiles(
  jobs: ReadonlyArray<{ z: number; x: number; y: number }>,
  maxConcurrent = 14,
): void {
  if (!jobs.length) return;
  let idx = 0;
  let active = 0;
  const pump = () => {
    while (active < maxConcurrent && idx < jobs.length) {
      const job = jobs[idx++]!;
      active += 1;
      void fetchEsriTerrariumDemTile(job.z, job.x, job.y).finally(() => {
        active -= 1;
        pump();
      });
    }
  };
  pump();
}
