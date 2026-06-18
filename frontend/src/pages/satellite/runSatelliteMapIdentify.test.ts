import { describe, expect, it } from 'vitest';
import { findCustomLayerFeatureLink } from './runSatelliteMapIdentify';

describe('findCustomLayerFeatureLink', () => {
  const sanitize = (raw: Record<string, unknown>) => raw;

  it('matches by OBJECTID when full JSON differs', () => {
    const layer = {
      id: 'layer-1',
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { OBJECTID: 42, Name: 'Alpha', _extra: true },
            geometry: { type: 'Point', coordinates: [0, 0] },
          },
        ],
      },
    };
    const link = findCustomLayerFeatureLink(layer, { OBJECTID: 42, Name: 'Alpha' }, sanitize);
    expect(link).not.toBeNull();
    expect(link!.featureLinkKey).toBe('layer-1::OBJECTID:42');
    expect(link!.tableLink).toEqual({ type: 'feature', layerId: 'layer-1', featureKey: 'OBJECTID:42' });
  });

  it('matches by property subset when ids are absent', () => {
    const layer = {
      id: 'roads',
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { road_class: 'primary', length_m: 120 },
            geometry: { type: 'Point', coordinates: [1, 2] },
          },
        ],
      },
    };
    const link = findCustomLayerFeatureLink(layer, { road_class: 'primary', length_m: 120 }, sanitize);
    expect(link?.tableLink.featureKey).toBe('idx:0');
  });
});
