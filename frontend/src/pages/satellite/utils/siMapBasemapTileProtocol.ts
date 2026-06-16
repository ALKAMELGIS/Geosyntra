import mapboxgl from 'mapbox-gl';
import {
  fetchSiMapTileCacheFirst,
  isSiBasemapTileHttpUrl,
  peekSiMapTilePyramidAncestor,
} from './siMapTilePyramidCache';

export const SI_BASEMAP_TILE_PROTOCOL_ID = 'si-basemap-cache';

type TileProtocolCallback = (
  error?: Error | null,
  data?: ArrayBuffer | null,
  cacheControl?: string | null,
  expires?: string | null,
) => void;

let protocolRegistered = false;

export function toSiBasemapCacheProtocolUrl(httpUrl: string): string {
  return `${SI_BASEMAP_TILE_PROTOCOL_ID}://${encodeURIComponent(httpUrl)}`;
}

export function parseSiBasemapCacheProtocolUrl(protocolUrl: string): string | null {
  const prefix = `${SI_BASEMAP_TILE_PROTOCOL_ID}://`;
  if (!protocolUrl.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(protocolUrl.slice(prefix.length));
  } catch {
    return null;
  }
}

async function loadBasemapTileWithPyramidFallback(httpUrl: string): Promise<ArrayBuffer | null> {
  const cached = await fetchSiMapTileCacheFirst(httpUrl);
  if (cached) return cached;
  const ancestor = await peekSiMapTilePyramidAncestor(httpUrl, 5);
  if (ancestor) return ancestor.data;
  return fetchSiMapTileCacheFirst(httpUrl);
}

/** Cache-first basemap protocol — serves RAM/disk instantly; ancestor tiles while detail loads. */
export function ensureSiMapBasemapTileProtocol(): void {
  if (protocolRegistered) return;
  if (typeof mapboxgl?.addProtocol !== 'function') {
    console.warn('[si-map] mapboxgl.addProtocol unavailable — basemap disk cache disabled');
    return;
  }
  protocolRegistered = true;

  try {
    mapboxgl.addProtocol(SI_BASEMAP_TILE_PROTOCOL_ID, (params, callback?: TileProtocolCallback) => {
      const httpUrl = parseSiBasemapCacheProtocolUrl(params.url);
      if (!httpUrl || !isSiBasemapTileHttpUrl(httpUrl)) {
        const err = new Error(`Invalid basemap tile url: ${params.url}`);
        if (typeof callback === 'function') {
          callback(err);
          return { cancel: () => {} };
        }
        return Promise.reject(err);
      }

      let cancelled = false;
      const job = loadBasemapTileWithPyramidFallback(httpUrl);

      if (typeof callback === 'function') {
        void job
          .then(data => {
            if (cancelled) return;
            if (!data?.byteLength) {
              callback(new Error('Basemap tile unavailable'));
              return;
            }
            callback(null, data, 'public, max-age=604800', undefined);
          })
          .catch(err => {
            if (!cancelled) callback(err instanceof Error ? err : new Error(String(err)));
          });
        return { cancel: () => { cancelled = true; } };
      }

      return job.then(data => {
        if (cancelled) throw new Error('Basemap tile request cancelled');
        if (!data?.byteLength) throw new Error('Basemap tile unavailable');
        return { data, cacheControl: 'public, max-age=604800' };
      });
    });
  } catch (err) {
    protocolRegistered = false;
    console.warn('[si-map] basemap tile protocol registration failed', err);
  }
}

export function resetSiMapBasemapTileProtocolForTests(): void {
  protocolRegistered = false;
}
