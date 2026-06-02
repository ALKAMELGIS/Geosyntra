import { describe, expect, it } from 'vitest';
import {
  ensureSiMapboxStyleGlyphs,
  resolveSiMapboxGlyphFontStack,
  siMap2DLabelPaint,
  siMap3DLabelPaint,
  SI_MAPBOX_GLYPH_FONT_STACK,
  SI_MAPBOX_STYLE_GLYPHS,
  siMapboxStyleWithGlyphs,
} from './siMap3DLabels';
import { buildSiContourLabelFilter, SI_DEFAULT_TERRAIN_SETTINGS } from './siMapProjectionTerrain';

describe('siMapboxStyleWithGlyphs', () => {
  it('injects Mapbox glyph endpoint when missing', () => {
    const style = siMapboxStyleWithGlyphs({ version: 8, sources: {}, layers: [] });
    expect(style.glyphs).toBe(SI_MAPBOX_STYLE_GLYPHS);
  });

  it('preserves existing glyphs', () => {
    const custom = 'https://example.com/{fontstack}/{range}.pbf';
    expect(siMapboxStyleWithGlyphs({ version: 8, glyphs: custom }).glyphs).toBe(custom);
  });
});

describe('ensureSiMapboxStyleGlyphs', () => {
  it('patches live style sheet when glyphs are missing', () => {
    const sheet: Record<string, unknown> = {};
    const map = {
      getStyle: () => sheet,
      triggerRepaint: () => {},
      style: { stylesheet: sheet },
    };
    expect(ensureSiMapboxStyleGlyphs(map as never)).toBe(true);
    expect(sheet.glyphs).toBe(SI_MAPBOX_STYLE_GLYPHS);
  });
});

describe('buildSiContourLabelFilter', () => {
  it('labels every contour interval even when main lines are enabled', () => {
    const filter = buildSiContourLabelFilter({
      ...SI_DEFAULT_TERRAIN_SETTINGS,
      contourIntervalM: 20,
      contourMainLinesEnabled: true,
      contourMainLineEvery: 5,
    });
    expect(filter).toEqual([
      '==',
      ['%', ['round', ['/', ['to-number', ['get', 'ele']], 20]], 1],
      0,
    ]);
  });
});

describe('resolveSiMapboxGlyphFontStack', () => {
  it('falls back to default stack when map is missing', () => {
    expect(resolveSiMapboxGlyphFontStack(null)).toEqual([...SI_MAPBOX_GLYPH_FONT_STACK]);
  });

  it('uses fonts from an existing symbol layer on the style', () => {
    const map = {
      getStyle: () => ({
        layers: [
          { id: 'a', type: 'line' },
          {
            id: 'b',
            type: 'symbol',
            layout: { 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] },
          },
        ],
      }),
    };
    const stack = resolveSiMapboxGlyphFontStack(map as never);
    expect(stack[0]).toBe('Open Sans Bold');
    expect(stack).toContain('DIN Offc Pro Medium');
  });
});

describe('siMap2DLabelPaint', () => {
  it('omits 3D-only symbol paint props', () => {
    const paint = siMap2DLabelPaint('#fff');
    expect(paint['text-color']).toBe('#fff');
    expect(paint).not.toHaveProperty('symbol-z-offset');
  });

  it('keeps 3D z-offset on 3D paint', () => {
    expect(siMap3DLabelPaint('#fff')).toHaveProperty('symbol-z-offset', 1.5);
  });
});
