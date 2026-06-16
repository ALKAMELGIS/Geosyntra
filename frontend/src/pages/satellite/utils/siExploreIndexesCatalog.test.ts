import { describe, expect, it } from 'vitest';
import {
  SI_EXPLORE_INDEX_BANDS,
  filterSiExploreIndexBands,
} from './siExploreIndexesCatalog';
import { resolveExploreIndexLayerId } from './siExploreIndexesLayerResolve';

describe('siExploreIndexesCatalog', () => {
  it('includes all requested band cards', () => {
    expect(SI_EXPLORE_INDEX_BANDS.length).toBeGreaterThanOrEqual(24);
    expect(SI_EXPLORE_INDEX_BANDS.map(b => b.title)).toContain('NDVI');
    expect(SI_EXPLORE_INDEX_BANDS.map(b => b.title)).toContain('Snow/Clouds');
  });

  it('filters agriculture tab', () => {
    const ag = filterSiExploreIndexBands('agriculture');
    expect(ag.every(b => b.tabs.includes('agriculture'))).toBe(true);
    expect(ag.some(b => b.title === 'NDVI')).toBe(true);
    expect(ag.some(b => b.title === 'Snow/Clouds')).toBe(false);
  });
});

describe('resolveExploreIndexLayerId', () => {
  it('matches NDVI layer options', () => {
    const ndvi = SI_EXPLORE_INDEX_BANDS.find(b => b.id === 'ndvi')!;
    expect(
      resolveExploreIndexLayerId(ndvi, [
        { id: 'TRUE_COLOR', label: 'True Color' },
        { id: 'S2_NDVI', label: 'NDVI' },
      ]),
    ).toBe('S2_NDVI');
  });
});
