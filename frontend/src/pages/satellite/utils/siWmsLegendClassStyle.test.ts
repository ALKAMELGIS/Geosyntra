import { describe, expect, it } from 'vitest';
import { siWmsLegendSwatchColor } from './siWmsLegendClassStyle';

describe('siWmsLegendSwatchColor', () => {
  it('uses stress orange–yellow for sparse NDVI classes', () => {
    expect(siWmsLegendSwatchColor('ndvi', 'Very sparse', '#000')).toBe('#c2410c');
    expect(siWmsLegendSwatchColor('ndvi', 'Sparse / stressed', '#000')).toBe('#ea580c');
    expect(siWmsLegendSwatchColor('ndvi', 'Low vigor', '#000')).toBe('#eab308');
  });

  it('uses greens for healthy NDVI classes', () => {
    expect(siWmsLegendSwatchColor('ndvi', 'Healthy', '#000')).toBe('#22c55e');
    expect(siWmsLegendSwatchColor('ndvi', 'Dense', '#000')).toBe('#15803d');
  });

  it('uses water blue for NDWI water classes', () => {
    expect(siWmsLegendSwatchColor('ndwi', 'Open water (blue)', '#000')).toBe('#2563eb');
    expect(siWmsLegendSwatchColor('ndwi', 'Clear shallow water (teal)', '#000')).toBe('#06b6d4');
  });
});
