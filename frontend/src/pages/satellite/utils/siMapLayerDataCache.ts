type CacheEntry = {
  geojson: unknown;
  storedAt: number;
  sourceKey: string;
};

const cache = new Map<string, CacheEntry>();
const MAX_ENTRIES = 48;

export function buildSiLayerDataCacheKey(
  layerId: string,
  sourceKey?: string | null,
): string {
  return `${layerId}::${sourceKey ?? 'local'}`;
}

export function getSiLayerDataCache(key: string): unknown | null {
  return cache.get(key)?.geojson ?? null;
}

export function setSiLayerDataCache(key: string, geojson: unknown, sourceKey: string): void {
  if (cache.size >= MAX_ENTRIES && !cache.has(key)) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, { geojson, storedAt: Date.now(), sourceKey });
}

export function clearSiLayerDataCacheForLayer(layerId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${layerId}::`)) cache.delete(key);
  }
}
