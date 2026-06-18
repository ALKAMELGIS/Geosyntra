import { describe, expect, it } from 'vitest';
import {
  isSiMapSunSkyWeatherActive,
  isSiMapWeatherPresetActive,
  siMapWeatherActivePresets,
  siMapWeatherImperativeMapEffectsActive,
} from './siMapWeatherActive';
import { DEFAULT_SI_MAP_WEATHER, sanitizeSiMapWeatherSettings } from './siMapWeatherTypes';

describe('siMapWeatherActive', () => {
  it('legacy settings without activePresets stay off until user toggles', () => {
    const s = sanitizeSiMapWeatherSettings({ preset: 'rain', precipitation: 40 });
    expect(siMapWeatherActivePresets(s)).toEqual([]);
  });

  it('tracks multiple concurrent presets', () => {
    const s = sanitizeSiMapWeatherSettings({
      preset: 'rain',
      activePresets: ['sunSky', 'rain'],
      daylightTimePlaying: true,
    });
    expect(isSiMapSunSkyWeatherActive(s)).toBe(true);
    expect(isSiMapWeatherPresetActive(s, 'rain')).toBe(true);
    expect(s.daylightTimePlaying).toBe(true);
  });

  it('starts with no presets until user toggles', () => {
    expect(siMapWeatherActivePresets(DEFAULT_SI_MAP_WEATHER)).toEqual([]);
  });

  it('imperative map effects active when any preset runs', () => {
    expect(siMapWeatherImperativeMapEffectsActive(DEFAULT_SI_MAP_WEATHER)).toBe(false);
    const rainy = sanitizeSiMapWeatherSettings({ preset: 'rain', activePresets: ['rain'] });
    expect(siMapWeatherImperativeMapEffectsActive(rainy)).toBe(true);
    const off = sanitizeSiMapWeatherSettings({ preset: 'rain', activePresets: [] });
    expect(siMapWeatherImperativeMapEffectsActive(off)).toBe(false);
  });
});
