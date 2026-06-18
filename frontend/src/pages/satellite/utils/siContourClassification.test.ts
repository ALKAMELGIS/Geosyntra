import { describe, expect, it } from 'vitest';
import {
  buildSiContourClassifiedColorExpression,
  buildSiContourClassificationLegendItems,
  computeSiContourClassBreaks,
  normalizeSiContourSurfaceType,
} from './siContourClassification';
import type { SiContourClassificationSettings } from './siContourClassification';

const baseSettings = (): SiContourClassificationSettings => ({
  contourClassificationEnabled: true,
  contourSurfaceType: 'elevation',
  contourClassCount: 5,
  contourClassMethod: 'equal_interval',
  contourColorRamp: 'viridis',
  contourClassColors: {},
  contourIntervalLineWidth: 0.75,
});

describe('siContourClassification', () => {
  it('normalizes surface type', () => {
    expect(normalizeSiContourSurfaceType('rainfall')).toBe('rainfall');
    expect(normalizeSiContourSurfaceType('bad')).toBe('elevation');
  });

  it('builds monotonic class breaks', () => {
    const breaks = computeSiContourClassBreaks(baseSettings());
    expect(breaks.length).toBe(6);
    for (let i = 1; i < breaks.length; i += 1) {
      expect(breaks[i]!).toBeGreaterThanOrEqual(breaks[i - 1]!);
    }
  });

  it('builds legend rows and mapbox step expression', () => {
    const settings = baseSettings();
    const items = buildSiContourClassificationLegendItems(settings);
    expect(items).toHaveLength(5);
    expect(items[0]?.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    const expr = buildSiContourClassifiedColorExpression(settings);
    expect(Array.isArray(expr)).toBe(true);
    expect((expr as unknown[])[0]).toBe('step');
  });
});
