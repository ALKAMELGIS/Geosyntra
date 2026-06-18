import { describe, expect, it } from 'vitest';
import {
  buildGeoAiLayerRegistry,
  tryGeoAiLayerBrowseCommand,
  tryGeoAiLayerIntelCommand,
} from './geoAiLayerIntelligence';

describe('geoAiLayerIntelligence', () => {
  const vectorLayer = {
    id: 'agro-1',
    name: 'Agro_Structures',
    visible: true,
    source: 'upload' as const,
    geojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { Farm_Code: 'MH101', Structure_Name: 'Nethouse A', Area_ha: 1.2 },
          geometry: { type: 'Point', coordinates: [-85.5776, 39.6449] },
        },
        {
          type: 'Feature',
          properties: { Farm_Code: 'MH102', Structure_Name: 'Nethouse B', Area_ha: 0.8 },
          geometry: { type: 'Point', coordinates: [-85.58, 39.645] },
        },
      ],
    },
  };

  it('builds registry with vector and wms entries', () => {
    const reg = buildGeoAiLayerRegistry(
      [vectorLayer],
      [{ name: 'NDVI', title: 'NDVI Index' }],
      'NDVI',
    );
    expect(reg).toHaveLength(2);
    expect(reg[0]?.kind).toBe('vector');
    expect(reg[0]?.featureCount).toBe(2);
    expect(reg[1]?.kind).toBe('wms');
  });

  it('finds MH101 on map from layer browse command', () => {
    const reg = buildGeoAiLayerRegistry([vectorLayer]);
    const res = tryGeoAiLayerBrowseCommand('Show me on map from Agro_Structures layer MH101', reg);
    expect(res?.handled).toBe(true);
    expect(res?.mapFirstSync?.selections).toHaveLength(1);
    expect(res?.mapFirstSync?.selections[0]?.layerId).toBe('agro-1');
  });

  it('lists loaded layers', () => {
    const reg = buildGeoAiLayerRegistry([vectorLayer]);
    const res = tryGeoAiLayerIntelCommand('list all layers', reg);
    expect(res?.handled).toBe(true);
    expect(res?.reply).toContain('Agro_Structures');
  });

  it('reports feature count for a layer', () => {
    const reg = buildGeoAiLayerRegistry([vectorLayer]);
    const res = tryGeoAiLayerIntelCommand('how many features in Agro_Structures', reg);
    expect(res?.handled).toBe(true);
    expect(res?.reply).toContain('2');
  });
});
