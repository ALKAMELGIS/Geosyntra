import { describe, expect, it } from 'vitest';
import { openMeteoWmoLabel, openMeteoWindCompass } from './openMeteoMapWeather';

describe('openMeteoMapWeather', () => {
  it('maps WMO codes to labels', () => {
    expect(openMeteoWmoLabel(0).label).toBe('Clear');
    expect(openMeteoWmoLabel(61).icon).toBe('fa-cloud-rain');
  });

  it('converts wind degrees to compass', () => {
    expect(openMeteoWindCompass(0)).toBe('N');
    expect(openMeteoWindCompass(90)).toBe('E');
  });
});
