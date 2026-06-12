import { describe, expect, it } from 'vitest';
import {
  SI_SENTINEL_HUB_WMS_MAP_MIN_ZOOM,
  siSentinelHubWmsMinZoomForResolution,
} from './siSentinelHubWmsMapZoom';

describe('siSentinelHubWmsMapZoom', () => {
  it('requires zoom ≥ 6 near mid-latitudes for 1500 m/px S2 tiles', () => {
    expect(siSentinelHubWmsMinZoomForResolution(1500, 35)).toBe(6);
    expect(SI_SENTINEL_HUB_WMS_MAP_MIN_ZOOM).toBe(6);
  });

  it('allows slightly lower zoom at the equator', () => {
    expect(siSentinelHubWmsMinZoomForResolution(1500, 0)).toBe(6);
  });

  it('uses a lower min zoom near the poles (smaller cos(lat))', () => {
    expect(siSentinelHubWmsMinZoomForResolution(1500, 60)).toBeLessThan(
      siSentinelHubWmsMinZoomForResolution(1500, 35),
    );
  });
});
