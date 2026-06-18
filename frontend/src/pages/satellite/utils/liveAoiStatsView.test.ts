import { describe, expect, it } from 'vitest';
import { buildLiveAoiStatsViewModel, liveAoiStatsStatusHint } from './liveAoiStatsView';

describe('buildLiveAoiStatsViewModel', () => {
  it('marks ready when raster stats exist even if upstream status is loading', () => {
    const vm = buildLiveAoiStatsViewModel({
      aoiKey: 'a1',
      aoiName: 'Field A',
      layerId: 'NDVI',
      layerName: 'NDVI',
      areaHa: 10,
      analysisDateIso: '2026-06-02',
      rasterSample: {
        areaHa: 10,
        grid: [{ lng: 1, lat: 2 }],
        layers: { NDVI: [0.42] },
      } as any,
      zonal: null,
      status: 'loading',
    });
    expect(vm?.mean).toBeCloseTo(0.42, 2);
    expect(vm?.status).toBe('ready');
  });

  it('computes stats from masked raster pixels only', () => {
    const vm = buildLiveAoiStatsViewModel({
      aoiKey: 'a1',
      aoiName: 'Field A',
      layerId: 'NDVI',
      layerName: 'NDVI',
      areaHa: 12.5,
      analysisDateIso: '2026-06-02',
      rasterSample: {
        areaHa: 12.5,
        grid: [
          { lng: 1, lat: 2 },
          { lng: 1.1, lat: 2.1 },
          { lng: 1.2, lat: 2.2 },
        ],
        layers: { NDVI: [0.2, 0.5, 0.8] },
      } as any,
      zonal: null,
      status: 'ready',
    });
    expect(vm?.mean).toBeCloseTo(0.5, 2);
    expect(vm?.min).toBeCloseTo(0.2, 2);
    expect(vm?.max).toBeCloseTo(0.8, 2);
    expect(vm?.pixelCount).toBe(3);
    expect(vm?.indexAnalysis?.cultivatedAreaHa).toBeGreaterThan(0);
    expect(vm?.indexAnalysis?.condition).toBe('Good');
  });

  it('does not use global timeline stats when raster is missing', () => {
    const vm = buildLiveAoiStatsViewModel({
      aoiKey: 'a1',
      aoiName: 'Field A',
      layerId: 'NDVI',
      layerName: 'NDVI',
      areaHa: 12.5,
      analysisDateIso: '2026-06-02',
      rasterSample: null,
      zonal: null,
      status: 'ready',
    });
    expect(vm?.mean).toBeNull();
    expect(vm?.min).toBeNull();
    expect(vm?.max).toBeNull();
    expect(vm?.status).toBe('error');
  });

  it('maps status to user hints', () => {
    expect(liveAoiStatsStatusHint('loading', true)).toBeNull();
    expect(liveAoiStatsStatusHint('unavailable', false)).toMatch(/WMS|Sentinel/i);
    expect(liveAoiStatsStatusHint('error', false)).toMatch(/Sampling failed/i);
  });

  it('returns null when area is invalid', () => {
    expect(
      buildLiveAoiStatsViewModel({
        aoiKey: 'a1',
        aoiName: 'Field A',
        layerId: 'NDVI',
        layerName: 'NDVI',
        areaHa: 0,
        analysisDateIso: '2026-06-02',
        rasterSample: null,
        zonal: null,
        status: 'idle',
      }),
    ).toBeNull();
  });
});
