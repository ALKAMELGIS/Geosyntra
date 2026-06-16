/**
 * Google Earth–style tile pyramid cache — RAM (hot) + Cache API (disk).
 * Mapbox GL retains GPU tiles internally via maxTileCacheSize.
 */
import { devMapboxProxyRewrite } from '../../../lib/mapboxProxyUrl';

export const SI_MAP_TILE_PYRAMID_CACHE_NAME = 'si-map-tile-pyramid-v1';
export const SI_MAP_TILE_RAM_CACHE_MAX = 4096;

const BASEMAP_TILE_HOST_RE =
  /(?:google\.com\/vt|arcgisonline\.com|openstreetmap\.org|cartocdn\.com|opentopomap\.org)/i;

type RamEntry = {
  data: ArrayBuffer;
  at: number;
};

const ramCache = new Map<string, RamEntry>();
const ramKeyOrder: string[] = [];
const inflight = new Map<string, Promise<ArrayBuffer | null>>();

let diskCache: Cache | null | undefined;

function touchRamKey(key: string): void {
  const ix = ramKeyOrder.indexOf(key);
  if (ix >= 0) ramKeyOrder.splice(ix, 1);
  ramKeyOrder.push(key);
}

function rememberRam(key: string, data: ArrayBuffer): void {
  ramCache.set(key, { data, at: Date.now() });
  touchRamKey(key);
  while (ramKeyOrder.length > SI_MAP_TILE_RAM_CACHE_MAX) {
    const evict = ramKeyOrder.shift();
    if (evict) ramCache.delete(evict);
  }
}

async function openDiskCache(): Promise<Cache | null> {
  if (diskCache !== undefined) return diskCache;
  if (typeof caches === 'undefined') {
    diskCache = null;
    return null;
  }
  try {
    diskCache = await caches.open(SI_MAP_TILE_PYRAMID_CACHE_NAME);
  } catch {
    diskCache = null;
  }
  return diskCache;
}

export function normalizeSiMapTileRequestUrl(url: string): string {
  return devMapboxProxyRewrite(url);
}

export function isSiBasemapTileHttpUrl(url: string): boolean {
  if (!url || !BASEMAP_TILE_HOST_RE.test(url)) return false;
  return parseSlippyTileCoordsFromUrl(url) != null;
}

