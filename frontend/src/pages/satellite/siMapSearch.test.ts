import { describe, expect, it } from 'vitest';
import { parseLatLngQuery, findMatchingLayerFeatures, mergeMapSearchHits } from './siMapSearch';

describe('parseLatLngQuery', () => {
  it('parses lat,lng', () => {
    expect(parseLatLngQuery('25.2048, 55.2708')).toEqual({ lat: 25.2048, lng: 55.2708 });
  });

  it('parses lng,lat when first value is longitude', () => {
    expect(parseLatLngQuery('55.27, 25.20')).toEqual({ lat: 25.2, lng: 55.27 });
  });

  it('returns null for place names', () => {
    expect(parseLatLngQuery('Dubai')).toBeNull();
  });
});

describe('findMatchingLayerFeatures', () => {
  const customLayers = [
    {
      id: 'agro-1',
      name: 'Agro_Structures',
      visible: true,
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [55.1, 25.2] },
            properties: { Farm_Code: 'MH105', Name: 'Plot MH105' },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [55.2, 25.3] },
            properties: { Farm_Code: 'MH106', Name: 'Plot MH106' },
          },
        ],
      },
    },
  ];

  it('finds features by attribute code', () => {
    const hits = findMatchingLayerFeatures(customLayers, 'MH105');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toBe('Plot MH105');
    expect(hits[0]?.layerName).toBe('Agro_Structures');
  });

  it('ranks feature hits before places in merge', () => {
    const featureHits = findMatchingLayerFeatures(customLayers, 'MH105');
    const merged = mergeMapSearchHits(featureHits, [], [
      { kind: 'place', id: 'p1', title: 'MH105 City', subtitle: 'Place', feature: {} },
    ]);
    expect(merged[0]?.kind).toBe('feature');
  });
});
