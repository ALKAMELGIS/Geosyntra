export type CustomLayerStackItem = { id: string; layerGroup?: string };

export const SI_LAYER_GROUPS_LS = 'si-sat-added-layer-groups-v1';

export function loadStoredLayerGroupNames(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SI_LAYER_GROUPS_LS);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map(s => s.trim());
  } catch {
    return [];
  }
}

export function persistLayerGroupNames(names: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SI_LAYER_GROUPS_LS, JSON.stringify(names));
  } catch {
    /* ignore */
  }
}

export type SiCustomLayerGroupBlock = { name: string; layers: CustomLayerStackItem[] };

/** Top of panel = top of map stack (last index in `customLayers`). */
export function organizeCustomLayersForDisplay(
  layers: CustomLayerStackItem[],
  storedGroupNames: string[],
): { groups: SiCustomLayerGroupBlock[]; ungrouped: CustomLayerStackItem[]; emptyGroups: string[] } {
  const names = [...storedGroupNames];
  for (const l of layers) {
    const g = l.layerGroup?.trim();
    if (g && !names.includes(g)) names.push(g);
  }
  const byGroup = new Map<string, CustomLayerStackItem[]>();
  const ungrouped: CustomLayerStackItem[] = [];
  for (const l of layers) {
    const g = l.layerGroup?.trim();
    if (g) {
      const list = byGroup.get(g) ?? [];
      list.push(l);
      byGroup.set(g, list);
    } else {
      ungrouped.push(l);
    }
  }
  const forDisplay = (arr: CustomLayerStackItem[]) => [...arr].reverse();
  const groups = names
    .filter(g => (byGroup.get(g)?.length ?? 0) > 0)
    .map(g => ({ name: g, layers: forDisplay(byGroup.get(g) ?? []) }));
  const emptyGroups = names.filter(g => !(byGroup.get(g)?.length ?? 0));
  return { groups, ungrouped: forDisplay(ungrouped), emptyGroups };
}

/** @deprecated Use {@link applyLayerPanelDrop} for tree-aware reorder. */
export function reorderCustomLayersArray<T extends { id: string }>(layers: T[], fromId: string, toId: string): T[] {
  if (fromId === toId) return layers;
  const from = layers.findIndex(l => l.id === fromId);
  const to = layers.findIndex(l => l.id === toId);
  if (from < 0 || to < 0) return layers;
  const cp = [...layers];
  const [item] = cp.splice(from, 1);
  cp.splice(to, 0, item!);
  return cp;
}

export type SiLayerDragPayload = { kind: 'layer'; id: string } | { kind: 'group'; name: string };

export type SiLayerDropTarget =
  | { zone: 'layer'; layerId: string; edge: 'before' | 'after' }
  | { zone: 'group'; groupName: string; edge: 'before' | 'after' | 'inside' }
  | { zone: 'ungrouped'; edge: 'inside' };

export type SiLayerPanelTree = {
  groupOrder: string[];
  groupLayers: Record<string, string[]>;
  ungrouped: string[];
};

export function buildLayerPanelTree(
  layers: CustomLayerStackItem[],
  storedGroupNames: string[],
): SiLayerPanelTree {
  const organized = organizeCustomLayersForDisplay(layers, storedGroupNames);
  const groupOrder = [...storedGroupNames];
  for (const name of organized.emptyGroups) {
    if (!groupOrder.includes(name)) groupOrder.push(name);
  }
  const groupLayers: Record<string, string[]> = {};
  for (const g of organized.groups) {
    groupLayers[g.name] = g.layers.map(l => l.id);
  }
  for (const name of organized.emptyGroups) {
    if (!groupLayers[name]) groupLayers[name] = [];
  }
  return {
    groupOrder,
    groupLayers,
    ungrouped: organized.ungrouped.map(l => l.id),
  };
}

function cloneTree(tree: SiLayerPanelTree): SiLayerPanelTree {
  const groupLayers: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(tree.groupLayers)) {
    groupLayers[k] = [...v];
  }
  return {
    groupOrder: [...tree.groupOrder],
    groupLayers,
    ungrouped: [...tree.ungrouped],
  };
}

function removeLayerFromTree(tree: SiLayerPanelTree, layerId: string) {
  tree.ungrouped = tree.ungrouped.filter(id => id !== layerId);
  for (const name of Object.keys(tree.groupLayers)) {
    tree.groupLayers[name] = tree.groupLayers[name]!.filter(id => id !== layerId);
  }
}

