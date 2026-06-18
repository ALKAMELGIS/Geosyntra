import { describe, expect, it } from 'vitest';
import { buildStaticAoiMultiChartDatasets } from './staticAoiMultiChartData';
import { weeklyZonalMeansFromRasters, weeklyZonalMeansWithTimelineFallback, zonalMeanFromRaster } from './siAoiWeeklyRasterSeries';
import type { SiAoiRasterPixelSample } from './siAoiZonalStats';

const WEEKLY = [
  { weekIndex: 0, startDate: '2024-03-01', endDate: '2024-03-07', mean: 0.2 },
  { weekIndex: 1, startDate: '2024-03-08', endDate: '2024-03-14', mean: 0.5 },
];

const POLY: GeoJSON.Feature = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [46.6, 24.7],
        [46.62, 24.7],
        [46.62, 24.72],
        [46.6, 24.72],
        [46.6, 24.7],
      ],
    ],
  },
};

const raster: SiAoiRasterPixelSample = {
  grid: [
    { lng: 46.61, lat: 24.71 },
    { lng: 46.615, lat: 24.715 },
  ],
  layers: { NDVI: [0.12, 0.18], NDWI: [-0.05, -0.1] },
  areaHa: 1,
  resolutionM: 20,
};

describe('buildStaticAoiMultiChartDatasets', () => {
  it('uses real weekly means only — no synthetic fallback curves', () => {
    const means = weeklyZonalMeansFromRasters(WEEKLY, ['NDVI', 'NDWI'], [raster, null], POLY);
    const built = buildStaticAoiMultiChartDatasets(WEEKLY, ['NDVI', 'NDWI'], means);
    expect(built.hasRealData).toBe(true);
    expect(built.datasets[0]!.data[0]).toBeCloseTo(0.15, 5);
    expect(built.datasets[0]!.data[1]).toBeNull();
    expect(built.datasets[1]!.data[0]).toBeCloseTo(-0.075, 5);
  });

  it('reports hasRealData false when all weeks are null', () => {
    const built = buildStaticAoiMultiChartDatasets(WEEKLY, ['NDVI'], { NDVI: [null, null] });
    expect(built.hasRealData).toBe(false);
    expect(built.datasets[0]!.data).toEqual([null, null]);
  });

  it('leaves gaps when MPC rasters are missing (no synthetic parallel curves)', () => {
    const bundle = weeklyZonalMeansWithTimelineFallback(
      WEEKLY,
      ['NDVI', 'NDWI'],
      [null, null],
      POLY,
      'aoi-1',
    );
    expect(bundle.hasPreviewFallback).toBe(false);
    expect(bundle.hasRealRaster).toBe(false);
    const built = buildStaticAoiMultiChartDatasets(WEEKLY, ['NDVI', 'NDWI'], bundle.means);
    expect(built.hasRealData).toBe(false);
    expect(built.datasets[0]!.data).toEqual([null, null]);
    expect(built.datasets[1]!.data).toEqual([null, null]);
  });
});

describe('zonalMeanFromRaster', () => {
  it('masks pixels to AOI geometry before averaging', () => {
    const mean = zonalMeanFromRaster(raster, 'NDVI', POLY);
    expect(mean).toBeCloseTo(0.15, 5);
  });
});
