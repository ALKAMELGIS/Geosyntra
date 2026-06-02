import { describe, expect, it } from 'vitest';
import {
  computeSiLayerLabelRevision,
  labelConfigFromLayer,
  layerLabelConfigFromDraft,
  normalizeSiLayerLabelsDraft,
} from './siLayerLabelsEngine';

const geo = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'A' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 1] }, properties: { name: 'B' } },
  ],
};

describe('siLayerLabelsEngine', () => {
  it('normalizes missing field to first geojson attribute', () => {
    const d = normalizeSiLayerLabelsDraft(geo, { enabled: true, field: 'missing', fontSize: 12, color: '#fff' });
    expect(d.field).toBe('name');
    expect(d.enabled).toBe(true);
  });

  it('revision changes when label settings change', () => {
    const a = computeSiLayerLabelRevision({ enabled: true, field: 'name', fontSize: 12, color: '#fff' });
    const b = computeSiLayerLabelRevision({ enabled: true, field: 'name', fontSize: 14, color: '#fff' });
    expect(a).not.toBe(b);
  });

  it('labelConfigFromLayer suggests arcgis field when not user configured', () => {
    const d = labelConfigFromLayer({
      geojson: geo,
      arcgisLayerDefinition: {
        fields: [{ name: 'name' }],
        drawingInfo: { labelingInfo: [{ field: 'name' }] },
      },
    });
    expect(d.field).toBe('name');
    expect(d.enabled).toBe(false);
  });

  it('layerLabelConfigFromDraft keeps enabled field without geojson re-validation', () => {
    const draft = normalizeSiLayerLabelsDraft(geo, {
      enabled: true,
      field: 'name',
      fontSize: 14,
      color: '#22c55e',
    });
    const saved = layerLabelConfigFromDraft(draft);
    expect(saved.enabled).toBe(true);
    expect(saved.field).toBe('name');
    expect(saved.userConfigured).toBe(true);
  });

  it('computeSiLayerLabelRevision respects persisted enabled labels', () => {
    const rev = computeSiLayerLabelRevision({
      enabled: true,
      field: 'height_fin',
      fontSize: 12,
      color: '#22c55e',
    });
    expect(rev.startsWith('lbl|1|')).toBe(true);
    expect(rev).toContain('height_fin');
  });
});
