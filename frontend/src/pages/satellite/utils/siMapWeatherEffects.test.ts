import { describe, expect, it } from 'vitest';
import { SI_MAP_GL_FOG_DEFAULT, SI_MAP_GL_FOG_ELEVATION, SI_MAP_GLOBE_FOG_NO_HALO } from './siMapWeatherEffects';

describe('siMapWeatherEffects', () => {
  it('uses deep-space elevation fog with stars and no horizon limb line', () => {
    expect(SI_MAP_GL_FOG_ELEVATION['horizon-blend']).toBe(0);
    expect(SI_MAP_GL_FOG_ELEVATION['space-color']).toBe('#010409');
    expect(SI_MAP_GL_FOG_ELEVATION['star-intensity'] ?? 0).toBeGreaterThan(0.35);
  });

  it('uses deep space in default MapGL fog with subtle stars', () => {
    expect(SI_MAP_GLOBE_FOG_NO_HALO['space-color']).toBe('#010409');
    expect(SI_MAP_GLOBE_FOG_NO_HALO['star-intensity'] ?? 0).toBeGreaterThan(0.2);
    expect(SI_MAP_GL_FOG_DEFAULT['star-intensity']).toBe(SI_MAP_GLOBE_FOG_NO_HALO['star-intensity']);
  });
});