function findLayerList(tree: SiLayerPanelTree, layerId: string): { key: 'ungrouped' | string; list: string[] } | null {
  if (tree.ungrouped.includes(layerId)) {
    return { key: 'ungrouped', list: [...tree.ungrouped] };
  }
  for (const name of tree.groupOrder) {
    const list = tree.groupLayers[name];
    if (list?.includes(layerId)) return { key: name, list: [...list] };
  }
  return null;
}

function applyDropOnTree(tree: SiLayerPanelTree, drag: SiLayerDragPayload, target: SiLayerDropTarget): SiLayerPanelTree {
  if (drag.kind === 'group') {
    if (target.zone !== 'group' || target.edge === 'inside') return tree;
    const order = [...tree.groupOrder];
    const from = order.indexOf(drag.name);
    if (from < 0) return tree;
    order.splice(from, 1);
    let to = order.indexOf(target.groupName);
    if (to < 0) return tree;
    if (target.edge === 'after') to += 1;
    if (from < to) to -= 1;
    order.splice(Math.max(0, to), 0, drag.name);
    return { ...tree, groupOrder: order };
  }

  removeLayerFromTree(tree, drag.id);

  if (target.zone === 'ungrouped') {
    tree.ungrouped = [...tree.ungrouped, drag.id];
    return tree;
  }

  if (target.zone === 'group') {
    const list = [...(tree.groupLayers[target.groupName] ?? [])];
    if (target.edge === 'before') {
      list.unshift(drag.id);
    } else {
      list.push(drag.id);
    }
    tree.groupLayers[target.groupName] = list;
    if (!tree.groupOrder.includes(target.groupName)) {
      tree.groupOrder = [...tree.groupOrder, target.groupName];
    }
    return tree;
  }

  const found = findLayerList(tree, target.layerId);
  if (!found) return tree;
  const idx = found.list.indexOf(target.layerId);
  if (idx < 0) return tree;
  const insertAt = target.edge === 'before' ? idx : idx + 1;
  found.list.splice(insertAt, 0, drag.id);
  if (found.key === 'ungrouped') {
    tree.ungrouped = found.list;
  } else {
    tree.groupLayers[found.key] = found.list;
  }
  return tree;
}

/** Panel top → map top; rebuilds flat stack and `layerGroup` assignments. */
export function flattenLayerPanelTree<T extends CustomLayerStackItem>(
  layers: T[],
  tree: SiLayerPanelTree,
): T[] {
  const byId = new Map(layers.map(l => [l.id, l]));
  const topToBottom: string[] = [];
  for (const g of tree.groupOrder) {
    const ids = tree.groupLayers[g];
    if (ids?.length) topToBottom.push(...ids);
  }
  topToBottom.push(...tree.ungrouped);
  const bottomToTop = [...topToBottom].reverse();
  const used = new Set<string>();
  const ordered: T[] = [];
  for (const id of bottomToTop) {
    const layer = byId.get(id);
    if (!layer) continue;
    used.add(id);
    let layerGroup: string | undefined;
    for (const g of tree.groupOrder) {
      if (tree.groupLayers[g]?.includes(id)) {
        layerGroup = g;
        break;
      }
    }
    ordered.push({ ...layer, layerGroup });
  }
  for (const layer of layers) {
    if (!used.has(layer.id)) ordered.unshift(layer);
  }
  return ordered;
}

export function applyLayerPanelDrop<T extends CustomLayerStackItem>(
  layers: T[],
  groupNames: string[],
  drag: SiLayerDragPayload,
  target: SiLayerDropTarget,
): { layers: T[]; groupNames: string[] } {
  if (drag.kind === 'layer' && drag.id === (target.zone === 'layer' ? target.layerId : '')) {
    return { layers, groupNames };
  }
  const tree = cloneTree(buildLayerPanelTree(layers, groupNames));
  const next = applyDropOnTree(tree, drag, target);
  return {
    layers: flattenLayerPanelTree(layers, next),
    groupNames: next.groupOrder,
  };
}

/** Pointer Y → insert before/after row midpoint. */
export function siLayerDropEdgeFromPointer(clientY: number, rect: DOMRect): 'before' | 'after' {
  const mid = rect.top + rect.height / 2;
  return clientY < mid ? 'before' : 'after';
}

export function siLayerDropIndicatorKey(target: SiLayerDropTarget): string {
  if (target.zone === 'layer') return `layer:${target.layerId}:${target.edge}`;
  if (target.zone === 'group') return `group:${target.groupName}:${target.edge}`;
  return 'ungrouped:inside';
}
