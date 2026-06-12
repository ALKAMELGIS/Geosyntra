import { describe, expect, it } from 'vitest';
import {
  SI_SYM_OUTLINE_WIDTH_REF_ZOOM,
  siMapOutlineWidthPreviewPx,
  siMapOutlineWidthZoomScale,
} from './siMapOutlineWidthZoom';

describe('siMapOutlineWidthZoom', () => {
  it('uses unit scale at reference zoom', () => {
    expect(siMapOutlineWidthZoomScale(SI_SYM_OUTLINE_WIDTH_REF_ZOOM)).toBeCloseTo(1, 5);
    expect(siMapOutlineWidthPreviewPx(2.55, SI_SYM_OUTLINE_WIDTH_REF_ZOOM)).toBeCloseTo(2.55, 2);
  });

  it('scales down when zoomed out and up when zoomed in', () => {
    expect(siMapOutlineWidthZoomScale(4)).toBeLessThan(1);
    expect(siMapOutlineWidthZoomScale(18)).toBeGreaterThan(1);
    expect(siMapOutlineWidthPreviewPx(2, 4)).toBeLessThan(2);
    expect(siMapOutlineWidthPreviewPx(2, 18)).toBeGreaterThan(2);
  });
});
