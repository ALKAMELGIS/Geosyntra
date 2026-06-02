import { describe, expect, it } from 'vitest';
import {
  computeElevationProfileStats,
  densifyLineCoords,
  haversineM,
  type SiElevationProfileSample,
} from './siMapElevationProfile';

describe('siMapElevationProfile', () => {
  it('densifies a short segment', () => {
    const dense = densifyLineCoords(
      [
        [0, 0],
        [0, 0.001],
      ],
      50,
    );
    expect(dense.length).toBeGreaterThan(2);
  });

  it('computes haversine distance', () => {
    const d = haversineM(55.27, 25.2, 55.28, 25.21);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(2000);
  });

  it('aggregates profile stats', () => {
    const samples: SiElevationProfileSample[] = [
      { distanceM: 0, elevationM: 100, lng: 0, lat: 0, gradePct: 0 },
      { distanceM: 100, elevationM: 120, lng: 0.001, lat: 0, gradePct: 20 },
      { distanceM: 200, elevationM: 90, lng: 0.002, lat: 0, gradePct: -30 },
    ];
    const stats = computeElevationProfileStats(samples);
    expect(stats?.minM).toBe(90);
    expect(stats?.maxM).toBe(120);
    expect(stats?.gainM).toBe(20);
    expect(stats?.lossM).toBeLessThan(0);
  });
});
