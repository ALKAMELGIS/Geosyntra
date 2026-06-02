import { describe, expect, it } from 'vitest';
import { SI_MAP_GL_FOG_DEFAULT, SI_MAP_GL_FOG_ELEVATION, SI_MAP_GLOBE_FOG_NO_HALO } from './siMapWeatherEffects';

describe('siMapWeatherEffects', () => {
  it('uses minimal horizon blend for elevation MapGL fog', () => {
    expect(SI_MAP_GL_FOG_ELEVATION['horizon-blend']).toBeLessThanOrEqual(0.03);
    expect(SI_MAP_GL_FOG_ELEVATION.range[0]).toBeGreaterThan(1);
  });

  it('disables globe limb halo in default MapGL fog', () => {
    expect(SI_MAP_GLOBE_FOG_NO_HALO['horizon-blend']).toBe(0);
    expect(SI_MAP_GL_FOG_DEFAULT['horizon-blend']).toBe(0);
    expect(SI_MAP_GL_FOG_DEFAULT['high-color']).toContain('0)');
  });
});
