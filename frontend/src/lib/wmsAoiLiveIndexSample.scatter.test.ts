import { describe, expect, it } from 'vitest';
import { rasterHasScatterPair } from './wmsAoiLiveIndexSample';
import type { SiAoiRasterPixelSample } from '../pages/satellite/utils/siAoiZonalStats';

describe('rasterHasScatterPair', () => {
  it('returns true when both layers have enough valid paired pixels', () => {
    const raster: SiAoiRasterPixelSample = {
      areaHa: 1,
      resolutionM: 20,
      grid: Array.from({ length: 10 }, (_, i) => ({ lng: i * 0.001, lat: 0 })),
      layers: {
        NDVI: Array.from({ length: 10 }, (_, i) => 0.2 + i * 0.05),
        NDWI: Array.from({ length: 10 }, (_, i) => -0.1 + i * 0.03),
      },
    };
    expect(rasterHasScatterPair(raster, 'NDVI', 'NDWI')).toBe(true);
  });

  it('returns false when a layer is missing', () => {
    const raster: SiAoiRasterPixelSample = {
      areaHa: 1,
      resolutionM: 20,
      grid: [{ lng: 0, lat: 0 }],
      layers: { NDVI: [0.5] },
    };
    expect(rasterHasScatterPair(raster, 'NDVI', 'NDWI')).toBe(false);
  });
});
