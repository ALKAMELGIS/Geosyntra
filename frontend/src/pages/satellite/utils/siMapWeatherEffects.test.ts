import { describe, expect, it } from 'vitest';
import { SI_MAP_GL_FOG_ELEVATION } from './siMapWeatherEffects';

describe('siMapWeatherEffects', () => {
  it('uses minimal horizon blend for elevation MapGL fog', () => {
    expect(SI_MAP_GL_FOG_ELEVATION['horizon-blend']).toBeLessThanOrEqual(0.03);
    expect(SI_MAP_GL_FOG_ELEVATION.range[0]).toBeGreaterThan(1);
  });
});
