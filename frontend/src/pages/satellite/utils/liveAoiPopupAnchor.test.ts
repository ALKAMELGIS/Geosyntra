import { describe, expect, it } from 'vitest';
import { coverDisplayLabelsForLayer } from './liveAoiPopupLabels';
import { resolveLiveAoiPopupAnchor, resolveLiveAoiRowFromClick } from './liveAoiPopupAnchor';

describe('liveAoiPopupAnchor', () => {
  it('resolves row by rowId from click record', () => {
    const rows = [
      { id: 'a', feature: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} } },
      { id: 'b', feature: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} } },
    ];
    const row = resolveLiveAoiRowFromClick({ lng: 1, lat: 2, aoiKey: 'x', rowId: 'b' }, rows, 'a');
    expect(row?.id).toBe('b');
  });

  it('anchors popup at click even when aoiKey differs from chart feature', () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      properties: { label: 'Field' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
          ],
        ],
      },
    };
    const anchor = resolveLiveAoiPopupAnchor(feature, '{"different":true}', {
      lng: 1.25,
      lat: 0.75,
      aoiKey: '{"other":true}',
    });
    expect(anchor?.source).toBe('click');
    expect(anchor?.lng).toBe(1.25);
    expect(anchor?.lat).toBe(0.75);
  });

  it('uses cultivated labels for NDVI live popup', () => {
    const labels = coverDisplayLabelsForLayer('NDVI');
    expect(labels.shortPositive).toBe('Cultivated');
    expect(labels.shortNegative).toBe('Non-cultivated');
  });
});
