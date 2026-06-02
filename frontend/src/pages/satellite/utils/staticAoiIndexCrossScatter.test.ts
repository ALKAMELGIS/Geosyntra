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

  it('produces a natural scatter cloud, not collinear hash lines', () => {
    const model = buildStaticAoiIndexCrossScatterModel({
      xLayerId: 'NDVI',
      yLayerId: 'NDWI',
      feature: POLY,
      aoiKey: 'cloud-aoi',
      weekIdx: 0,
      weekly: WEEKLY,
      maxCells: 1200,
    })!;
    expect(model.points.length).toBeGreaterThan(50);

    // Residual scatter about the OLS line must be non-trivial: a perfect-line artifact
    // (the old bug) collapses every point onto y = slope*x + intercept (R² ≈ 1).
    const meanY = model.points.reduce((s, p) => s + p.y, 0) / model.points.length;
    let ssRes = 0;
    let ssTot = 0;
    for (const p of model.points) {
      const fit = model.slope * p.x + model.intercept;
      ssRes += (p.y - fit) ** 2;
      ssTot += (p.y - meanY) ** 2;
    }
    expect(ssTot).toBeGreaterThan(0);
    // Clearly not a straight line: a real cloud keeps meaningful residual variance.
    expect(ssRes / ssTot).toBeGreaterThan(0.1);
    expect(model.r2).toBeLessThan(0.97);

    // X values are not quantised to a few discrete levels (lines have very few unique X).
    const uniqueX = new Set(model.points.map(p => p.x.toFixed(4)));
    expect(uniqueX.size).toBeGreaterThan(model.points.length * 0.6);
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
