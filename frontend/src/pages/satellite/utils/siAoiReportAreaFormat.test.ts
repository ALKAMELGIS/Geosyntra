import { describe, expect, it } from 'vitest';
import {
  applyAreaHaToPercentages,
  formatAoiAreaHaAndSqm,
  formatSharePctWithHa,
  haFromSharePct,
} from './siAoiReportAreaFormat';

describe('siAoiReportAreaFormat', () => {
  it('formats AOI area as ha and m²', () => {
    expect(formatAoiAreaHaAndSqm(0.826)).toBe('82.60 ha (826,000 m²)');
  });

  it('converts share pct to hectares', () => {
    expect(haFromSharePct(52.9, 0.826)).toBeCloseTo(43.6954, 3);
    expect(formatSharePctWithHa(52.9, 0.826)).toBe('52.9% (43.70 ha)');
  });

  it('annotates bare percentages in prose', () => {
    const raw = 'Healthy 82.4% with 5.9% in stress.';
    const out = applyAreaHaToPercentages(raw, 0.826);
    expect(out).toContain('82.4% (68.06 ha)');
    expect(out).toContain('5.9% (4.87 ha)');
  });

  it('does not duplicate hectares when already annotated', () => {
    const raw = '52.9% (43.70 ha) healthy and 38.2% (31.55 ha) bare soil.';
    const out = applyAreaHaToPercentages(raw, 0.826);
    expect(out).toBe(raw);
    expect((out.match(/43\.70 ha/g) ?? []).length).toBe(1);
  });

  it('dedupes triple hectare repeats', () => {
    const raw = '52.9% (36.28 ha) (36.28 ha) (36.28 ha) healthy.';
    const out = applyAreaHaToPercentages(raw, 0.826);
    expect(out).toBe('52.9% (36.28 ha) healthy.');
  });
});
