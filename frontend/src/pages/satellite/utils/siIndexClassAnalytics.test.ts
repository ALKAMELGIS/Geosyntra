import { describe, expect, it } from 'vitest';
import {
  buildIndexClassSegments,
  computeIndexClassAnalytics,
  coverLabelsForLayer,
  isPositiveCoverPixel,
} from './siIndexClassAnalytics';

describe('siIndexClassAnalytics', () => {
  it('builds thinned NDVI legend segments', () => {
    const segs = buildIndexClassSegments('NDVI', 5);
    expect(segs.length).toBeGreaterThanOrEqual(5);
    expect(segs.length).toBeLessThanOrEqual(6);
    expect(segs[0]!.min).toBeLessThan(segs[segs.length - 1]!.max);
  });

  it('class area shares sum to total AOI area', () => {
    const values = [
      -0.2, 0.05, 0.15, 0.35, 0.55, 0.72, 0.05, 0.2, 0.45, 0.8,
      0.1, 0.3, 0.5, 0.65, 0.9,
    ];
    const totalM2 = 15000;
    const a = computeIndexClassAnalytics({
      layerId: 'NDVI',
      values,
      totalAreaM2: totalM2,
      analysisDateIso: '2026-05-31',
      legendBandCount: 5,
    });
    expect(a).not.toBeNull();
    const sumM2 = a!.classes.reduce((s, c) => s + c.areaM2, 0);
    expect(sumM2).toBeCloseTo(totalM2, 0);
    const sumPct = a!.classes.reduce((s, c) => s + c.pct, 0);
    expect(sumPct).toBeCloseTo(100, 5);
  });

  it('NDVI cultivated threshold uses > 0.20', () => {
    expect(isPositiveCoverPixel('NDVI', 0.2)).toBe(false);
    expect(isPositiveCoverPixel('NDVI', 0.2001)).toBe(true);
    const labels = coverLabelsForLayer('NDVI');
    expect(labels.positive).toBe('Vegetated');
  });

  it('NDWI uses water-oriented cover labels', () => {
    const labels = coverLabelsForLayer('NDWI');
    expect(labels.positive).toContain('Water');
    expect(isPositiveCoverPixel('NDWI', 0.14)).toBe(false);
    expect(isPositiveCoverPixel('NDWI', 0.2)).toBe(true);
  });
});
