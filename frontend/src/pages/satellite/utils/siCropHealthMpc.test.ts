import { describe, expect, it } from 'vitest';
import {
  buildSyntheticCropHealthRaster,
  cropHealthDefaultDatetime,
  rasterHasCropHealthLayers,
} from './siCropHealthMpc';

describe('siCropHealthMpc', () => {
  it('builds a valid synthetic raster inside polygon', () => {
    const feature = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [8.68, 49.41],
            [8.69, 49.41],
            [8.69, 49.42],
            [8.68, 49.42],
            [8.68, 49.41],
          ],
        ],
      },
    };
    const sample = buildSyntheticCropHealthRaster(feature, [
      { weekIndex: 0, startDate: '2024-01-01', endDate: '2024-01-07', mean: 0.55 },
    ]);
    expect(sample).not.toBeNull();
    expect(rasterHasCropHealthLayers(sample!)).toBe(true);
    expect(sample!.layers.NDVI!.length).toBeGreaterThanOrEqual(4);
  });

  it('uses rolling datetime window', () => {
    const dt = cropHealthDefaultDatetime();
    expect(dt).toMatch(/^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/);
  });
});
