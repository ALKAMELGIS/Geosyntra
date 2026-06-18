import { describe, expect, it } from 'vitest';
import {
  isSiMapWeatherSunSkyLightingActive,
  siMapWeatherActivePresets,
  siMapWeatherHasAtmosphericEffects,
} from './siMapWeatherActive';
import {
  applySiMapWeatherPresetClick,
  siMapWeatherPanelControlFlags,
} from './siMapWeatherPresetActions';
import { DEFAULT_SI_MAP_WEATHER, sanitizeSiMapWeatherSettings } from './siMapWeatherTypes';

describe('siMapWeatherPresetActions', () => {
  it('enables a preset without disabling others', () => {
    const base = sanitizeSiMapWeatherSettings({
      preset: 'sunny',
      activePresets: ['sunny'],
    });
    const next = applySiMapWeatherPresetClick(base, 'rain');
    expect(siMapWeatherActivePresets(next).sort()).toEqual(['rain', 'sunny']);
    expect(next.preset).toBe('rain');
  });

  it('toggles off an active preset without affecting others', () => {
    const base = sanitizeSiMapWeatherSettings({
      preset: 'sunny',
      activePresets: ['sunny', 'rain'],
    });
    const next = applySiMapWeatherPresetClick(base, 'rain');
    expect(siMapWeatherActivePresets(next)).toEqual(['sunny']);
  });

  it('disables only the focused preset when clicked again', () => {
    const base = sanitizeSiMapWeatherSettings({
      preset: 'rain',
      activePresets: ['sunny', 'rain'],
      precipitation: 70,
    });
    const next = applySiMapWeatherPresetClick(base, 'rain');
    expect(siMapWeatherActivePresets(next)).toEqual(['sunny']);
    expect(next.precipitation).toBe(70);
  });

  it('enables Sun & Sky lighting alongside rain', () => {
    const base = sanitizeSiMapWeatherSettings({
      preset: 'rain',
      activePresets: ['rain'],
    });
    const next = applySiMapWeatherPresetClick(base, 'sunSky', { sunSkyBuildingShadows: true });
    expect(siMapWeatherActivePresets(next).sort()).toEqual(['rain', 'sunSky']);
    expect(next.sunPositionByDateTime).toBe(true);
    expect(isSiMapWeatherSunSkyLightingActive(next)).toBe(true);
    expect(siMapWeatherHasAtmosphericEffects(next)).toBe(true);
  });

  it('turns off Sun & Sky lighting without stopping rain', () => {
    const base = sanitizeSiMapWeatherSettings({
      preset: 'sunSky',
      activePresets: ['sunSky', 'rain'],
      sunPositionByDateTime: true,
      daylightTimePlaying: true,
    });
    const next = applySiMapWeatherPresetClick(base, 'sunSky');
    expect(siMapWeatherActivePresets(next)).toEqual(['rain']);
    expect(next.sunPositionByDateTime).toBe(false);
    expect(next.daylightTimePlaying).toBe(false);
    expect(isSiMapWeatherSunSkyLightingActive(next)).toBe(false);
  });

  it('shows precip/fog controls when any matching preset is running', () => {
    const s = sanitizeSiMapWeatherSettings({
      preset: 'sunny',
      activePresets: ['sunny', 'rain', 'fog'],
    });
    expect(siMapWeatherPanelControlFlags(s)).toEqual({
      showPrecip: true,
      showFog: true,
      showSnowCover: false,
    });
  });

  it('allows all presets to be off', () => {
    const base = sanitizeSiMapWeatherSettings({
      preset: 'rain',
      activePresets: ['rain'],
    });
    const next = applySiMapWeatherPresetClick(base, 'rain');
    expect(siMapWeatherActivePresets(next)).toEqual([]);
  });
});

describe('siMapWeatherActive helpers', () => {
  it('defaults sunPositionByDateTime off without sunSky', () => {
    expect(DEFAULT_SI_MAP_WEATHER.sunPositionByDateTime).toBe(false);
    const s = sanitizeSiMapWeatherSettings({ preset: 'rain', activePresets: ['rain'] });
    expect(s.sunPositionByDateTime).toBe(false);
  });

  it('enables sunPositionByDateTime when sunSky is active', () => {
    const s = sanitizeSiMapWeatherSettings({ preset: 'sunSky', activePresets: ['sunSky', 'cloudy'] });
    expect(s.sunPositionByDateTime).toBe(true);
  });
});
