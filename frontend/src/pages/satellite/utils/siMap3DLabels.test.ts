import { describe, expect, it } from 'vitest';
import {
  arcgisLabelFieldFromLabelingInfo,
  arcgisScaleToMapboxZoom,
  inferSiMapFeatureLabelField,
  siMap3DLineLabelLayout,
  siMap3DPointLabelLayout,
} from './siMap3DLabels';

describe('siMap3DLabels', () => {
  it('parses ArcGIS labelExpressionInfo field', () => {
    const field = arcgisLabelFieldFromLabelingInfo([
      { labelExpressionInfo: { expression: '$feature.NAME' } },
    ]);
    expect(field).toBe('NAME');
  });

  it('infers NAME from geojson properties', () => {
    const field = inferSiMapFeatureLabelField(
      [],
      null,
      { features: [{ properties: { NAME: 'Site A' } }] },
    );
    expect(field).toBe('NAME');
  });

  it('builds 3D point labels with elevate + viewport billboard', () => {
    const layout = siMap3DPointLabelLayout({ textField: ['get', 'name'], baseSizePx: 12 });
    expect(layout['symbol-z-elevate']).toBe(true);
    expect(layout['text-pitch-alignment']).toBe('viewport');
    expect(layout['text-ignore-placement']).toBe(true);
  });

  it('builds line labels that stay visible when pitched', () => {
    const layout = siMap3DLineLabelLayout({ textField: ['get', 'ele'], baseSizePx: 11 });
    expect(layout['symbol-placement']).toBe('line');
    expect(layout['text-pitch-alignment']).toBe('viewport');
    expect(layout['text-allow-overlap']).toBe(true);
  });

  it('converts ArcGIS scale to mapbox zoom', () => {
    const z = arcgisScaleToMapboxZoom(18_055);
    expect(z).toBeGreaterThan(10);
    expect(z).toBeLessThan(14);
  });
});
