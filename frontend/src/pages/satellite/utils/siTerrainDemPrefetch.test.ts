import { describe, expect, it, beforeEach } from 'vitest';
import {
  appendSiTerrainDemPrefetchTiles,
  buildSiTerrainDemPrefetchJobs,
  prefetchSiTerrainDemTiles,
  resetSiTerrainDemPrefetchForTests,
  shouldPrefetchSiTerrainDemView,
  siTerrainDemTilePrefetchCacheSize,
} from './siMapTerrainDemRuntime';

describe('siTerrainDemPrefetch', () => {
  beforeEach(() => {
    resetSiTerrainDemPrefetchForTests();
  });

  it('buildSiTerrainDemPrefetchJobs orders coarse LOD before detail', () => {
    const jobs = buildSiTerrainDemPrefetchJobs(
      { lng: 19, lat: -33, zoom: 12 },
      { radius: 2, progressive: true },
    );
    expect(jobs.length).toBeGreaterThan(0);
    const minZ = Math.min(...jobs.map(j => j.z));
    const maxZ = Math.max(...jobs.map(j => j.z));
    expect(minZ).toBeLessThan(maxZ);
    expect(jobs[0]!.z).toBe(minZ);
  });

  it('prefetchSiTerrainDemTiles enqueues global coarse tiles without viewport', () => {
    prefetchSiTerrainDemTiles();
    expect(siTerrainDemTilePrefetchCacheSize()).toBe(0);
  });

  it('appendSiTerrainDemPrefetchTiles does not throw for viewport warm', () => {
    prefetchSiTerrainDemTiles();
    expect(() =>
      appendSiTerrainDemPrefetchTiles({ lng: 55.27, lat: 25.2, zoom: 11 }, { progressive: true }),
    ).not.toThrow();
  });

  it('shouldPrefetchSiTerrainDemView skips tiny viewport moves', () => {
    const prev = { lng: 19, lat: -33, zoom: 10 };
    expect(shouldPrefetchSiTerrainDemView(prev, { lng: 19.001, lat: -33.001, zoom: 10 })).toBe(
      false,
    );
    expect(shouldPrefetchSiTerrainDemView(prev, { lng: 21, lat: -33, zoom: 10 })).toBe(true);
  });
});
