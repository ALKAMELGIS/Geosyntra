import { describe, expect, it } from 'vitest';
import {
  SI_NDVI_CLASSIFICATION_STOPS,
  SI_NDWI_CLASSIFICATION_STOPS,
  siSampleRampColorAt,
  siWmsResampleRampToClassCount,
} from './siWmsIndexClassificationRamp';

function rgbChannel(hex: number, ch: 'r' | 'g' | 'b'): number {
  if (ch === 'r') return (hex >> 16) & 255;
  if (ch === 'g') return (hex >> 8) & 255;
  return hex & 255;
}

describe('siWmsIndexClassificationRamp', () => {
  it('resamples scientific ramp to 11 stops (10 classes)', () => {
    const out = siWmsResampleRampToClassCount(SI_NDVI_CLASSIFICATION_STOPS, 11);
    expect(out.length).toBe(11);
    expect(out[0]![0]).toBe(SI_NDVI_CLASSIFICATION_STOPS[0]![0]);
    expect(out[out.length - 1]![0]).toBe(SI_NDVI_CLASSIFICATION_STOPS[SI_NDVI_CLASSIFICATION_STOPS.length - 1]![0]);
  });

  it('maps strongly negative NDVI to water blues (blue > red)', () => {
    const hex = siSampleRampColorAt(SI_NDVI_CLASSIFICATION_STOPS, -0.35);
    expect(rgbChannel(hex, 'b')).toBeGreaterThan(rgbChannel(hex, 'r'));
  });

  it('maps positive NDVI to vegetation greens (green > blue)', () => {
    const hex = siSampleRampColorAt(SI_NDVI_CLASSIFICATION_STOPS, 0.55);
    expect(rgbChannel(hex, 'g')).toBeGreaterThan(rgbChannel(hex, 'b'));
  });

  it('preserves NDWI water spectrum at high values (deep navy)', () => {
    const out = siWmsResampleRampToClassCount(SI_NDWI_CLASSIFICATION_STOPS, 11);
    const deep = out[out.length - 1]![1];
    expect(rgbChannel(deep, 'b')).toBeGreaterThan(40);
    expect(rgbChannel(deep, 'r')).toBeLessThan(rgbChannel(deep, 'b'));
  });

  it('NDWI shallow water uses cyan (high green + blue vs red)', () => {
    const hex = siSampleRampColorAt(SI_NDWI_CLASSIFICATION_STOPS, 0.2);
    expect(rgbChannel(hex, 'b')).toBeGreaterThan(rgbChannel(hex, 'r'));
    expect(rgbChannel(hex, 'g')).toBeGreaterThan(rgbChannel(hex, 'r'));
  });
});
