import { describe, expect, it } from 'vitest';
import { siRampLegendSegments } from '../../../lib/siWmsIndexClassificationRamp';
import { siWmsAutoSpectralStops, siWmsLegendRowsFromStops } from './siWmsSpectralClassification';

describe('legend ramp colors', () => {
  it('legend row colors match ramp segment colors from the same stops', () => {
    const stops = siWmsAutoSpectralStops('NDVI');
    expect(stops).not.toBeNull();
    const rows = siWmsLegendRowsFromStops(stops);
    const segments = siRampLegendSegments(stops!);
    expect(rows.length).toBe(segments.length);
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i]!.color.toLowerCase()).toBe(segments[i]!.color.toLowerCase());
    }
  });
});
