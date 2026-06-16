import { describe, expect, it } from 'vitest';
import { buildSiMapDynamicLegendEntries } from './siMapDynamicLegendRegistry';
import { siWmsResolveCanonicalStops } from './siWmsSpectralClassification';

describe('buildSiMapDynamicLegendEntries', () => {
  it('emits one independent WMS legend with data-driven stops', () => {
    const entries = buildSiMapDynamicLegendEntries({
      wmsLayerId: 'NDVI',
      wmsVisible: true,
      wmsLabel: 'NDVI',
      wmsContext: { imageryDateIso: '2026-05-12' },
      hasAoiGeometry: true,
      customLayers: [],
      cropHealthAlertsVisible: false,
      wmsAoiFiniteValues: [0.1, 0.2, 0.55, 0.8],
      resolveStops: siWmsResolveCanonicalStops,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('wms');
    if (entries[0]?.kind === 'wms') {
      expect(entries[0].layerKey).toBe('wms:NDVI');
      expect(entries[0].classifiedStops?.length).toBeGreaterThan(1);
      expect(entries[0].dataDrivenLabels).toBe(true);
    }
  });

  it('skips hidden vector layers and includes visible ones independently', () => {
    const entries = buildSiMapDynamicLegendEntries({
      wmsLayerId: '',
      wmsVisible: false,
      wmsLabel: '',
      wmsContext: { imageryDateIso: '2026-05-12' },
      hasAoiGeometry: false,
      cropHealthAlertsVisible: false,
      customLayers: [
        {
          id: 'a',
          name: 'AOI Field',
          visible: true,
          geojson: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { name: 'F1' },
                geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
              },
            ],
          },
        },
        { id: 'b', name: 'Hidden', visible: false, geojson: { type: 'FeatureCollection', features: [] } },
      ],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('vector');
    if (entries[0]?.kind === 'vector') {
      expect(entries[0].layerId).toBe('a');
      expect(entries[0].rows.length).toBeGreaterThan(0);
    }
  });

  it('includes crop health alerts legend only when that layer is active', () => {
    const off = buildSiMapDynamicLegendEntries({
      wmsLayerId: '',
      wmsVisible: false,
      wmsLabel: '',
      wmsContext: { imageryDateIso: '2026-05-12' },
      hasAoiGeometry: false,
      customLayers: [],
      cropHealthAlertsVisible: false,
    });
    expect(off.some(e => e.kind === 'alerts')).toBe(false);

    const on = buildSiMapDynamicLegendEntries({
      wmsLayerId: '',
      wmsVisible: false,
      wmsLabel: '',
      wmsContext: { imageryDateIso: '2026-05-12' },
      hasAoiGeometry: false,
      customLayers: [],
      cropHealthAlertsVisible: true,
    });
    const alerts = on.find(e => e.kind === 'alerts');
    expect(alerts?.kind).toBe('alerts');
    if (alerts?.kind === 'alerts') {
      expect(alerts.rows.length).toBe(4);
    }
  });
});
