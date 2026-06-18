import { describe, expect, it } from 'vitest';
import {
  chartStatTickLabel,
  formatOlsRegressionLegend,
  formatScatterR2,
  formatStatDecimal,
  scatterAxisBounds,
  scatterPointRadiusForCount,
} from './siChartStatFormat';

describe('siChartStatFormat', () => {
  it('formats values with two fixed decimals', () => {
    expect(formatStatDecimal(0.2)).toBe('0.20');
    expect(formatStatDecimal(0.987)).toBe('0.99');
    expect(formatStatDecimal(1)).toBe('1.00');
    expect(formatStatDecimal(0.009)).toBe('0.01');
  });

  it('formats R² for scatter legend', () => {
    expect(formatScatterR2(0.009)).toBe('0.01');
  });

  it('formats chart axis ticks', () => {
    expect(chartStatTickLabel(-0.5)).toBe('-0.50');
    expect(chartStatTickLabel(0)).toBe('0.00');
  });

  it('builds OLS legend without scientific notation', () => {
    const label = formatOlsRegressionLegend({
      yLabel: 'NDVI',
      xLabel: 'SAR',
      slope: 0.007902,
      intercept: 0.29,
      r2: 0.009,
    });
    expect(label).toContain('NDVI = 0.01 × SAR');
    expect(label).toContain('R² = 0.01');
    expect(label).not.toMatch(/E[+-]/i);
  });

  it('zooms scatter axes to data cluster instead of full −1…1', () => {
    const b = scatterAxisBounds([-0.35, -0.28, -0.12, -0.1]);
    expect(b.min).toBeGreaterThan(-0.5);
    expect(b.max).toBeLessThan(0);
  });

  it('uses visible point radius for large n', () => {
    expect(scatterPointRadiusForCount(2168).radius).toBeGreaterThanOrEqual(3);
  });
});
