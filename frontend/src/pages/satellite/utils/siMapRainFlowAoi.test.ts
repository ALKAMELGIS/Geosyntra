import { describe, expect, it } from 'vitest';
import { collectRainFlowAoiFeatures, pointInRainFlowGeometry } from './siMapRainFlowAoi';

describe('siMapRainFlowAoi', () => {
  it('pointInRainFlowGeometry accepts polygon', () => {
    const geom = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
      ],
    };
    expect(pointInRainFlowGeometry(1, 1, geom)).toBe(true);
    expect(pointInRainFlowGeometry(5, 5, geom)).toBe(false);
  });

  it('collectRainFlowAoiFeatures dedupes workspace AOIs', () => {
    const poly = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [10, 10],
            [11, 10],
            [11, 11],
            [10, 11],
            [10, 10],
          ],
        ],
      },
    };
    const list = collectRainFlowAoiFeatures(poly, [{ feature: poly }]);
    expect(list.length).toBe(1);
  });
});
