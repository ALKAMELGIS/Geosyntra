import { describe, expect, it } from 'vitest';
import {
  clampSiViewStateForProjection,
  loadStoredSiMapProjectionMode,
  loadStoredSiTerrainExaggeration,
  migrateSiMapProjectionToGlobeOnly,
  normalizeContourClassificationMode,
  SI_CONTOUR_MAIN_LINE_EVERY_DEFAULT,
  SI_GLOBE_HOME_VIEW,
  siViewStatesNear,
} from './siMapProjectionTerrain';

describe('siMapProjectionTerrain', () => {
  it('defaults projection to globe', () => {
    expect(loadStoredSiMapProjectionMode()).toBe('globe');
  });

  it('uses centered globe home view (pitch 0)', () => {
    expect(SI_GLOBE_HOME_VIEW.pitch).toBe(0);
    expect(SI_GLOBE_HOME_VIEW.zoom).toBeGreaterThan(0);
  });

  it('migrates legacy 2d preference to globe', () => {
    const key = 'si-map-projection-mode-v1';
    localStorage.setItem(key, '2d');
    migrateSiMapProjectionToGlobeOnly();
    expect(localStorage.getItem(key)).toBe('globe');
    expect(loadStoredSiMapProjectionMode()).toBe('globe');
  });

  it('clamps terrain exaggeration', () => {
    expect(loadStoredSiTerrainExaggeration()).toBeGreaterThanOrEqual(0.5);
    expect(loadStoredSiTerrainExaggeration()).toBeLessThanOrEqual(3);
  });

  it('normalizes contour classification mode', () => {
    expect(normalizeContourClassificationMode('elevation')).toBe('elevation');
    expect(normalizeContourClassificationMode('density')).toBe('density');
    expect(normalizeContourClassificationMode('gradient')).toBe('gradient');
    expect(normalizeContourClassificationMode('invalid')).toBe('elevation');
  });

  it('defaults main contour index multiplier', () => {
    expect(SI_CONTOUR_MAIN_LINE_EVERY_DEFAULT).toBe(5);
  });

  it('siViewStatesNear treats epsilon float drift as equal', () => {
    const a = { longitude: 10, latitude: 20, zoom: 5, pitch: 0, bearing: 0 };
    const b = { ...a, longitude: a.longitude + 1e-7, zoom: a.zoom! + 1e-7 };
    expect(siViewStatesNear(a, b)).toBe(true);
    expect(siViewStatesNear(a, { ...a, zoom: 6 })).toBe(false);
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
