import { describe, expect, it } from 'vitest';
import { applyLayerPanelDrop, buildLayerPanelTree } from './siAddedLayersOrganize';

describe('applyLayerPanelDrop', () => {
  const layers = [
    { id: 'a', layerGroup: 'G1' },
    { id: 'b', layerGroup: 'G1' },
    { id: 'c' },
  ];
  const groups = ['G1'];

  it('moves layer between groups via inside drop', () => {
    const result = applyLayerPanelDrop(layers, groups, { kind: 'layer', id: 'c' }, {
      zone: 'group',
      groupName: 'G1',
      edge: 'inside',
    });
    expect(result.layers.find(l => l.id === 'c')?.layerGroup).toBe('G1');
    const tree = buildLayerPanelTree(result.layers, result.groupNames);
    expect(tree.groupLayers.G1).toContain('c');
    expect(tree.ungrouped).not.toContain('c');
  });

  it('reorders groups', () => {
    const two = [
      { id: 'x', layerGroup: 'A' },
      { id: 'y', layerGroup: 'B' },
    ];
    const result = applyLayerPanelDrop(two, ['A', 'B'], { kind: 'group', name: 'B' }, {
      zone: 'group',
      groupName: 'A',
      edge: 'before',
    });
    expect(result.groupNames).toEqual(['B', 'A']);
  });
});
