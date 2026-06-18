import { describe, expect, it } from 'vitest';
import { DEFAULT_SI_MAP_PRINT_SETTINGS, siMapPrintAspectRatio } from './siMapPrintTypes';

describe('siMapPrintTypes', () => {
  it('A4 landscape aspect is width/height', () => {
    const r = siMapPrintAspectRatio({ ...DEFAULT_SI_MAP_PRINT_SETTINGS, paper: 'A4', orientation: 'landscape' });
    expect(r).toBeCloseTo(297 / 210, 4);
  });

  it('A3 portrait aspect is width/height', () => {
    const r = siMapPrintAspectRatio({ ...DEFAULT_SI_MAP_PRINT_SETTINGS, paper: 'A3', orientation: 'portrait' });
    expect(r).toBeCloseTo(297 / 420, 4);
  });
});
