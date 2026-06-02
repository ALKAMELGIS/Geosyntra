import { describe, expect, it } from 'vitest';
import {
  clampDaylightMinutes,
  computeSiMapSunDirection,
  daylightMinutesToPercent,
  formatDaylightMinutesLabel,
  matchSiDaylightPreset,
  percentToDaylightMinutes,
  SI_DAYLIGHT_MINUTES_MAX,
  SI_DAYLIGHT_PLAY_SPEED_MULTIPLIER,
  SI_DAYLIGHT_PLAYBACK_LOOP,
  SI_DAYLIGHT_PLAYBACK_MINUTES_PER_SEC,
  SI_DAYLIGHT_DATE_DAYS_PER_SEC,
  SI_DAYLIGHT_TIME_PRESETS,
  siMapStandardLightPreset,
} from './siMapDaylight';

describe('siMapDaylight', () => {
  it('clamps minutes to ArcGIS range', () => {
    expect(clampDaylightMinutes(-5)).toBe(0);
    expect(clampDaylightMinutes(2000)).toBe(SI_DAYLIGHT_MINUTES_MAX);
    expect(clampDaylightMinutes(1003.25)).toBe(1003);
  });

  it('formats minutes like ArcGIS aria-valuetext', () => {
    expect(formatDaylightMinutesLabel(1003)).toMatch(/4:43 PM/);
    expect(formatDaylightMinutesLabel(1230)).toMatch(/8:30 PM/);
  });

  it('converts percent ↔ minutes', () => {
    const pct = daylightMinutesToPercent(720);
    expect(percentToDaylightMinutes(pct)).toBe(720);
  });

  it('matches quick time presets', () => {
    expect(matchSiDaylightPreset(720)).toBe('day');
    expect(matchSiDaylightPreset(SI_DAYLIGHT_TIME_PRESETS[0]!.minutes)).toBe('morning');
  });

  it('computes noon sun south of observer in northern hemisphere', () => {
    const sun = computeSiMapSunDirection(720, '2026-06-21', 40);
    expect(sun.elevationDeg).toBeGreaterThan(20);
    expect(sun.azimuth).toBeGreaterThan(150);
    expect(sun.azimuth).toBeLessThan(210);
    expect(sun.polar).toBeLessThan(75);
  });

  it('maps minutes to Mapbox Standard light presets', () => {
    expect(siMapStandardLightPreset(420)).toBe('dawn');
    expect(siMapStandardLightPreset(720)).toBe('day');
    expect(siMapStandardLightPreset(1080)).toBe('dusk');
    expect(siMapStandardLightPreset(1320)).toBe('night');
  });

  it('uses slower looped time playback constants', () => {
    expect(SI_DAYLIGHT_PLAY_SPEED_MULTIPLIER).toBe(0.35);
    expect(SI_DAYLIGHT_PLAYBACK_MINUTES_PER_SEC).toBeCloseTo(42);
    expect(SI_DAYLIGHT_DATE_DAYS_PER_SEC).toBeCloseTo(0.14);
    expect(SI_DAYLIGHT_PLAYBACK_LOOP).toBe(true);
  });

  it('defaults daylightShadows to true when missing from storage', async () => {
    const { sanitizeSiMapWeatherSettings } = await import('./siMapWeatherTypes');
    const parsed = sanitizeSiMapWeatherSettings({ daylightShadows: undefined });
    expect(parsed.daylightShadows).toBe(true);
  });
});
