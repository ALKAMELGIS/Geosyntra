import { describe, expect, it } from 'vitest';
import { loadSiMapSceneSlides } from './siMapSceneSlides';
import { sanitizeSiMapWeatherSettings } from './siMapWeatherTypes';
import { clampPct, DEFAULT_SI_MAP_WEATHER } from './siMapWeatherTypes';

describe('siMapWeatherTypes', () => {
  it('clamps percentages', () => {
    expect(clampPct(150)).toBe(100);
    expect(clampPct(-3)).toBe(0);
    expect(clampPct('42')).toBe(42);
  });

  it('sanitizes invalid weather payloads', () => {
    const s = sanitizeSiMapWeatherSettings({ preset: 'invalid', cloudCover: 999 });
    expect(s.preset).toBe(DEFAULT_SI_MAP_WEATHER.preset);
    expect(s.cloudCover).toBe(100);
  });

  it('sanitizes sunSky preset without auto-enabling', () => {
    const s = sanitizeSiMapWeatherSettings({ preset: 'sunSky' });
    expect(s.preset).toBe('sunSky');
    expect(s.activePresets).toEqual([]);
  });

  it('sanitizes concurrent active presets', () => {
    const s = sanitizeSiMapWeatherSettings({
      preset: 'rain',
      activePresets: ['sunSky', 'rain', 'invalid'],
    });
    expect(s.activePresets).toEqual(['sunSky', 'rain']);
  });

  it('sanitizes panel theme', () => {
    expect(sanitizeSiMapWeatherSettings({ panelTheme: 'light' }).panelTheme).toBe('light');
    expect(sanitizeSiMapWeatherSettings({ panelTheme: 'dark' }).panelTheme).toBe('dark');
    expect(sanitizeSiMapWeatherSettings({ panelTheme: 'neon' }).panelTheme).toBe('dark');
    expect(DEFAULT_SI_MAP_WEATHER.panelTheme).toBe('dark');
  });
});

describe('siMapSceneSlides', () => {
  it('loads empty store when localStorage missing', () => {
    const store = loadSiMapSceneSlides();
    expect(store.slides).toEqual([]);
    expect(store.activeSlideId).toBeNull();
  });
});
