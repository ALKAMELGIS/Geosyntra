import { describe, expect, it } from 'vitest';
import {
  buildSiMapTileCacheKey,
  parseSlippyTileCoordsFromUrl,
  replaceSlippyTileCoordsInUrl,
  resetSiMapTilePyramidCacheForTests,
} from './siMapTilePyramidCache';
import {
  buildSiBasemapPrefetchCoords,
  resetSiBasemapTilePyramidForTests,
} from './siMapBasemapTilePyramid';

const GOOGLE_TILE_TEMPLATE = 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';

describe('siMapTilePyramidCache', () => {
  it('parses Google vt tile coords', () => {
    const url = 'https://mt1.google.com/vt/lyrs=s&x=120&y=90&z=8';
    expect(parseSlippyTileCoordsFromUrl(url)).toEqual({ z: 8, x: 120, y: 90 });
  });

  it('builds stable cache keys', () => {
    resetSiMapTilePyramidCacheForTests();
    const url = 'https://mt1.google.com/vt/lyrs=s&x=1&y=2&z=3';
    expect(buildSiMapTileCacheKey(url)).toBe('mt1.google.com|3|1|2');
  });

  it('replaces slippy coords in Google vt urls', () => {
    const url = 'https://mt1.google.com/vt/lyrs=s&x=1&y=2&z=3';
    expect(replaceSlippyTileCoordsInUrl(url, 4, 8, 9)).toBe(
      'https://mt1.google.com/vt/lyrs=s&x=8&y=9&z=4',
    );
  });
});

describe('siMapBasemapTilePyramid', () => {
  it('orders coarse tiles before fine tiles', () => {
    resetSiBasemapTilePyramidForTests();
    const jobs = buildSiBasemapPrefetchCoords(
      { lng: 55.27, lat: 25.2, zoom: 14 },
      GOOGLE_TILE_TEMPLATE,
      { radius: 2, progressive: true },
    ).sort((a, b) => a.z - b.z || a.dist - b.dist);
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0]!.z).toBeLessThanOrEqual(jobs[jobs.length - 1]!.z);
  });

  it('adds direction-biased lookahead tiles when velocity is set', () => {
    const still = buildSiBasemapPrefetchCoords(
      { lng: 55.27, lat: 25.2, zoom: 12 },
      GOOGLE_TILE_TEMPLATE,
      { radius: 1, progressive: false, lookaheadRing: 1 },
    );
    const moving = buildSiBasemapPrefetchCoords(
      { lng: 55.27, lat: 25.2, zoom: 12 },
      GOOGLE_TILE_TEMPLATE,
      {
        radius: 1,
        progressive: false,
        lookaheadRing: 1,
        velocityLng: 0.02,
        velocityLat: 0,
      },
    );
    expect(moving.length).toBeGreaterThan(still.length);
  });
});
