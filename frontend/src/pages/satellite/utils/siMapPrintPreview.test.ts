import { describe, expect, it } from 'vitest';
import { DEFAULT_SI_MAP_PRINT_SETTINGS } from './siMapPrintTypes';
import {
  pickSiMapPrintCaptureSlice,
  pickSiMapPrintComposeSlice,
  siMapPrintCaptureSliceKey,
  siMapPrintComposeSliceKey,
} from './siMapPrintPreview';

describe('siMapPrintPreview', () => {
  it('orientation change does not change capture slice key', () => {
    const landscape = pickSiMapPrintCaptureSlice({
      ...DEFAULT_SI_MAP_PRINT_SETTINGS,
      orientation: 'landscape',
    });
    const portrait = pickSiMapPrintCaptureSlice({
      ...DEFAULT_SI_MAP_PRINT_SETTINGS,
      orientation: 'portrait',
    });
    expect(siMapPrintCaptureSliceKey(landscape)).toBe(siMapPrintCaptureSliceKey(portrait));
  });

  it('orientation change updates compose slice key', () => {
    const landscape = pickSiMapPrintComposeSlice({
      ...DEFAULT_SI_MAP_PRINT_SETTINGS,
      orientation: 'landscape',
    });
    const portrait = pickSiMapPrintComposeSlice({
      ...DEFAULT_SI_MAP_PRINT_SETTINGS,
      orientation: 'portrait',
    });
    expect(siMapPrintComposeSliceKey(landscape, 5, 3)).not.toBe(siMapPrintComposeSliceKey(portrait, 5, 3));
  });

  it('layer list toggle affects compose slice key', () => {
    const base = pickSiMapPrintComposeSlice(DEFAULT_SI_MAP_PRINT_SETTINGS);
    const off = pickSiMapPrintComposeSlice({ ...DEFAULT_SI_MAP_PRINT_SETTINGS, includeLayerList: false });
    expect(siMapPrintComposeSliceKey(base, 0, 2)).not.toBe(siMapPrintComposeSliceKey(off, 0, 2));
  });
});
