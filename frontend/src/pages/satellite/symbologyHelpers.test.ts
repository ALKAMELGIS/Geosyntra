import { describe, expect, it } from 'vitest';
import {
  buildSymbologyContext,
  normalizeSymbologyForLayer,
  SI_SYMBOLOGY_DEFAULT_OTHER_COLOR,
  SI_SYMBOLOGY_OTHER_VALUE_KEY,
  symbologyOtherLegendLabel,
} from './symbologyHelpers';

const point = { type: 'Point' as const, coordinates: [0, 0] as [number, number] };

describe('unique symbology other bucket', () => {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: [
      { type: 'Feature' as const, properties: { build_id: '244' }, geometry: point },
      { type: 'Feature' as const, properties: { build_id: '244' }, geometry: point },
      { type: 'Feature' as const, properties: { build_id: '244' }, geometry: point },
      { type: 'Feature' as const, properties: { build_id: 'other-a' }, geometry: point },
      { type: 'Feature' as const, properties: { build_id: 'other-b' }, geometry: point },
    ],
  };

  it('exposes Other in categories when values exceed max classes', () => {
    const cfg = normalizeSymbologyForLayer(geojson, undefined, {
      style: 'unique',
      field: 'build_id',
      classes: 2,
      userConfigured: true,
    });
    const ctx = buildSymbologyContext(geojson, cfg, null);
    expect(ctx.categories).toContain('244');
    expect(ctx.categories).toContain(SI_SYMBOLOGY_OTHER_VALUE_KEY);
    expect(ctx.otherFeatureCount).toBe(1);
    expect(ctx.categoryColors[SI_SYMBOLOGY_OTHER_VALUE_KEY]).toBe(ctx.otherColor);
    expect(ctx.otherColor).toBe(SI_SYMBOLOGY_DEFAULT_OTHER_COLOR);
  });

  it('uses persisted Other color from categoryColors', () => {
    const cfg = normalizeSymbologyForLayer(geojson, undefined, {
      style: 'unique',
      field: 'build_id',
      classes: 2,
      userConfigured: true,
    });
    const ctx = buildSymbologyContext(
      geojson,
      { ...cfg, categoryColors: { [SI_SYMBOLOGY_OTHER_VALUE_KEY]: '#ff00ff' } },
      null,
    );
    expect(ctx.otherColor).toBe('#ff00ff');
    expect(ctx.categoryColors[SI_SYMBOLOGY_OTHER_VALUE_KEY]).toBe('#ff00ff');
  });

  it('formats Other legend label with feature count', () => {
    expect(symbologyOtherLegendLabel(3842)).toMatch(/Other \(3,842 features\)/);
  });
});
