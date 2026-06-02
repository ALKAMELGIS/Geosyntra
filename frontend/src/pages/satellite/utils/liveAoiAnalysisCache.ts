import type { MpcZonalSampleResult } from '../../../lib/mpcPlanetaryApi';
import type { SiAoiRasterPixelSample } from './siAoiZonalStats';
import type { StaticAoiChartLayerId } from './staticAoiChartTypes';

export type LiveAoiCacheEntry = {
  result: MpcZonalSampleResult;
  raster: SiAoiRasterPixelSample;
  fetchedAt: number;
};

const MAX_ENTRIES = 24;
const store = new Map<string, LiveAoiCacheEntry>();

export function buildLiveAoiCacheKey(opts: {
  aoiKey: string;
  datetime: string;
  layerIds: readonly StaticAoiChartLayerId[];
  catalogUrl?: string;
  maxCloudCover?: number;
  resolution?: number;
  /** Visible WMS / RS layer id — bust cache when the map layer changes. */
  wmsLayer?: string;
  /** Timeline anchor date (YYYY-MM-DD) — bust cache on scrub / playback. */
  anchorIso?: string;
}): string {
  const layers = [...opts.layerIds].sort().join(',');
  const cc = opts.maxCloudCover != null ? String(opts.maxCloudCover) : '';
  return [
    opts.aoiKey.slice(0, 512),
    opts.datetime,
    layers,
    opts.catalogUrl ?? '',
    cc,
    String(opts.resolution ?? 20),
    (opts.wmsLayer ?? '').slice(0, 120),
    (opts.anchorIso ?? '').slice(0, 10),
  ].join('|');
}

export function getLiveAoiCache(key: string): LiveAoiCacheEntry | null {
  return store.get(key) ?? null;
}

export function setLiveAoiCache(key: string, entry: LiveAoiCacheEntry): void {
  if (store.size >= MAX_ENTRIES && !store.has(key)) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(key, entry);
}

export function clearLiveAoiCache(): void {
  store.clear();
}
