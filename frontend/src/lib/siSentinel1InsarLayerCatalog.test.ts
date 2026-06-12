import { describe, expect, it } from 'vitest';
import { buildSentinel1SarEvalscript } from './siSentinel1SarEvalscript';
import {
  SI_SENTINEL1_GRD_WMS_TILE_LAYER_FALLBACK,
  SI_SENTINEL1_INSAR_LAYER_CATALOG,
  SENTINEL_1_GRD_COLLECTION_ID,
  getSentinel1InsarLayerDef,
  isSentinel1GrdCollection,
  isSentinel1InsarLayerId,
  isSentinel1NativeWmsLayerName,
  filterRedundantSentinel1HhHvWmsLayers,
  resolveSentinel1GrdWmsTileLayerName,
  resolveSentinel1NativeWmsTileLayerName,
  sentinelHubWmsUsesMaxCloudCover,
} from './siSentinel1InsarLayerCatalog';

describe('siSentinel1InsarLayerCatalog', () => {
  it('defines the full Sentinel-1 GRD InSAR / SAR layer set', () => {
    expect(SI_SENTINEL1_INSAR_LAYER_CATALOG.length).toBeGreaterThanOrEqual(57);
    expect(isSentinel1GrdCollection(SENTINEL_1_GRD_COLLECTION_ID)).toBe(true);
    expect(isSentinel1InsarLayerId('LOS_DISP')).toBe(true);
    expect(isSentinel1InsarLayerId('SAVI')).toBe(false);
  });

  it('has unique layer ids and flood indicators without duplicating existing layers', () => {
    const ids = SI_SENTINEL1_INSAR_LAYER_CATALOG.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('FDI');
    expect(ids).toContain('WDI');
    expect(ids).toContain('WCI');
    expect(ids).toContain('SFI');
    expect(ids).toContain('LDI');
    expect(ids).toContain('CDI');
    expect(ids).toContain('VV_DROP');
    expect(ids).toContain('VH_DROP');
    expect(ids).toContain('BCR_CHG');
    expect(ids).toContain('RVI_CHG');
    expect(ids).toContain('COH_DROP');
    expect(ids).toContain('PS_CHG');
    /* Existing indicators — single catalog entry each */
    expect(ids.filter(id => id === 'BSC')).toHaveLength(1);
    expect(ids.filter(id => id === 'NBI')).toHaveLength(1);
    expect(ids.filter(id => id === 'T_COH')).toHaveLength(1);
    expect(ids.filter(id => id === 'DS_CHANGE')).toHaveLength(1);
    /* No second BSC/NBI/T-COH/DS layer under flood groups */
    const floodIds = SI_SENTINEL1_INSAR_LAYER_CATALOG.filter(d =>
      d.groupKey.startsWith('flood_'),
    ).map(d => d.id);
    expect(floodIds).not.toContain('BSC');
    expect(floodIds).not.toContain('NBI');
    expect(floodIds).not.toContain('T_COH');
    expect(floodIds).not.toContain('DS_CHANGE');
  });

  it('builds evalscripts for every catalog layer', () => {
    for (const def of SI_SENTINEL1_INSAR_LAYER_CATALOG) {
      const script = buildSentinel1SarEvalscript(def.id, null, null);
      expect(script.length).toBeGreaterThan(40);
      expect(script).toContain('VV');
      expect(script).toContain('VH');
      if (def.temporal) expect(script).toContain('mosaicking');
    }
  });

  it('groups deformation and soil moisture layers', () => {
    const los = getSentinel1InsarLayerDef('LOS_DISP');
    const smi = getSentinel1InsarLayerDef('SMI');
    expect(los?.groupKey).toBe('deform');
    expect(smi?.groupKey).toBe('sm');
  });

  it('remaps HH-HV native WMS layers to VV-VH siblings for tile requests', () => {
    const wms = [
      { name: '9_SAR-URBAN-HH-HV' },
      { name: '9_SAR-URBAN-VV-VH' },
      { name: 'ENHANCED-VISUALIZATION-ORTHORECTIFIED-HH-HV' },
      { name: 'ENHANCED-VISUALIZATION-ORTHORECTIFIED-VV-VH' },
    ];
    expect(resolveSentinel1NativeWmsTileLayerName('9_SAR-URBAN-HH-HV', wms)).toBe('9_SAR-URBAN-VV-VH');
    expect(resolveSentinel1NativeWmsTileLayerName('9_SAR-URBAN-VV-VH', wms)).toBe('9_SAR-URBAN-VV-VH');
    expect(
      resolveSentinel1NativeWmsTileLayerName('ENHANCED-VISUALIZATION-ORTHORECTIFIED-HH-HV', wms),
    ).toBe('ENHANCED-VISUALIZATION-ORTHORECTIFIED-VV-VH');
    expect(filterRedundantSentinel1HhHvWmsLayers(wms).map(l => l.name)).toEqual([
      '9_SAR-URBAN-VV-VH',
      'ENHANCED-VISUALIZATION-ORTHORECTIFIED-VV-VH',
    ]);
  });

  it('resolves dual-pol VH WMS tile layer for evalscripts (not VV-only)', () => {
    const wms = [
      { name: 'IW-DV-VV-LINEAR-GAMMA0-ORTHORECTIFIED' },
      { name: 'IW-DV-VH-LINEAR-GAMMA0-ORTHORECTIFIED' },
      { name: '9_SAR-URBAN-VV-VH' },
    ];
    expect(resolveSentinel1GrdWmsTileLayerName(wms)).toBe('IW-DV-VH-LINEAR-GAMMA0-ORTHORECTIFIED');
    expect(isSentinel1NativeWmsLayerName('IW-DV-VH-LINEAR-GAMMA0-ORTHORECTIFIED')).toBe(true);
    expect(isSentinel1NativeWmsLayerName('8_RGB-RATIO-VV-VH')).toBe(true);
    expect(isSentinel1NativeWmsLayerName('ENHANCED-VISUALIZATION-ORTHORECTIFIED-VV-VH')).toBe(true);
    expect(isSentinel1NativeWmsLayerName('4_FALSE-COLOR-URBAN')).toBe(true);
    expect(isSentinel1NativeWmsLayerName('4_FALSE-COLOR-URBAN-L1C')).toBe(false);
    expect(sentinelHubWmsUsesMaxCloudCover('LOS_DISP', SI_SENTINEL1_GRD_WMS_TILE_LAYER_FALLBACK)).toBe(
      false,
    );
    expect(sentinelHubWmsUsesMaxCloudCover('NDVI', 'NDVI')).toBe(true);
  });
});
