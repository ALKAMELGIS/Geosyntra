import { describe, expect, it } from 'vitest';
import {
  inferFieldKind,
  suggestSymbologyStyleForField,
  filterStyleOptionsForSmartMapping,
} from './siSymbologySmartMapping';
import { SI_SYMBOLOGY_STYLE_OPTIONS } from '../components/siSymbologyStudioConstants';

const geo = {
  features: [
    { properties: { a: 1, b: 'x', c: '2024-01-15' } },
    { properties: { a: 2, b: 'y', c: '2024-02-20' } },
    { properties: { a: 3, b: 'z', c: '2024-03-10' } },
  ],
};

describe('siSymbologySmartMapping', () => {
  it('detects numeric fields', () => {
    expect(inferFieldKind(geo, 'a')).toBe('numeric');
  });

  it('detects text fields', () => {
    expect(inferFieldKind(geo, 'b')).toBe('text');
  });

  it('detects date fields', () => {
    expect(inferFieldKind(geo, 'c')).toBe('date');
  });

  it('suggests unique for text', () => {
    expect(suggestSymbologyStyleForField('text', 'polygon')).toBe('unique');
  });

  it('filters numeric-only styles for text fields', () => {
    const filtered = filterStyleOptionsForSmartMapping(SI_SYMBOLOGY_STYLE_OPTIONS, 'text', 'polygon');
    expect(filtered.some(o => o.value === 'color')).toBe(false);
    expect(filtered.some(o => o.value === 'unique')).toBe(true);
  });
});
