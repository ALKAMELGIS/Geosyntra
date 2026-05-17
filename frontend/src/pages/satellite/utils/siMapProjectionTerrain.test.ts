import { describe, expect, it } from 'vitest';
import {
  clampSiViewStateForProjection,
  loadStoredSiMapProjectionMode,
  loadStoredSiTerrainExaggeration,
} from './siMapProjectionTerrain';

describe('siMapProjectionTerrain', () => {
  it('defaults projection to globe', () => {
    expect(loadStoredSiMapProjectionMode()).toBe('globe');
  });

  it('clamps terrain exaggeration', () => {
    expect(loadStoredSiTerrainExaggeration()).toBeGreaterThanOrEqual(0.5);
    expect(loadStoredSiTerrainExaggeration()).toBeLessThanOrEqual(3);
  });

  it('zeros pitch and bearing for 2D view state', () => {
    const clamped = clampSiViewStateForProjection(
      { longitude: 1, latitude: 2, zoom: 10, pitch: 55, bearing: 12 },
      '2d',
    );
    expect(clamped.pitch).toBe(0);
    expect(clamped.bearing).toBe(0);
    expect(clamped.zoom).toBe(10);
  });
});
