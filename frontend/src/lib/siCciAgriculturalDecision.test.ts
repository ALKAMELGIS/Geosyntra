import { describe, expect, it } from 'vitest';
import {
  classifyCciValue,
  formatCciDecisionDisplay,
  formatCciValue,
  SI_CCI_AGRICULTURAL_TIERS,
} from './siCciAgriculturalDecision';

describe('siCciAgriculturalDecision', () => {
  it('classifies four agricultural decision tiers', () => {
    expect(classifyCciValue(0.75)?.tier).toBe('excellent');
    expect(classifyCciValue(0.45)?.tier).toBe('monitoring');
    expect(classifyCciValue(0.1)?.tier).toBe('warning');
    expect(classifyCciValue(-0.05)?.tier).toBe('risk');
  });

  it('formats decision display with status, CCI value, and decision', () => {
    const text = formatCciDecisionDisplay(0.72, 'ar');
    expect(text).toContain('جيد جدًا');
    expect(text).toContain('CCI 0.72');
    expect(text).toContain('لا يوجد تدخل');
  });

  it('exposes tier boundaries aligned to user thresholds', () => {
    expect(SI_CCI_AGRICULTURAL_TIERS[0]!.min).toBe(0.6);
    expect(SI_CCI_AGRICULTURAL_TIERS[1]!.min).toBe(0.2);
    expect(SI_CCI_AGRICULTURAL_TIERS[2]!.min).toBe(0.0);
    expect(SI_CCI_AGRICULTURAL_TIERS[3]!.max).toBe(0.0);
  });

  it('formats CCI numeric values to two decimals', () => {
    expect(formatCciValue(0.456)).toBe('0.46');
  });
});
