import { describe, expect, it } from 'vitest';
import {
  siWeatherIconClassName,
  siWeatherIconToneFromFaIcon,
  siWeatherToneFromHistoryVariable,
  siWeatherToneFromMetric,
} from './siWeatherIconTone';

describe('siWeatherIconTone', () => {
  it('maps WMO Font Awesome names to tones', () => {
    expect(siWeatherIconToneFromFaIcon('fa-sun')).toBe('sun');
    expect(siWeatherIconToneFromFaIcon('fa-cloud-sun')).toBe('partly');
    expect(siWeatherIconToneFromFaIcon('fa-cloud-showers-heavy')).toBe('heavy-rain');
    expect(siWeatherIconToneFromFaIcon('fa-bolt')).toBe('storm');
    expect(siWeatherIconToneFromFaIcon('fa-temperature-half')).toBe('temp');
  });

  it('maps metrics and history variables', () => {
    expect(siWeatherToneFromMetric('wind')).toBe('wind');
    expect(siWeatherToneFromHistoryVariable('pressure')).toBe('pressure');
  });

  it('builds legacy FA class strings', () => {
    expect(siWeatherIconClassName('fa-sun', 'hero')).toContain('si-wx-icon--sun');
    expect(siWeatherIconClassName('fa-sun', 'hero')).toContain('fa-sun');
    expect(siWeatherIconClassName('fa-sun', 'hero')).toContain('hero');
  });
});
