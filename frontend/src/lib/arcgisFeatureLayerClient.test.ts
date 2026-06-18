import { describe, expect, it } from 'vitest';
import { parseArcgisFeatureLayerRef, resolveArcgisFeatureLayerRef } from '../lib/arcgisFeatureLayerClient';

const LAYER_21 =
  'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/arcgis/rest/services/Agro_Structures/FeatureServer/21';

describe('parseArcgisFeatureLayerRef', () => {
  it('splits sublayer URL into FeatureServer root + layerId', () => {
    const ref = parseArcgisFeatureLayerRef(LAYER_21);
    expect(ref).toEqual({
      serviceBase: 'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/arcgis/rest/services/Agro_Structures/FeatureServer',
      layerId: 21,
    });
  });

  it('resolves stored root URL + arcgisLayerId', () => {
    const ref = resolveArcgisFeatureLayerRef({
      sourceUrl:
        'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/arcgis/rest/services/Agro_Structures/FeatureServer',
      arcgisLayerId: 21,
    });
    expect(ref?.layerId).toBe(21);
    expect(ref?.serviceBase).toContain('Agro_Structures/FeatureServer');
  });
});
