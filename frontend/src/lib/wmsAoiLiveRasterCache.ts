/**
 * Deduped in-memory cache for live WMS AOI index sampling (popup + legend share one fetch).
 */
import type { SiAoiRasterPixelSample } from '../pages/satellite/utils/siAoiZonalStats';
import {
  fetchWmsAoiLiveIndexSample,
  type WmsAoiLiveIndexSampleOpts,
} from './wmsAoiLiveIndexSample';

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 32;

type CacheEntry = { sample: SiAoiRasterPixelSample; fetchedAt: number };

const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<SiAoiRasterPixelSample | null>>();

export function buildWmsAoiRasterCacheKey(opts: {
  wmsBaseUrl: string;
  layerName: string;
  timeStart: string;
  timeEnd: string;
  cloudCover: number;
  aoiKey: string;
  maxDim?: number;
}): string {
  return [
    opts.wmsBaseUrl,
    opts.layerName,
    opts.timeStart,
    opts.timeEnd,
    String(opts.cloudCover),
    opts.aoiKey.slice(0, 400),
    String(opts.maxDim ?? 384),
  ].join('|');
}

function evictIfNeeded() {
  if (store.size < MAX_ENTRIES) return;
  let oldestKey: string | null = null;
  let oldestAt = Infinity;
  for (const [k, v] of store) {
    if (v.fetchedAt < oldestAt) {
      oldestAt = v.fetchedAt;
      oldestKey = k;
    }
  }
  if (oldestKey) store.delete(oldestKey);
}

export function peekWmsAoiLiveRasterCache(key: string): SiAoiRasterPixelSample | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > TTL_MS) {
    store.delete(key);
    return null;
  }
  return hit.sample;
}

export async function getOrFetchWmsAoiLiveIndexSample(
  cacheKey: string,
  opts: WmsAoiLiveIndexSampleOpts,
): Promise<SiAoiRasterPixelSample | null> {
  const cached = peekWmsAoiLiveRasterCache(cacheKey);
  if (cached) return cached;

  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const task = fetchWmsAoiLiveIndexSample(opts)
    .then(sample => {
      if (sample) {
        evictIfNeeded();
        store.set(cacheKey, { sample, fetchedAt: Date.now() });
      }
      return sample;
    })
    .finally(() => {
      inflight.delete(cacheKey);
    });

  inflight.set(cacheKey, task);
  return task;
}

export function primeWmsAoiLiveRasterCache(key: string, sample: SiAoiRasterPixelSample): void {
  if (!sample?.grid?.length) return;
  evictIfNeeded();
  store.set(key, { sample, fetchedAt: Date.now() });
}
