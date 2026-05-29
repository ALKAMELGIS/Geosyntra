import { describe, expect, it } from 'vitest';
import type { GeoJSON } from 'geojson';
import {
  buildStaticAoiIndexCrossScatterModel,
  regressionLineEndpoints,
} from './staticAoiIndexCrossScatter';

const POLY: GeoJSON.Feature = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [46.6, 24.7],
        [46.72, 24.7],
        [46.72, 24.82],
        [46.6, 24.82],
        [46.6, 24.7],
      ],
    ],
  },
};

const WEEKLY = [
  { weekIndex: 0, startDate: '2024-01-01', endDate: '2024-01-07', mean: 0.42 },
  { weekIndex: 1, startDate: '2024-01-08', endDate: '2024-01-14', mean: 0.48 },
];

describe('buildStaticAoiIndexCrossScatterModel', () => {
  it('builds many AOI pixel points with finite R²', () => {
    const model = buildStaticAoiIndexCrossScatterModel({
      xLayerId: 'NDVI',
      yLayerId: 'NDWI',
      feature: POLY,
      aoiKey: 'test-aoi',
      weekIdx: 0,
      weekly: WEEKLY,
      maxCells: 800,
    });
    expect(model).not.toBeNull();
    expect(model!.n).toBeGreaterThanOrEqual(8);
    expect(model!.points.length).toBe(model!.n);
    expect(Number.isFinite(model!.r2)).toBe(true);
    expect(model!.dataSource).toBe('synthetic');
  });

  it('returns null for same layer on both axes', () => {
    expect(
      buildStaticAoiIndexCrossScatterModel({
        xLayerId: 'NDVI',
        yLayerId: 'NDVI',
        feature: POLY,
        aoiKey: null,
        weekIdx: 0,
        weekly: WEEKLY,
      }),
    ).toBeNull();
  });
});

describe('regressionLineEndpoints', () => {
  it('returns two endpoints', () => {
    const model = buildStaticAoiIndexCrossScatterModel({
      xLayerId: 'NDVI',
      yLayerId: 'NDWI',
      feature: POLY,
      aoiKey: 'k',
      weekIdx: 0,
      weekly: WEEKLY,
    });
    expect(model).not.toBeNull();
    const line = regressionLineEndpoints(model!);
    expect(line).toHaveLength(2);
    expect(Number.isFinite(line![0]!.y)).toBe(true);
  });
});