/** Slippy tile coords from Google vt query or z/y/x path templates. */
export function parseSlippyTileCoordsFromUrl(url: string): { z: number; x: number; y: number } | null {
  if (/google\.com\/vt/i.test(url)) {
    const xm = url.match(/(?:^|[?&])x=(\d+)/);
    const ym = url.match(/(?:^|[?&])y=(\d+)/);
    const zm = url.match(/(?:^|[?&])z=(\d+)/);
    if (xm && ym && zm) {
      return { x: Number(xm[1]), y: Number(ym[1]), z: Number(zm[1]) };
    }
  }
  try {
    const u = new URL(url);
    const zq = u.searchParams.get('z');
    const xq = u.searchParams.get('x');
    const yq = u.searchParams.get('y');
    if (zq != null && xq != null && yq != null) {
      const z = Number(zq);
      const x = Number(xq);
      const y = Number(yq);
      if (Number.isFinite(z) && Number.isFinite(x) && Number.isFinite(y)) return { z, x, y };
    }
    const parts = u.pathname.split('/').filter(Boolean);
    const nums = parts.slice(-3).map(p => Number.parseInt(p, 10));
    if (nums.length === 3 && nums.every(n => Number.isFinite(n))) {
      if (/arcgisonline\.com/i.test(url)) {
        const [z, tileY, tileX] = nums;
        return { z, x: tileX, y: tileY };
      }
      const [z, x, y] = nums;
      return { z, x, y };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function buildSiMapTileCacheKey(url: string): string {
  const normalized = normalizeSiMapTileRequestUrl(url);
  const coords = parseSlippyTileCoordsFromUrl(normalized);
  if (!coords) return normalized;
  try {
    const host = new URL(normalized).hostname;
    return `${host}|${coords.z}|${coords.x}|${coords.y}`;
  } catch {
    return `${coords.z}|${coords.x}|${coords.y}|${normalized}`;
  }
}

export function replaceSlippyTileCoordsInUrl(url: string, z: number, x: number, y: number): string {
  if (/google\.com\/vt/i.test(url)) {
    return url
      .replace(/((?:^|[?&])x=)\d+/, `$1${x}`)
      .replace(/((?:^|[?&])y=)\d+/, `$1${y}`)
      .replace(/((?:^|[?&])z=)\d+/, `$1${z}`);
  }
  try {
    const u = new URL(url);
    if (u.searchParams.has('z') && u.searchParams.has('x') && u.searchParams.has('y')) {
      u.searchParams.set('z', String(z));
      u.searchParams.set('x', String(x));
      u.searchParams.set('y', String(y));
      return u.toString();
    }
    const parts = u.pathname.split('/');
    const nums = parts.slice(-3);
    if (nums.length === 3 && nums.every(p => /^\d+$/.test(p))) {
      if (/arcgisonline\.com/i.test(url)) {
        parts[parts.length - 3] = String(z);
        parts[parts.length - 2] = String(y);
        parts[parts.length - 1] = String(x);
      } else {
        parts[parts.length - 3] = String(z);
        parts[parts.length - 2] = String(x);
        parts[parts.length - 1] = String(y);
      }
      u.pathname = parts.join('/');
      return u.toString();
    }
  } catch {
    /* ignore */
  }
  return url;
}

export function readSiMapTileRamCache(key: string): ArrayBuffer | null {
  const hit = ramCache.get(key);
  if (!hit) return null;
  touchRamKey(key);
  return hit.data;
}

export async function readSiMapTileDiskCache(key: string): Promise<ArrayBuffer | null> {
  const cache = await openDiskCache();
  if (!cache) return null;
  try {
    const res = await cache.match(key);
    if (!res?.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function writeSiMapTileDiskCache(key: string, data: ArrayBuffer): Promise<void> {
  const cache = await openDiskCache();
  if (!cache) return;
  try {
    await cache.put(key, new Response(data, { headers: { 'Content-Type': 'image/png' } }));
  } catch {
    /* quota / private mode */
  }
}

export function rememberSiMapTileInRam(key: string, data: ArrayBuffer): void {
  rememberRam(key, data);
}

/** RAM → disk lookup without network. */
export async function peekSiMapTilePyramidCache(url: string): Promise<ArrayBuffer | null> {
  const key = buildSiMapTileCacheKey(url);
  const ram = readSiMapTileRamCache(key);
  if (ram) return ram;
  const disk = await readSiMapTileDiskCache(key);
  if (disk) {
    rememberRam(key, disk);
    return disk;
  }
  return null;
}

/** Walk pyramid ancestors (z−1 …) — last valid tile stays visible while detail loads. */
export async function peekSiMapTilePyramidAncestor(
  url: string,
  maxSteps = 4,
): Promise<{ data: ArrayBuffer; fromUrl: string } | null> {
  const coords = parseSlippyTileCoordsFromUrl(url);
  if (!coords) {
    const direct = await peekSiMapTilePyramidCache(url);
    return direct ? { data: direct, fromUrl: url } : null;
  }
  for (let step = 0; step <= maxSteps; step++) {
    const z = coords.z - step;
    if (z < 0) break;
    const shift = step;
    const x = coords.x >> shift;
    const y = coords.y >> shift;
    const ancestorUrl = replaceSlippyTileCoordsInUrl(url, z, x, y);
    const data = await peekSiMapTilePyramidCache(ancestorUrl);
    if (data) return { data, fromUrl: ancestorUrl };
  }
  return null;
}

async function fetchAndStoreTile(url: string): Promise<ArrayBuffer | null> {
  const normalized = normalizeSiMapTileRequestUrl(url);
  const key = buildSiMapTileCacheKey(normalized);
  try {
    const res = await fetch(normalized, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
    if (!res.ok) return null;
    const data = await res.arrayBuffer();
    if (!data.byteLength) return null;
    rememberRam(key, data);
    void writeSiMapTileDiskCache(key, data);
    return data;
  } catch {
    return null;
  }
}

/** Cache-first tile load — deduped in-flight fetches. */
export async function fetchSiMapTileCacheFirst(url: string): Promise<ArrayBuffer | null> {
  const normalized = normalizeSiMapTileRequestUrl(url);
  const key = buildSiMapTileCacheKey(normalized);
  const ram = readSiMapTileRamCache(key);
  if (ram) return ram;
  const disk = await readSiMapTileDiskCache(key);
  if (disk) {
    rememberRam(key, disk);
    return disk;
  }
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = fetchAndStoreTile(normalized).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/** Warm a tile into RAM + disk without blocking the render loop. */
export function warmSiMapTileToPyramidCache(url: string): void {
  const key = buildSiMapTileCacheKey(url);
  if (readSiMapTileRamCache(key) || inflight.has(key)) return;
  void fetchSiMapTileCacheFirst(url);
}

export function resetSiMapTilePyramidCacheForTests(): void {
  ramCache.clear();
  ramKeyOrder.length = 0;
  inflight.clear();
  diskCache = undefined;
}

export function siMapTileRamCacheSize(): number {
  return ramCache.size;
}
