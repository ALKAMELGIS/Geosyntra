import { describe, expect, it } from 'vitest';
import type { SiCropHealthCell } from './siCropHealthTypes';
import { buildCropHealthSeverityLayers } from './siCropHealthRasterHeatmap';
import { computeCropHealthStressModel, stressIndexToRgb } from './siCropHealthStressModel';

const POLY = {
  type: 'Feature' as const,
  properties: {},
  geometry: {
    type: 'Polygon' as const,
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

function mockCells(n: number): SiCropHealthCell[] {
  const cells: SiCropHealthCell[] = [];
  for (let r = 0; r < 5; r += 1) {
    for (let c = 0; c < 5; c += 1) {
      const i = r * 5 + c;
      if (i >= n) break;
      cells.push({
        lng: 46.6 + c * 0.02,
        lat: 24.8 - r * 0.02,
        ndvi: 0.5,
        evi: 0.42,
        savi: 0.38,
        ndviDelta: 0,
        score: 0.6,
        stressIndex: 0.4,
        condition: 'stress',
        severity: 'medium',
      });
    }
  }
  return cells;
}

describe('crop health stress raster', () => {
  it('maps stress index to spectral RGB', () => {
    const low = stressIndexToRgb(0.1);
    const high = stressIndexToRgb(0.9);
    expect(low[1]).toBeGreaterThan(low[0]);
    expect(high[0]).toBeGreaterThan(high[1]);
  });

  it('builds severity GIS polygons inside AOI', () => {
    const layers = buildCropHealthSeverityLayers(mockCells(25), POLY);
    const total =
      layers.low.features.length +
      layers.medium.features.length +
      layers.high.features.length;
    expect(total).toBeGreaterThan(0);
  });

  it('fuses NDVI, NDMI, and weather in stress model', () => {
    const good = computeCropHealthStressModel({
      ndvi: 0.72,
      evi: 0.55,
      savi: 0.5,
      ndmi: 0.25,
      ndviDelta: 0.02,
      crop: 'wheat',
      weather: {
        temperatureC: 22,
        humidityPct: 55,
        rainfallMmWeek: 15,
        soilMoisturePct: 50,
        source: 'manual',
      },
      useNdviTemporal: true,
      useNdmi: true,
      useWeather: true,
    });
    const bad = computeCropHealthStressModel({
      ndvi: 0.18,
      evi: 0.12,
      savi: 0.1,
      ndmi: -0.1,
      ndviDelta: -0.12,
      crop: 'wheat',
      weather: {
        temperatureC: 40,
        humidityPct: 90,
        rainfallMmWeek: 0,
        soilMoisturePct: 15,
        source: 'manual',
      },
      useNdviTemporal: true,
      useNdmi: true,
      useWeather: true,
    });
    expect(bad.stressIndex).toBeGreaterThan(good.stressIndex);
  });
});
