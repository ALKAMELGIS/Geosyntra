import { describe, expect, it } from 'vitest';
import { coverDisplayLabelsForLayer } from './liveAoiPopupLabels';
import { resolveLiveAoiRowFromClick } from './liveAoiPopupAnchor';

describe('liveAoiPopupAnchor', () => {
  it('resolves row by rowId from click record', () => {
    const rows = [
      { id: 'a', feature: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} } },
      { id: 'b', feature: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} } },
    ];
    const row = resolveLiveAoiRowFromClick({ lng: 1, lat: 2, aoiKey: 'x', rowId: 'b' }, rows, 'a');
    expect(row?.id).toBe('b');
  });

  it('uses cultivated labels for NDVI live popup', () => {
    const labels = coverDisplayLabelsForLayer('NDVI');
    expect(labels.shortPositive).toBe('Cultivated');
    expect(labels.shortNegative).toBe('Non-cultivated');
  });
});
