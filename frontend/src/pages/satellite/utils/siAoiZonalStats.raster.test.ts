import { describe, expect, it } from 'vitest';
import {
  buildAoiZonalDatetimeRange,
  computeAoiIndexHealthBreakdown,
  computeAoiZonalAnalytics,
  mpcResultToRasterPixelSample,
  type SiAoiRasterPixelSample,
} from './siAoiZonalStats';
import type { StaticAoiChartLayerId } from './staticAoiChartTypes';

const squareAoi: GeoJSON.Feature = {
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

describe('mpcResultToRasterPixelSample', () => {
  it('maps aligned layer values onto the shared grid', () => {
    const sample = mpcResultToRasterPixelSample(
      {
        ok: true,
        datetime: '2024-01-01/2024-01-31',
        item_count: 3,
        pixel_count: 3,
        area_ha: 12.5,
        grid: [
          { lng: 46.61, lat: 24.71 },
          { lng: 46.615, lat: 24.715 },
          { lng: 46.62, lat: 24.72 },
        ],
        layers: {
          NDVI: { statistics: { min: -0.3, max: 0.1, mean: -0.1, std: 0.05 }, values: [-0.3, -0.2, 0.1] },
          NDWI: { statistics: { min: -0.4, max: 0.0, mean: -0.2, std: 0.05 }, values: [-0.4, -0.25, 0.0] },
        },
        processing: { resolution_m: 20, mode: 'stackstac-raster-pixel-sampling' },
      },
      ['NDVI', 'NDWI'] as StaticAoiChartLayerId[],
    );
    expect(sample?.grid).toHaveLength(3);
    expect(sample?.layers.NDVI).toEqual([-0.3, -0.2, 0.1]);
  });
});

describe('raster-only popup analytics', () => {
  const raster: SiAoiRasterPixelSample = {
    grid: [
      { lng: 1, lat: 1 },
      { lng: 2, lat: 2 },
      { lng: 3, lat: 3 },
      { lng: 4, lat: 4 },
    ],
    layers: {
      NDVI: [-0.3, -0.2, -0.1, 0.05],
    },
    areaHa: 40,
    resolutionM: 20,
  };

  it('does not produce equal tertiles when raster values differ', () => {
    const health = computeAoiIndexHealthBreakdown({
      feature: squareAoi,
      aoiKey: 'k',
      layerId: 'NDVI',
      weekCtx: { weekIdx: 0, nWeeks: 1, anchorWeeklyMean: 0, analysisDateIso: '2024-06-01' },
      rasterSample: raster,
      allowSyntheticFallback: false,
    });
    expect(health).not.toBeNull();
    const pcts = health!.rows.map(r => r.pct);
    expect(pcts.some(p => Math.abs(p - 33.3) > 0.5)).toBe(true);
  });

  it('builds datetime range from weekly window', () => {
    const range = buildAoiZonalDatetimeRange(
      { weekIdx: 0, nWeeks: 2, anchorWeeklyMean: 0.4, analysisDateIso: '2024-06-15' },
      [{ startDate: '2024-06-01', endDate: '2024-06-07', label: 'W1', mean: 0.4, min: 0, max: 1, itemCount: 1, enabled: true }],
      '',
      '',
    );
    expect(range).toBe('2024-06-01/2024-06-07');
  });

  it('skips synthetic analytics when raster is required', () => {
    const z = computeAoiZonalAnalytics({
      feature: squareAoi,
      aoiKey: 'k',
      layerIds: ['NDVI'],
      weekIdx: 0,
      nWeeks: 1,
      anchorWeeklyMean: 0.4,
      analysisDateIso: '2024-06-01',
      allowSyntheticFallback: false,
    });
    expect(z).toBeNull();
  });
});
