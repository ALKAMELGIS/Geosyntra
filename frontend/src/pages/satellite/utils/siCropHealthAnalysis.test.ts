import { describe, expect, it } from 'vitest';
import type { GeoJSON } from 'geojson';
import type { SiAoiRasterPixelSample } from './siAoiZonalStats';
import { runSiCropHealthAnalysis } from './siCropHealthAnalysis';

const POLY: GeoJSON.Feature = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [46.6, 24.7],
        [46.7, 24.7],
        [46.7, 24.8],
        [46.6, 24.8],
        [46.6, 24.7],
      ],
    ],
  },
};

function mockRaster(n: number, ndviBase: number): SiAoiRasterPixelSample {
  const grid = Array.from({ length: n }, (_, i) => ({
    lng: 46.6 + (i % 5) * 0.02,
    lat: 24.7 + Math.floor(i / 5) * 0.02,
  }));
  return {
    grid,
    layers: {
      NDVI: Array.from({ length: n }, (_, i) => ndviBase - (i % 3) * 0.05),
      EVI: Array.from({ length: n }, () => 0.42),
      SAVI: Array.from({ length: n }, () => 0.38),
      NDMI: Array.from({ length: n }, () => 0.12),
    },
    areaHa: 12,
    resolutionM: 20,
  };
}

describe('runSiCropHealthAnalysis', () => {
  it('classifies pixels and returns summary', () => {
    const out = runSiCropHealthAnalysis(mockRaster(25, 0.65), {
      aoiId: 'a1',
      aoiName: 'Test field',
      feature: POLY,
      cropType: 'wheat',
      ndviAnalysisEnabled: true,
      aiDiseaseEnabled: true,
      weather: {
        temperatureC: 30,
        humidityPct: 60,
        rainfallMmWeek: 8,
        soilMoisturePct: 40,
        source: 'manual',
      },
      weeklyComposites: [
        { weekIndex: 0, startDate: '2024-01-01', endDate: '2024-01-07', mean: 0.5 },
        { weekIndex: 1, startDate: '2024-01-08', endDate: '2024-01-14', mean: 0.55 },
      ],
      anchorDateIso: '2024-01-14',
    });
    expect(out).not.toBeNull();
    expect(out!.cellCount).toBeGreaterThan(0);
    const totalPct = Object.values(out!.summary).reduce((s, x) => s + x.pct, 0);
    expect(totalPct).toBeGreaterThan(99);
    expect(totalPct).toBeLessThan(101);
  });

  it('detects lower scores when NDVI is poor', () => {
    const healthy = runSiCropHealthAnalysis(mockRaster(20, 0.72), {
      aoiId: 'a1',
      aoiName: 'Good',
      feature: POLY,
      cropType: 'generic',
      ndviAnalysisEnabled: true,
      aiDiseaseEnabled: false,
      weather: {
        temperatureC: 22,
        humidityPct: 50,
        rainfallMmWeek: 15,
        soilMoisturePct: 50,
        source: 'manual',
      },
      weeklyComposites: [],
      anchorDateIso: '2024-06-01',
    });
    const poor = runSiCropHealthAnalysis(mockRaster(20, 0.22), {
      aoiId: 'a1',
      aoiName: 'Poor',
      feature: POLY,
      cropType: 'generic',
      ndviAnalysisEnabled: true,
      aiDiseaseEnabled: false,
      weather: {
        temperatureC: 22,
        humidityPct: 50,
        rainfallMmWeek: 15,
        soilMoisturePct: 50,
        source: 'manual',
      },
      weeklyComposites: [],
      anchorDateIso: '2024-06-01',
    });
    expect(healthy!.ndviMean).toBeGreaterThan(poor!.ndviMean);
    const healthyStress =
      healthy!.cells.reduce((s, c) => s + c.stressIndex, 0) / healthy!.cells.length;
    const poorStress = poor!.cells.reduce((s, c) => s + c.stressIndex, 0) / poor!.cells.length;
    expect(poorStress).toBeGreaterThan(healthyStress);
  });
});
