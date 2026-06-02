import { describe, expect, it } from 'vitest';
import {
  activeLaServiceAreaRings,
  buildLaServiceAreas,
  circleRingMeters,
  DEFAULT_LA_SERVICE_AREA_SETTINGS,
} from './siLocationAllocationServiceAreas';

describe('activeLaServiceAreaRings', () => {
  it('collects enabled time presets and custom value', () => {
    const rings = activeLaServiceAreaRings({
      ...DEFAULT_LA_SERVICE_AREA_SETTINGS,
      measure: 'time',
      timePresets: { '5': true, '10': false, '15': true, '30': false },
      useCustomTime: true,
      customTimeMinutes: 20,
    });
    expect(rings).toEqual([5, 15, 20]);
  });

  it('collects enabled distance presets', () => {
    const rings = activeLaServiceAreaRings({
      ...DEFAULT_LA_SERVICE_AREA_SETTINGS,
      measure: 'distance',
      distancePresets: { '1': false, '3': true, '5': true, '10': false },
      useCustomDistance: false,
    });
    expect(rings).toEqual([3, 5]);
  });
});

describe('circleRingMeters', () => {
  it('returns a closed ring', () => {
    const ring = circleRingMeters(0, 0, 1000, 12);
    expect(ring.length).toBe(13);
    const [x0, y0] = ring[0]!;
    const [x1, y1] = ring[ring.length - 1]!;
    expect(Math.hypot(x0 - x1, y0 - y1)).toBeLessThan(1e-9);
  });
});

describe('buildLaServiceAreas', () => {
  it('returns empty when disabled', async () => {
    const result = await buildLaServiceAreas({
      facilities: [{ id: 'f1', lng: 0, lat: 0 }],
      demandPoints: [{ id: 'd1', lng: 0.001, lat: 0 }],
      settings: { ...DEFAULT_LA_SERVICE_AREA_SETTINGS, enabled: false },
    });
    expect(result.geojson.features).toHaveLength(0);
    expect(result.servedDemandIds).toHaveLength(0);
  });

  it('builds circle fallback polygons and coverage stats without API key', async () => {
    const result = await buildLaServiceAreas({
      facilities: [{ id: 'f1', lng: 0, lat: 0, label: 'Facility 1' }],
      demandPoints: [
        { id: 'd1', lng: 0.001, lat: 0, label: 'Near' },
        { id: 'd2', lng: 1, lat: 1, label: 'Far' },
      ],
      settings: {
        ...DEFAULT_LA_SERVICE_AREA_SETTINGS,
        enabled: true,
        measure: 'distance',
        distancePresets: { '1': true, '3': false, '5': false, '10': false },
        useCustomDistance: false,
      },
      apiKey: '',
    });

    expect(result.geojson.features.length).toBe(1);
    expect(result.ringStats).toHaveLength(1);
    expect(result.ringStats[0]?.facilityLabel).toBe('Facility 1');
    expect(result.servedDemandIds).toContain('d1');
    expect(result.servedDemandIds).not.toContain('d2');
  });
});
