import { describe, expect, it } from 'vitest';
import {
  SI_LAYER_LIVE_COMPOSITE_CATALOG,
  buildLayerLiveIndexSelectGroups,
  filterLayerLiveIndexSelectGroupsForMapCanvas,
  getLayerLiveCompositeDef,
  isLayerLiveCompositeLayerId,
  isLayerLiveCoreIndex,
  resolveLayerLiveAbbr,
  resolveLayerLiveScientificName,
  resolveLayerLiveVegetationHealthAccentColor,
  LAYER_LIVE_VEGETATION_HEALTH_ACCENT_COLORS,
} from './siLayerLiveCompositeCatalog';
import { buildAgroCompositeEvalscript, getAgroCompositeDefaultStops, SI_CCI_CLASSIFICATION_STOPS } from './siLayerLiveCompositeEvalscript';

describe('SI_LAYER_LIVE_COMPOSITE_CATALOG', () => {
  it('defines 19 agro composite indices (no delta / change-detection layers)', () => {
    expect(SI_LAYER_LIVE_COMPOSITE_CATALOG.length).toBe(19);
    expect(SI_LAYER_LIVE_COMPOSITE_CATALOG.every(d => !d.isDelta)).toBe(true);
  });

  it('keeps vegetation health base layers in catalog order', () => {
    const veg = SI_LAYER_LIVE_COMPOSITE_CATALOG.filter(d => d.groupKey === 'veg' && !d.isDelta);
    expect(veg.map(d => d.sciCode)).toEqual(['VHS', 'VDI', 'CVI', 'CSI', 'WST']);
  });

  it('builds evalscripts for every catalog layer', () => {
    for (const def of SI_LAYER_LIVE_COMPOSITE_CATALOG) {
      expect(isLayerLiveCompositeLayerId(def.id)).toBe(true);
      const script = buildAgroCompositeEvalscript(def.id, null, null);
      expect(script.length).toBeGreaterThan(40);
      expect(script).toContain('//VERSION=3');
      expect(script).toContain('__classifiedRampRgb');
      expect(script).not.toContain('__rampRgb');
    }
  });

  it('CHS evalscript uses agricultural risk classification stops', () => {
    const script = buildAgroCompositeEvalscript('CHS', null, null);
    expect(script).toContain('__classifiedRampRgb');
    expect(script).toContain('1332013');
    expect(script).toContain('8330525');
  });

  it('CCI evalscript uses normalized composite formula and 20-class ramp', () => {
    const script = buildAgroCompositeEvalscript('CCI', null, null);
    expect(script).toContain('__normIdx');
    expect(script).toContain('0.3 *');
    expect(script).toContain('- 0.2 *');
    expect(getLayerLiveCompositeDef('CCI')?.formula).toBe('cci');
    const stops = getAgroCompositeDefaultStops(getLayerLiveCompositeDef('CCI')!);
    expect(stops).toEqual(SI_CCI_CLASSIFICATION_STOPS);
    expect(stops.length).toBe(21);
  });

  it('resolves short abbreviations for long Sentinel API layer names', () => {
    expect(resolveLayerLiveAbbr('NDVI', 'NDVI').abbr).toBe('NDVI');
    expect(resolveLayerLiveAbbr('2_FALSE_COLOR', 'False color').abbr).toBe('FC');
    expect(resolveLayerLiveAbbr('EW-SH-HH-DECIBEL-GAMMA0-ORTHORECTIFIED', 'HH').abbr).toBe('HH');
    expect(resolveLayerLiveAbbr('2_TONEMAPPED_NATURAL_COLOR', 'Highlight Optimized Natural Color').abbr).toBe(
      'HONC',
    );
  });

  it('groups Core indices first, then composites, then other Sentinel API layers', () => {
    const composite = SI_LAYER_LIVE_COMPOSITE_CATALOG.map(d => ({
      id: d.id,
      label: d.title,
      sciCode: d.sciCode,
      groupKey: d.groupKey,
      groupLabel: d.groupLabel,
      groupOrder: d.groupOrder,
      layerOrder: d.layerOrder,
    }));
    const groups = buildLayerLiveIndexSelectGroups(
      [
        { id: 'NDVI', label: 'NDVI' },
        { id: 'NDWI', label: 'NDWI' },
        { id: '2_FALSE_COLOR', label: 'False color' },
        { id: '2_FALSE_COLOR_DUP', label: 'False color' },
      ],
      composite,
    );
    expect(groups[0]?.label).toBe('📊 Core indices');
    expect(groups[0]?.options.map(o => o.abbr)).toEqual(['NDVI', 'NDWI']);
    expect(groups[1]?.label).toBe('🌱 Vegetation Health');
    expect(groups[1]?.options.map(o => o.abbr)).toEqual(['VHS', 'VDI', 'CVI', 'CSI', 'WST']);
    const apiGroup = groups.find(g => g.key === 'sentinel_api');
    expect(apiGroup?.label).toBe('🛰️ Sentinel (API)');
    expect(apiGroup?.options).toHaveLength(1);
    expect(apiGroup?.options[0]?.abbr).toBe('FC');
    expect(groups.some(g => g.label === '⚠️ Risk & Composite')).toBe(true);
    expect(groups.some(g => g.label.includes('Change Detection'))).toBe(false);
  });

  it('detects core spectral indices by id and abbreviation', () => {
    expect(isLayerLiveCoreIndex('NDVI', 'NDVI')).toBe(true);
    expect(isLayerLiveCoreIndex('MOISTURE_INDEX_NDWI', 'Moisture Index (NDWI)')).toBe(true);
    expect(isLayerLiveCoreIndex('2_FALSE_COLOR', 'False color')).toBe(false);
  });

  it('resolves scientific names for core indices and composite layers', () => {
    expect(resolveLayerLiveScientificName('NDVI', 'NDVI')).toBe(
      'Normalized Difference Vegetation Index',
    );
    expect(resolveLayerLiveScientificName('VHS', 'Vegetation Health Score')).toBe(
      'Vegetation Health Score',
    );
    expect(resolveLayerLiveScientificName('FC', 'False color')).toBe('False color');
  });

  it('attaches sciName to grouped picker options', () => {
    const groups = buildLayerLiveIndexSelectGroups([{ id: 'NDVI', label: 'NDVI' }], []);
    const ndvi = groups[0]?.options.find(o => o.abbr === 'NDVI');
    expect(ndvi?.sciName).toBe('Normalized Difference Vegetation Index');
  });

  it('assigns unique scientific accent colors to Vegetation Health indices', () => {
    expect(LAYER_LIVE_VEGETATION_HEALTH_ACCENT_COLORS).toEqual({
      VHS: '#0B3D2E',
      VDI: '#1F7A4C',
      CVI: '#FFD400',
      CSI: '#FF4D4D',
      WST: '#2D6BFF',
    });
    expect(resolveLayerLiveVegetationHealthAccentColor('vhs')).toBe('#0B3D2E');
    expect(resolveLayerLiveVegetationHealthAccentColor('NDVI')).toBeUndefined();

    const veg = buildLayerLiveIndexSelectGroups(
      [],
      SI_LAYER_LIVE_COMPOSITE_CATALOG.filter(d => d.groupKey === 'veg' && !d.isDelta).map(d => ({
        id: d.id,
        label: d.title,
        sciCode: d.sciCode,
        groupKey: d.groupKey,
        groupLabel: d.groupLabel,
        groupOrder: d.groupOrder,
        layerOrder: d.layerOrder,
      })),
    )[0];
    expect(veg?.options.map(o => o.accentColor)).toEqual([
      '#0B3D2E',
      '#1F7A4C',
      '#FFD400',
      '#FF4D4D',
      '#2D6BFF',
    ]);
  });

  it('filterLayerLiveIndexSelectGroupsForMapCanvas drops unsupported option ids', () => {
    const groups = buildLayerLiveIndexSelectGroups(
      [
        { id: 'NDVI', label: 'NDVI' },
        { id: '2_FALSE_COLOR', label: 'False color' },
      ],
      [],
    );
    const filtered = filterLayerLiveIndexSelectGroupsForMapCanvas(groups, new Set(['NDVI']));
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.options.map(o => o.id)).toEqual(['NDVI']);
  });
});
