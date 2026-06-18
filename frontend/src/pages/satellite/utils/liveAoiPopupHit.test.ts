import { describe, expect, it } from 'vitest';
import { hitTestLiveAoiAtClick } from './liveAoiPopupHit';

const square: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
};

describe('hitTestLiveAoiAtClick', () => {
  it('hits drawn AOI polygon', () => {
    const hit = hitTestLiveAoiAtClick(0.5, 0.5, {
      multiRows: [],
      drawnFeature: { type: 'Feature', properties: {}, geometry: square },
      fieldRows: [],
    });
    expect(hit?.rowId).toBe('__drawn');
    expect(hit?.label).toBeTruthy();
  });

  it('hits workspace AOI row', () => {
    const feature: GeoJSON.Feature = { type: 'Feature', properties: {}, geometry: square };
    const hit = hitTestLiveAoiAtClick(0.5, 0.5, {
      multiRows: [{ id: 'f1', name: 'Field 1', feature }],
      drawnFeature: null,
      fieldRows: [],
    });
    expect(hit?.rowId).toBe('f1');
  });

  it('returns null outside polygons', () => {
    const hit = hitTestLiveAoiAtClick(5, 5, {
      multiRows: [],
      drawnFeature: { type: 'Feature', properties: {}, geometry: square },
      fieldRows: [],
    });
    expect(hit).toBeNull();
  });
});
