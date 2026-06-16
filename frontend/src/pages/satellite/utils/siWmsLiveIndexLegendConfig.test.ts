import { describe, expect, it } from 'vitest';
import { SI_NDVI_CLASSIFICATION_STOPS } from '../../../lib/siWmsIndexClassificationRamp';
import {
  siWmsIndexLegendHint,
  siWmsIndexLegendInterpretation,
  siWmsIndexLegendScaleFromStops,
} from './siWmsLiveIndexLegendConfig';

describe('siWmsLiveIndexLegendConfig', () => {
  it('builds scale from stops', () => {
    const scale = siWmsIndexLegendScaleFromStops(SI_NDVI_CLASSIFICATION_STOPS);
    expect(scale).not.toBeNull();
    expect(scale!.min).toBeLessThan(scale!.max);
  });

  it('uses profile-specific NDVI interpretation', () => {
    const interp = siWmsIndexLegendInterpretation('ndvi', SI_NDVI_CLASSIFICATION_STOPS);
    expect(interp.low).toMatch(/Water|dry soil/i);
    expect(interp.high).toMatch(/Dense vegetation/i);
  });

  it('hints differ for live vs scientific NDVI', () => {
    const live = siWmsIndexLegendHint({ profile: 'ndvi', classCount: 10, customSymbology: false, mode: 'live' });
    const sci = siWmsIndexLegendHint({ profile: 'ndvi', classCount: 10, customSymbology: false, mode: 'scientific' });
    expect(live).toMatch(/water.*blue/i);
    expect(sci).toMatch(/Adaptive NDVI/i);
  });
});
