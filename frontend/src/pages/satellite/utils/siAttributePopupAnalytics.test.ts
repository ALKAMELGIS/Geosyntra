import { describe, expect, it } from 'vitest';
import {
  buildAttributePopupSummary,
  buildAttributesCsv,
  classifyAttributeRowBucket,
  filterAttributeRowsByQuery,
  filterNonemptyAttributeRows,
  formatAttributesAsPlainText,
  parseAttributeNumericValue,
  sliceVirtualAttributeRows,
} from './siAttributePopupAnalytics';

describe('siAttributePopupAnalytics', () => {
  it('filters empty attribute values', () => {
    const rows = [
      { label: 'Name', value: 'Site A' },
      { label: 'Empty', value: '—' },
      { label: 'Null', value: 'null' },
    ];
    expect(filterNonemptyAttributeRows(rows)).toHaveLength(1);
  });

  it('classifies NDVI and AOI fields', () => {
    expect(classifyAttributeRowBucket({ label: 'NDVI_mean', value: '0.42' })).toBe('ndvi');
    expect(classifyAttributeRowBucket({ label: 'AOI area', value: '12.5 ha' })).toBe('aoi');
  });

  it('builds summary with numeric stats', () => {
    const summary = buildAttributePopupSummary([
      { label: 'Height', value: '42' },
      { label: 'NDVI', value: '0.55' },
      { label: 'AOI_ha', value: '3.2' },
    ]);
    expect(summary.totalFields).toBe(3);
    expect(summary.ndviFields).toHaveLength(1);
    expect(summary.aoiFields).toHaveLength(1);
    expect(summary.numericFields.some(n => n.label === 'Height')).toBe(true);
  });

  it('filters rows by search query', () => {
    const rows = [
      { label: 'Farm', value: 'North' },
      { label: 'Status', value: 'Active' },
    ];
    expect(filterAttributeRowsByQuery(rows, 'farm')).toHaveLength(1);
    expect(filterAttributeRowsByQuery(rows, 'active')).toHaveLength(1);
  });

  it('exports plain text and CSV', () => {
    const rows = [{ label: 'A', value: '1' }];
    expect(formatAttributesAsPlainText(rows)).toBe('A: 1');
    expect(buildAttributesCsv(rows)).toContain('"A","1"');
  });

  it('parseAttributeNumericValue handles commas', () => {
    expect(parseAttributeNumericValue('1,234.5')).toBe(1234.5);
    expect(parseAttributeNumericValue('—')).toBeNull();
  });

  it('sliceVirtualAttributeRows returns full list for small datasets', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ label: `F${i}`, value: String(i) }));
    const slice = sliceVirtualAttributeRows(rows, 0, 400, 44);
    expect(slice.visible).toHaveLength(20);
  });

  it('sliceVirtualAttributeRows windows large datasets', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ label: `F${i}`, value: String(i) }));
    const slice = sliceVirtualAttributeRows(rows, 440, 400, 44);
    expect(slice.visible.length).toBeLessThan(200);
    expect(slice.startIndex).toBeGreaterThan(0);
  });
});
