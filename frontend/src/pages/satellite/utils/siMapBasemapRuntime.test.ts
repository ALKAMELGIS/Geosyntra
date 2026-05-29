import { describe, expect, it } from 'vitest';
import { buildBasemapCatalog } from '../basemapCatalog';
import {
  SI_QUICK_BASEMAP_PRESETS,
  entrySupportsInPlaceBasemapSwap,
  findFirstNonBasemapLayerId,
} from './siMapBasemapRuntime';

describe('siMapBasemapRuntime', () => {
  const catalog = buildBasemapCatalog('', { includeMapboxVectorBasemaps: false });

  it('quick presets use lightweight Esri rasters', () => {
    for (const preset of SI_QUICK_BASEMAP_PRESETS) {
      const entry = catalog.find(e => e.id === preset.catalogId);
      expect(entry, preset.key).toBeDefined();
      expect(entrySupportsInPlaceBasemapSwap(entry)).toBe(true);
    }
  });

  it('findFirstNonBasemapLayerId skips basemap stack', () => {
    const map = {
      getStyle: () => ({
        layers: [
          { id: 'si-basemap-layer-0' },
          { id: 'si-basemap-layer-1' },
          { id: 'aoi-fill' },
        ],
      }),
    } as unknown as import('mapbox-gl').Map;
    expect(findFirstNonBasemapLayerId(map)).toBe('aoi-fill');
  });
});
