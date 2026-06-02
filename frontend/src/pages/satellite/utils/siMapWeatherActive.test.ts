import { describe, expect, it } from 'vitest';
import {
  isSiMapSunSkyWeatherActive,
  isSiMapWeatherPresetActive,
  siMapWeatherActivePresets,
} from './siMapWeatherActive';
import { DEFAULT_SI_MAP_WEATHER, sanitizeSiMapWeatherSettings } from './siMapWeatherTypes';

describe('siMapWeatherActive', () => {
  it('migrates legacy settings without activePresets', () => {
    const s = sanitizeSiMapWeatherSettings({ preset: 'rain', precipitation: 40 });
    expect(siMapWeatherActivePresets(s)).toEqual(['rain']);
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

  it('defaults active presets from panel preset', () => {
    expect(siMapWeatherActivePresets(DEFAULT_SI_MAP_WEATHER)).toEqual(['sunny']);
  });
});
