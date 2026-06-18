import { describe, expect, it } from 'vitest';
import {
  SI_NDVI_CLASSIFICATION_STOPS,
  SI_NDWI_CLASSIFICATION_STOPS,
  siWmsResampleRampToClassCount,
} from './siWmsIndexClassificationRamp';

describe('siWmsIndexClassificationRamp', () => {
  it('resamples scientific ramp to 11 stops (10 classes)', () => {
    const out = siWmsResampleRampToClassCount(SI_NDVI_CLASSIFICATION_STOPS, 11);
    expect(out.length).toBe(11);
    expect(out[0]![0]).toBe(SI_NDVI_CLASSIFICATION_STOPS[0]![0]);
    expect(out[out.length - 1]![0]).toBe(SI_NDVI_CLASSIFICATION_STOPS[SI_NDVI_CLASSIFICATION_STOPS.length - 1]![0]);
  });

  it('preserves NDWI anchor colors at domain ends', () => {
    const out = siWmsResampleRampToClassCount(SI_NDWI_CLASSIFICATION_STOPS, 11);
    expect(out[0]![1]).toBe(0x008000);
    expect(out[out.length - 1]![1]).toBe(0x0000cc);
  });
});
