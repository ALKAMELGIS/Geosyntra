import { describe, expect, it } from 'vitest';
import { buildSiMapPrintLegendItems } from './siMapPrintLegendItems';

describe('buildSiMapPrintLegendItems', () => {
  it('includes basemap, visible WMS ramp, and visible vector layers', () => {
    const items = buildSiMapPrintLegendItems({
      wmsItems: [{ label: '0.2 – 0.8', color: '#0f0' }],
      wmsVisible: true,
      basemapLabel: 'Satellite',
      layers: [
        { name: 'Fields', visible: true, fillColor: '#22c55e' },
        { name: 'Hidden', visible: false, fillColor: '#000' },
      ],
    });
    expect(items.some(i => i.label.includes('Basemap'))).toBe(true);
    expect(items.some(i => i.label.includes('0.2'))).toBe(true);
    expect(items.some(i => i.label === 'Fields')).toBe(true);
    expect(items.some(i => i.label === 'Hidden')).toBe(false);
  });
});
