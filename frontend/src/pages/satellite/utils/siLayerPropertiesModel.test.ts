import { describe, expect, it } from 'vitest';
import {
  buildSiLayerPropertiesSections,
  formatSiLayerExtentBounds,
  resolveSiLayerCrs,
} from './siLayerPropertiesModel';

describe('siLayerPropertiesModel', () => {
  it('formats extent bounds', () => {
    expect(formatSiLayerExtentBounds([44.1, 24.0, 46.9, 26.5])).toContain('W 44.1000°');
  });

  it('resolves CRS from import metadata', () => {
    expect(
      resolveSiLayerCrs({
        id: '1',
        name: 'Test',
        visible: true,
        importMetadata: { crs: 'EPSG:32639' },
      }),
    ).toBe('EPSG:32639');
  });

  it('builds overview, spatial, and settings sections', () => {
    const sections = buildSiLayerPropertiesSections({
      id: 'l1',
      name: 'Parcels',
      visible: true,
      source: 'arcgis',
      sourceUrl: 'https://example.com/FeatureServer/0',
      geojson: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [46, 25] }, properties: {} }],
      },
      extentBounds: [45, 24, 47, 26],
      mapOpacity: 0.8,
      symbology: { style: 'unique', field: 'TYPE', userConfigured: true },
      labels: { enabled: true, field: 'NAME' },
      loadStatus: 'loaded',
    });
    expect(sections.map(s => s.title)).toEqual(['Layer details', 'Spatial', 'Current settings']);
    const flat = sections.flatMap(s => s.rows);
    expect(flat.some(r => r.label === 'Feature count' && r.value === '1')).toBe(true);
    expect(flat.some(r => r.label === 'Symbology' && r.value.includes('Unique values'))).toBe(true);
    expect(flat.some(r => r.label === 'Map opacity' && r.value === '80%')).toBe(true);
  });
});
