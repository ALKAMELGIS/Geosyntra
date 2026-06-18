import { describe, expect, it } from 'vitest';
import {
  isGraduatedSymbologyStyleResolved,
  resolveSymbologyEngineStyle,
  symbologyStyleArcGisLabel,
} from './siSymbologyStyleResolve';
import { getSymbologyCatalogForGeometry, filterSymbologyCatalogForField } from './siSymbologyStyleCatalog';

describe('siSymbologyStyleResolve', () => {
  it('maps ArcGIS display styles to engine primitives', () => {
    expect(resolveSymbologyEngineStyle('choropleth')).toBe('color');
    expect(resolveSymbologyEngineStyle('single_fill')).toBe('single');
    expect(resolveSymbologyEngineStyle('pie_chart')).toBe('unique');
    expect(resolveSymbologyEngineStyle('width_by_attribute')).toBe('size');
  });

  it('treats class_breaks as graduated', () => {
    expect(isGraduatedSymbologyStyleResolved('class_breaks')).toBe(true);
    expect(isGraduatedSymbologyStyleResolved('heatmap')).toBe(true);
  });

  it('provides ArcGIS labels', () => {
    expect(symbologyStyleArcGisLabel('unique')).toBe('Types (unique symbols)');
    expect(symbologyStyleArcGisLabel('donut_chart')).toBe('Donut chart');
  });
});

describe('siSymbologyStyleCatalog', () => {
  it('returns polygon styles in ArcGIS order', () => {
    const labels = getSymbologyCatalogForGeometry('polygon').map(e => e.label);
    expect(labels[0]).toBe('Single fill');
    expect(labels).toContain('Choropleth map');
    expect(labels).toContain('3D extrusion');
  });

  it('returns line styles including flow and dashed', () => {
    const labels = getSymbologyCatalogForGeometry('line').map(e => e.label);
    expect(labels).toContain('Flow lines');
    expect(labels).toContain('Dashed lines');
  });

  it('filters numeric-only styles for text fields', () => {
    const catalog = getSymbologyCatalogForGeometry('point');
    const filtered = filterSymbologyCatalogForField(catalog, 'text', true);
    expect(filtered.some(e => e.value === 'heatmap')).toBe(false);
    expect(filtered.some(e => e.value === 'unique')).toBe(true);
  });

  it('shows location-only without a field', () => {
    const catalog = getSymbologyCatalogForGeometry('point');
    const filtered = filterSymbologyCatalogForField(catalog, 'text', false);
    expect(filtered.some(e => e.value === 'location_only')).toBe(true);
    expect(filtered.some(e => e.value === 'unique')).toBe(false);
  });
});
