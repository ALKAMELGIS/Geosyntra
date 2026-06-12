import { describe, expect, it } from 'vitest';
import {
  SI_LAYER_LIVE_COMPOSITE_CATALOG,
  buildLayerLiveIndexSelectGroups,
  getLayerLiveCompositeDef,
  isLayerLiveCompositeLayerId,
  resolveLayerLiveAbbr,
} from './siLayerLiveCompositeCatalog';
import { buildAgroCompositeEvalscript } from './siLayerLiveCompositeEvalscript';

describe('SI_LAYER_LIVE_COMPOSITE_CATALOG', () => {
  it('defines 20 base and 20 delta agro indices', () => {
    const base = SI_LAYER_LIVE_COMPOSITE_CATALOG.filter(d => !d.isDelta);
    const delta = SI_LAYER_LIVE_COMPOSITE_CATALOG.filter(d => d.isDelta);
    expect(base.length).toBe(20);
    expect(delta.length).toBe(20);
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
      if (def.isDelta) {
        expect(script).toContain('mosaicking');
        expect(getLayerLiveCompositeDef(def.id)?.isDelta).toBe(true);
      }
    }
  });

  it('resolves short abbreviations for long Sentinel API layer names', () => {
    expect(resolveLayerLiveAbbr('NDVI', 'NDVI').abbr).toBe('NDVI');
    expect(resolveLayerLiveAbbr('2_FALSE_COLOR', 'False color').abbr).toBe('FC');
    expect(resolveLayerLiveAbbr('EW-SH-HH-DECIBEL-GAMMA0-ORTHORECTIFIED', 'HH').abbr).toBe('HH');
    expect(resolveLayerLiveAbbr('2_TONEMAPPED_NATURAL_COLOR', 'Highlight Optimized Natural Color').abbr).toBe(
      'HONC',
    );
  });

  it('groups composite options by emoji section in catalog order', () => {
    const composite = SI_LAYER_LIVE_COMPOSITE_CATALOG.map(d => ({
      id: d.id,
      label: d.title,
      sciCode: d.sciCode,
      groupKey: d.groupKey,
      groupLabel: d.groupLabel,
      groupOrder: d.groupOrder,
      layerOrder: d.layerOrder,
    }));
    const groups = buildLayerLiveIndexSelectGroups([{ id: 'NDVI', label: 'NDVI' }], composite);
    expect(groups[0]?.label).toBe('Sentinel (API)');
    expect(groups[1]?.label).toBe('🌱 Vegetation Health');
    expect(groups[1]?.options.map(o => o.abbr)).toEqual(['VHS', 'VDI', 'CVI', 'CSI', 'WST']);
    expect(groups[0]?.options[0]?.abbr).toBe('NDVI');
    expect(groups[0]?.options[0]?.title).toContain('NDVI');
    expect(groups.some(g => g.label === '⚠️ Risk & Composite Change Detection')).toBe(true);
  });
});
