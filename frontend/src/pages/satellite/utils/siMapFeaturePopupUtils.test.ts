import { describe, expect, it } from 'vitest';
import {
  classifySiMapFeatureFieldKind,
  extractSiMapFeatureName,
  formatSiMapFeatureCoordinates,
  formatSiMapFeaturePopupValue,
} from './siMapFeaturePopupUtils';

describe('siMapFeaturePopupUtils', () => {
  it('extractSiMapFeatureName finds common name fields', () => {
    expect(extractSiMapFeatureName({ name: 'Building A' })).toBe('Building A');
    expect(extractSiMapFeatureName({ height_fin: 12 })).toBe('');
  });

  it('classifySiMapFeatureFieldKind detects urls and numbers', () => {
    expect(classifySiMapFeatureFieldKind('photo', 'https://x.com/a.jpg')).toBe('image');
    expect(classifySiMapFeatureFieldKind('website', 'https://example.com')).toBe('url');
    expect(classifySiMapFeatureFieldKind('area_ha', 12.5)).toBe('number');
  });

  it('formatSiMapFeaturePopupValue formats numbers and booleans', () => {
    expect(formatSiMapFeaturePopupValue(true, 'boolean')).toBe('Yes');
    expect(formatSiMapFeaturePopupValue(1234.5, 'number')).toMatch(/1/);
  });

  it('formatSiMapFeatureCoordinates uses hemisphere labels', () => {
    expect(formatSiMapFeatureCoordinates(55.27, 25.2)).toContain('N');
    expect(formatSiMapFeatureCoordinates(55.27, 25.2)).toContain('E');
  });
});
