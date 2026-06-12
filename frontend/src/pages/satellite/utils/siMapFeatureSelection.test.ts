import { describe, expect, it } from 'vitest';
import {
  buildSiMapSelectionSummary,
  mergeSiMapSelectionEntries,
  selectionEntriesToCsv,
  selectionEntriesToGeoJson,
  syncTableKeysFromSelection,
  type SiMapSelectionEntry,
} from './siMapFeatureSelection';

function entry(layerId: string, key: string, area?: number): SiMapSelectionEntry {
  return {
    layerId,
    layerName: layerId,
    rowKey: key,
    featureLinkKey: `${layerId}::${key}`,
    feature: {
      type: 'Feature',
      geometry:
        area != null
          ? {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [0.01, 0],
                  [0.01, 0.01],
                  [0, 0.01],
                  [0, 0],
                ],
              ],
            }
          : { type: 'Point', coordinates: [1, 2] },
      properties: { OBJECTID: key, value: area ?? 10 },
    },
    geometryType: area != null ? 'Polygon' : 'Point',
  };
}

describe('siMapFeatureSelection', () => {
  it('merges with replace mode', () => {
    const cur = [entry('a', '1')];
    const inc = [entry('b', '2')];
    const out = mergeSiMapSelectionEntries(cur, inc, 'replace');
    expect(out).toHaveLength(1);
    expect(out[0]?.layerId).toBe('b');
  });

  it('merges with add mode', () => {
    const cur = [entry('a', '1')];
    const inc = [entry('b', '2')];
    const out = mergeSiMapSelectionEntries(cur, inc, 'add');
    expect(out).toHaveLength(2);
  });

  it('merges with remove mode', () => {
    const cur = [entry('a', '1'), entry('a', '2')];
    const inc = [entry('a', '1')];
    const out = mergeSiMapSelectionEntries(cur, inc, 'remove');
    expect(out).toHaveLength(1);
    expect(out[0]?.rowKey).toBe('2');
  });

  it('builds summary with layer counts', () => {
    const summary = buildSiMapSelectionSummary([entry('L1', 'a'), entry('L1', 'b'), entry('L2', 'c')]);
    expect(summary.total).toBe(3);
    expect(summary.layerCounts).toHaveLength(2);
    expect(summary.numericStats.some(s => s.field === 'value')).toBe(true);
  });

  it('syncs table keys for active layer only', () => {
    const entries = [entry('L1', 'a'), entry('L2', 'b')];
    const keys = syncTableKeysFromSelection(entries, 'L1');
    expect([...keys]).toEqual(['a']);
  });

  it('exports geojson and csv', () => {
    const entries = [entry('L1', 'x')];
    const fc = selectionEntriesToGeoJson(entries);
    expect(fc.features).toHaveLength(1);
    const csv = selectionEntriesToCsv(entries);
    expect(csv).toContain('_layer');
    expect(csv).toContain('L1');
  });
});
