import { describe, expect, it } from 'vitest';
import { filterLayerLiveIndexSelectGroups } from './SiLayerLiveIndexSelect';
import type { LayerLiveIndexSelectGroup } from '../../../lib/siLayerLiveCompositeCatalog';

const SAMPLE_GROUPS: LayerLiveIndexSelectGroup[] = [
  {
    key: 'core',
    label: '📊 Core indices',
    order: 0,
    options: [
      {
        id: 'NDVI',
        abbr: 'NDVI',
        title: 'Normalized Difference Vegetation Index',
        sciName: 'Normalized Difference Vegetation Index',
        order: 0,
      },
      {
        id: 'NDWI',
        abbr: 'NDWI',
        title: 'Normalized Difference Water Index',
        sciName: 'Normalized Difference Water Index',
        order: 1,
      },
    ],
  },
  {
    key: 'veg',
    label: '🌱 Vegetation Health',
    order: 1,
    options: [
      {
        id: 'VHS',
        abbr: 'VHS',
        title: 'Vegetation Health Score',
        sciName: 'Vegetation Health Score',
        order: 0,
      },
    ],
  },
];

describe('filterLayerLiveIndexSelectGroups', () => {
  it('returns all groups when query is empty', () => {
    expect(filterLayerLiveIndexSelectGroups(SAMPLE_GROUPS, '')).toHaveLength(2);
  });

  it('filters by abbreviation', () => {
    const out = filterLayerLiveIndexSelectGroups(SAMPLE_GROUPS, 'ndwi');
    expect(out).toHaveLength(1);
    expect(out[0]?.options[0]?.abbr).toBe('NDWI');
  });

  it('filters by group label', () => {
    const out = filterLayerLiveIndexSelectGroups(SAMPLE_GROUPS, 'vegetation health');
    expect(out).toHaveLength(1);
    expect(out[0]?.options[0]?.abbr).toBe('VHS');
  });

  it('filters by scientific name', () => {
    const out = filterLayerLiveIndexSelectGroups(SAMPLE_GROUPS, 'vegetation index');
    expect(out).toHaveLength(1);
    expect(out[0]?.options[0]?.abbr).toBe('NDVI');
  });

  it('returns empty when nothing matches', () => {
    expect(filterLayerLiveIndexSelectGroups(SAMPLE_GROUPS, 'xyz')).toHaveLength(0);
  });
});
