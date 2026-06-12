import { describe, expect, it, vi } from 'vitest';
import {
  SI_GLOBE_ZOOM_MAX,
  SI_GLOBE_ZOOM_MIN,
  siMapGlobeZoomByDelta,
  siMapGlViewStateIsControlled,
} from './siMapGlobeZoom';

describe('siMapGlobeZoom', () => {
  it('applies zoom-only easeTo without around/pan', () => {
    const easeTo = vi.fn();
    const map = {
      getZoom: () => 10,
      easeTo,
    };
    const z = siMapGlobeZoomByDelta(map as never, 1);
    expect(z).toBe(11);
    expect(easeTo).toHaveBeenCalledWith({
      zoom: 11,
      duration: 280,
      essential: true,
    });
  });

  it('clamps zoom range', () => {
    const easeTo = vi.fn();
    const map = {
      getZoom: () => SI_GLOBE_ZOOM_MAX,
      easeTo,
    };
    siMapGlobeZoomByDelta(map as never, 5);
    expect(easeTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: SI_GLOBE_ZOOM_MAX }));
    map.getZoom = () => SI_GLOBE_ZOOM_MIN;
    siMapGlobeZoomByDelta(map as never, -5);
    expect(easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: SI_GLOBE_ZOOM_MIN }));
  });

  it('siMapGlViewStateIsControlled releases camera on globe and during stable 3D elevation', () => {
    expect(siMapGlViewStateIsControlled(false, false, false, true)).toBe(false);
    expect(siMapGlViewStateIsControlled(false, false, false, false)).toBe(true);
    expect(siMapGlViewStateIsControlled(true, true, false)).toBe(true);
    expect(siMapGlViewStateIsControlled(true, false, false)).toBe(false);
    expect(siMapGlViewStateIsControlled(true, false, true)).toBe(true);
  });
});
