import { describe, expect, it } from 'vitest';
import {
  buildWmsAoiRasterCacheKey,
  peekWmsAoiLiveRasterCache,
  primeWmsAoiLiveRasterCache,
} from './wmsAoiLiveRasterCache';

describe('wmsAoiLiveRasterCache', () => {
  it('stores and retrieves cached raster samples', () => {
    const key = buildWmsAoiRasterCacheKey({
      wmsBaseUrl: 'https://wms.test',
      layerName: 'NDVI',
      timeStart: '2026-06-01',
      timeEnd: '2026-06-05',
      cloudCover: 20,
      aoiKey: 'aoi-1',
    });
    expect(peekWmsAoiLiveRasterCache(key)).toBeNull();
    primeWmsAoiLiveRasterCache(key, {
      grid: [{ lng: 1, lat: 2 }],
      layers: { NDVI: [0.5] },
      areaHa: 1,
      resolutionM: 10,
      aoiClipped: true,
    });
    const hit = peekWmsAoiLiveRasterCache(key);
    expect(hit?.grid.length).toBe(1);
    expect(hit?.aoiClipped).toBe(true);
  });
});
