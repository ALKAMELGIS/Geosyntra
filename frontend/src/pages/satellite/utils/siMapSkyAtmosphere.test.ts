import { describe, expect, it } from 'vitest';
import {
  siMapGlobeOrbitSpaceFogSpec,
  siMapSpaceViewExposure,
  siMapSkyViewExposure,
} from './siMapSkyAtmosphere';

describe('siMapSpaceViewExposure', () => {
  it('keeps a minimum space backdrop in globe orbit at nadir', () => {
    expect(siMapSkyViewExposure(0)).toBe(0);
    expect(siMapSpaceViewExposure(0)).toBeGreaterThanOrEqual(0.38);
    expect(siMapSpaceViewExposure(0, { elevation3d: true })).toBeGreaterThanOrEqual(0.58);
  });

  it('ramps up with camera pitch', () => {
    expect(siMapSpaceViewExposure(45)).toBeGreaterThan(0.5);
  });
});

describe('siMapGlobeOrbitSpaceFogSpec', () => {
  it('uses deep space color and visible stars', () => {
    const spec = siMapGlobeOrbitSpaceFogSpec(0, -10, { elevation3d: true });
    expect(spec['space-color']).toBe('#010409');
    expect(spec['star-intensity'] ?? 0).toBeGreaterThan(0.4);
    expect(spec['horizon-blend']).toBe(0);
    expect(spec['high-color']).toBe('#010409');
  });
});
