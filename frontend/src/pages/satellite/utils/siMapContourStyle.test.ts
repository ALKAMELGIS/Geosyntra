import { describe, expect, it } from 'vitest';
import {
  SI_CONTOUR_THEME_PRESETS,
  siContourThemePatch,
  normalizeContourLineColor,
} from './siMapProjectionTerrain';

describe('siMapContourStyle', () => {
  it('applies dark and light theme presets', () => {
    const dark = siContourThemePatch('dark');
    expect(dark.contourIntervalLineColor).toBe(SI_CONTOUR_THEME_PRESETS.dark.intervalColor);
    const light = siContourThemePatch('light');
    expect(light.contourMainLineColor).toBe(SI_CONTOUR_THEME_PRESETS.light.mainColor);
  });

  it('normalizes hex colors', () => {
    expect(normalizeContourLineColor('#abc', '#000000')).toBe('#aabbcc');
  });
});
