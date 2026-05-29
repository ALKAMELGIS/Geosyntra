import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SiAddedLayerRowModel } from '../siAddedLayersTypes';
import type { SiLayerDragPayload, SiLayerDropTarget } from '../utils/siAddedLayersOrganize';
import {
  siLayerDropEdgeFromPointer,
  siLayerDropIndicatorKey,
} from '../utils/siAddedLayersOrganize';
import { SiEnvAddedLayerRow } from './SiEnvAddedLayerRow';
import { SiEnvLayerInlineEdit } from './SiEnvLayerInlineEdit';
import { SiLayerTreeGrip } from './SiLayerTreeGrip';
import './SiEnvAddedLayersList.css';

export type SiEnvAddedLayersListProps = {
  systemRows: SiAddedLayerRowModel[];
  groups: Array<{ name: string; layers: SiAddedLayerRowModel[] }>;
  ungroupedLayers: SiAddedLayerRowModel[];
  emptyGroups: string[];
  groupNames: string[];
  collapsedGroups: Record<string, boolean>;
  onToggleGroupCollapse: (name: string) => void;
  onCommitNewGroup: (name: string) => void;
  onRenameGroup: (oldName: string, newName: string) => void;
  onDeleteGroup: (name: string) => void;
  onToggleGroupVisibility: (groupName: string, visible: boolean) => void;
  onMoveInStack: (layerId: string, dir: -1 | 1) => void;
  onPanelDrop: (drag: SiLayerDragPayload, target: SiLayerDropTarget) => void;
  editingLayerId?: string | null;
  onStartEditLayerName?: (layerId: string) => void;
  onCommitLayerRename?: (layerId: string, name: string) => void;
  onCancelLayerRename?: () => void;
  layerOptionsMenuLayerId?: string | null;
  onLayerOptionsMenuToggle?: (layerId: string, anchor: HTMLElement | null, opening: boolean) => void;
  onGroupOptionsMenuToggle?: (groupName: string, anchor: HTMLElement | null, opening: boolean) => void;
  groupOptionsMenuName?: string | null;
  editingGroupName?: string | null;
  onStartEditGroupName?: (name: string) => void;
  onCancelEditGroupName?: () => void;
  syncingLayerId?: string | null;
  onActionClick?: (
    e: React.MouseEvent<HTMLButtonElement>,
    action: 'sync' | 'table' | 'symbology' | 'legend' | 'remove' | 'rename' | 'editAoi',
    layerId: string,
  ) => void;
};

const AUTO_EXPAND_MS = 480;

function groupAllVisible(layers: SiAddedLayerRowModel[]): boolean {
  const togglable = layers.filter(l => l.toggleable);
  if (!togglable.length) return true;
  return togglable.every(l => l.visible);
}

function dropLineFlags(
  indicatorKey: string | null,
  target: SiLayerDropTarget,
): { before: boolean; after: boolean } {
  if (!indicatorKey) return { before: false, after: false };
  const key = siLayerDropIndicatorKey(target);
  if (indicatorKey !== key) return { before: false, after: false };
  if (target.zone === 'layer') {
    return { before: target.edge === 'before', after: target.edge === 'after' };
  }
  if (target.zone === 'group' && target.edge === 'inside') {
    return { before: true, after: false };
  }
  if (target.zone === 'ungrouped') {
    return { before: true, after: false };
  }
  if (target.zone === 'group') {
    if (target.edge === 'before') return { before: true, after: false };
    if (target.edge === 'after') return { before: false, after: true };
  }
  return { before: false, after: false };
}

export function SiEnvAddedLayersList({
  systemRows,
  groups,
  ungroupedLayers,
  emptyGroups,
  groupNames,
  collapsedGroups,
  onToggleGroupCollapse,
  onCommitNewGroup,
  onRenameGroup,
  onDeleteGroup,
  onToggleGroupVisibility,
  onMoveInStack,
  onPanelDrop,
  editingLayerId,
  onStartEditLayerName,
  onCommitLayerRename,
  onCancelLayerRename,
  layerOptionsMenuLayerId,
  onLayerOptionsMenuToggle,
  onGroupOptionsMenuToggle,
  groupOptionsMenuName,
  editingGroupName,
  onStartEditGroupName,
  onCancelEditGroupName,
  syncingLayerId,
  onActionClick,
}: SiEnvAddedLayersListProps) {
  const dragRef = useRef<SiLayerDragPayload | null>(null);
  const [dragging, setDragging] = useState<SiLayerDragPayload | null>(null);
  const [dropIndicator, setDropIndicator] = useState<SiLayerDropTarget | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoExpandGroupRef = useRef<string | null>(null);

  const clearAutoExpand = useCallback(() => {
    if (autoExpandTimerRef.current) {
      clearTimeout(autoExpandTimerRef.current);
      autoExpandTimerRef.current = null;
    }
    autoExpandGroupRef.current = null;
  }, []);

  const onDragStartLayer = useCallback((id: string) => {
    const payload: SiLayerDragPayload = { kind: 'layer', id };
    dragRef.current = payload;
    setDragging(payload);
    setDropIndicator(null);
  }, []);

  const onDragStartGroup = useCallback((name: string) => {
    const payload: SiLayerDragPayload = { kind: 'group', name };
    dragRef.current = payload;
    setDragging(payload);
    setDropIndicator(null);
  }, []);

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
    setDragging(null);
    setDropIndicator(null);
    clearAutoExpand();
  }, [clearAutoExpand]);

  const scheduleAutoExpand = useCallback(
    (groupName: string) => {
      if (collapsedGroups[groupName]) {
        if (autoExpandGroupRef.current === groupName) return;
        clearAutoExpand();
        autoExpandGroupRef.current = groupName;
        autoExpandTimerRef.current = setTimeout(() => {
          onToggleGroupCollapse(groupName);
          autoExpandTimerRef.current = null;
        }, AUTO_EXPAND_MS);
      }
    },
    [collapsedGroups, clearAutoExpand, onToggleGroupCollapse],
  );

  const onDragOverTarget = useCallback(
    (target: SiLayerDropTarget, e: React.DragEvent) => {
      if (!dragRef.current) return;
      if (dragRef.current.kind === 'group' && target.zone === 'layer') return;
      setDropIndicator(target);
      if (target.zone === 'group' && target.edge === 'inside') {
        scheduleAutoExpand(target.groupName);
      } else {
        clearAutoExpand();
      }
      try {
        e.dataTransfer.dropEffect = 'move';
      } catch {
        /* ignore */
      }
    },
    [clearAutoExpand, scheduleAutoExpand],
  );

  const onDropTarget = useCallback(
    (target: SiLayerDropTarget) => {
      const drag = dragRef.current;
      onDragEnd();
      if (!drag) return;
      if (drag.kind === 'layer' && target.zone === 'layer' && drag.id === target.layerId) return;
      if (drag.kind === 'group' && target.zone === 'group' && drag.name === target.groupName) return;
      onPanelDrop(drag, target);
    },
    [onDragEnd, onPanelDrop],
  );

  useEffect(() => () => clearAutoExpand(), [clearAutoExpand]);

  const indicatorKey = dropIndicator ? siLayerDropIndicatorKey(dropIndicator) : null;

  const rowProps = {
    compactTree: true,
    showReorder: true,
    onMoveInStack,
    onDragHandleStart: onDragStartLayer,
    onDragHandleEnd: onDragEnd,
    onDragOverTarget,
    onDropTarget,
    layerOptionsMenuLayerId,
    onLayerOptionsMenuToggle,
    syncingLayerId,
    onActionClick,
    editingLayerId,
    onStartEditLayerName,
    onCommitLayerRename,
    onCancelLayerRename,
  };

  const hasCustom =
    groups.some(g => g.layers.length) || ungroupedLayers.length > 0 || emptyGroups.length > 0;

  const allGroupBlocks = useMemo(() => {
    const filled = groups.map(g => ({ name: g.name, layers: g.layers, empty: false }));
    const empty = emptyGroups.map(name => ({ name, layers: [] as SiAddedLayerRowModel[], empty: true }));
    const order = new Map(groupNames.map((n, i) => [n, i]));
    return [...filled, ...empty].sort((a, b) => (order.get(a.name) ?? 999) - (order.get(b.name) ?? 999));
  }, [groups, emptyGroups, groupNames]);

  const renderGroupHead = (name: string, layers: SiAddedLayerRowModel[], empty: boolean) => {
    const collapsed = Boolean(collapsedGroups[name]);
    const visible = groupAllVisible(layers);
    const menuOpen = groupOptionsMenuName === name;
    const isDraggingGroup = dragging?.kind === 'group' && dragging.name === name;
    const inside = dropLineFlags(indicatorKey, { zone: 'group', groupName: name, edge: 'inside' }).before;
    const before = dropLineFlags(indicatorKey, { zone: 'group', groupName: name, edge: 'before' }).before;
    const after = dropLineFlags(indicatorKey, { zone: 'group', groupName: name, edge: 'after' }).after;

    const groupDragHandlers = {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const edge = siLayerDropEdgeFromPointer(e.clientY, (e.currentTarget as HTMLElement).getBoundingClientRect());
        const target: SiLayerDropTarget =
          dragRef.current?.kind === 'group'
            ? { zone: 'group', groupName: name, edge }
            : { zone: 'group', groupName: name, edge: edge === 'before' ? 'before' : 'inside' };
        onDragOverTarget(target, e);
        if (dragRef.current?.kind === 'layer' && (target.edge === 'inside' || collapsed)) {
          scheduleAutoExpand(name);
        }
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const edge = siLayerDropEdgeFromPointer(e.clientY, (e.currentTarget as HTMLElement).getBoundingClientRect());
        if (dragRef.current?.kind === 'group') {
          onDropTarget({ zone: 'group', groupName: name, edge });
        } else {
          onDropTarget({
            zone: 'group',
            groupName: name,
            edge: edge === 'before' ? 'before' : 'inside',
          });
        }
      },
    };

    return (
      <div className="si-layer-tree__group-slot">
        {before ? <div className="si-layer-tree__drop-line" aria-hidden /> : null}
        <div
          className={`si-layer-tree__row si-layer-tree__row--group${
            isDraggingGroup ? ' si-layer-tree__row--dragging' : ''
          }${inside ? ' si-layer-tree__row--drop-inside' : ''}`}
          {...groupDragHandlers}
        >
          <SiLayerTreeGrip
            draggable
            title="Drag to reorder group"
            ariaLabel="Drag group"
            onDragStart={e => {
              e.stopPropagation();
              onDragStartGroup(name);
              try {
                e.dataTransfer.setData('text/plain', `group:${name}`);
                e.dataTransfer.effectAllowed = 'move';
              } catch {
                /* ignore */
              }
            }}
            onDragEnd={onDragEnd}
          />
          <button
            type="button"
            className="si-layer-tree__chevron"
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand group' : 'Collapse group'}
            onClick={() => onToggleGroupCollapse(name)}
          >
            <i className={`fa-solid fa-chevron-${collapsed ? 'right' : 'down'}`} aria-hidden />
          </button>
          {editingGroupName === name ? (
            <SiEnvLayerInlineEdit
              value={name}
              ariaLabel="Rename group"
              onCommit={v => {
                onCancelEditGroupName?.();
                if (v && v !== name) onRenameGroup(name, v);
              }}
              onCancel={() => onCancelEditGroupName?.()}
            />
          ) : (
            <span className="si-layer-tree__label" title={name}>
              {name}
            </span>
          )}
          {empty ? <span className="si-layer-tree__badge">empty</span> : null}
          <span className="si-layer-tree__count">{layers.length}</span>
          <button
            type="button"
            className="si-layer-tree__icon-btn"
            title={visible ? 'Hide group layers' : 'Show group layers'}
            aria-label={visible ? 'Hide group layers' : 'Show group layers'}
            onClick={e => {
              e.stopPropagation();
              onToggleGroupVisibility(name, !visible);
            }}
          >
            <i className={`fa-solid ${visible ? 'fa-eye' : 'fa-eye-slash'}`} aria-hidden />
          </button>
          {onGroupOptionsMenuToggle ? (
            <span data-si-env-group-options-anchor={name}>
              <button
                type="button"
                className={`si-layer-tree__icon-btn si-layer-tree__icon-btn--menu${menuOpen ? ' si-layer-tree__icon-btn--active' : ''}`}
                title="Group options"
                aria-label={`Options for group ${name}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={e => {
                  e.stopPropagation();
                  const opening = !menuOpen;
                  onGroupOptionsMenuToggle(
                    name,
                    (e.currentTarget as HTMLElement).closest('[data-si-env-group-options-anchor]'),
                    opening,
                  );
                }}
              >
                <i className="fa-solid fa-ellipsis" aria-hidden />
              </button>
            </span>
          ) : (
            <>
              <button
                type="button"
                className="si-layer-tree__icon-btn"
                title="Rename group"
                aria-label="Rename group"
                onClick={e => {
                  e.stopPropagation();
                  onStartEditGroupName?.(name);
                }}
              >
                <i className="fa-solid fa-pen" aria-hidden />
              </button>
              {!empty || layers.length === 0 ? (
                <button
                  type="button"
                  className="si-layer-tree__icon-btn si-layer-tree__icon-btn--danger"
                  title="Delete group"
                  aria-label="Delete group"
                  onClick={e => {
                    e.stopPropagation();
                    onDeleteGroup(name);
                  }}
                >
                  <i className="fa-solid fa-trash-can" aria-hidden />
                </button>
              ) : null}
            </>
          )}
        </div>
        {after ? <div className="si-layer-tree__drop-line" aria-hidden /> : null}
      </div>
    );
  };

  const ungroupedTarget: SiLayerDropTarget = { zone: 'ungrouped', edge: 'inside' };
  const ungroupedDropInside = dropLineFlags(indicatorKey, ungroupedTarget).before;

  return (
    <div className="si-env-added-layers si-env-added-layers--tree">
      <div className="si-env-added-layers__head">
        <div className="si-env-chart-title">Added layers</div>
        <button
          type="button"
          className="si-env-group-create-btn"
          title="Add group inline"
          onClick={() => setCreatingGroup(true)}
        >
          <i className="fa-solid fa-folder-plus" aria-hidden />
          <span>Group</span>
        </button>
      </div>

      {!systemRows.length && !hasCustom && !creatingGroup ? (
        <p className="si-env-message">No layers added yet.</p>
      ) : (
        <div
          className={`si-layer-tree${dragging ? ' si-layer-tree--drag-active' : ''}`}
          role="tree"
          aria-label="Map layers"
          onDragLeave={e => {
            if (e.currentTarget === e.target) {
              setDropIndicator(null);
              clearAutoExpand();
            }
          }}
        >
          {creatingGroup ? (
            <div className="si-layer-tree__row si-layer-tree__row--create">
              <i className="fa-solid fa-folder-plus si-layer-tree__row-icon" aria-hidden />
              <SiEnvLayerInlineEdit
                value="New group"
                placeholder="Group name"
                ariaLabel="New group name"
                onCommit={v => {
                  setCreatingGroup(false);
                  if (v) onCommitNewGroup(v);
                }}
                onCancel={() => setCreatingGroup(false)}
              />
            </div>
          ) : null}

          {allGroupBlocks.map(block => (
            <div key={`grp-${block.name}`} className="si-layer-tree__branch" role="group">
              {renderGroupHead(block.name, block.layers, block.empty)}
              {!collapsedGroups[block.name] ? (
                <div
                  className="si-layer-tree__children"
                  onDragOver={e => {
                    if (!block.empty || dragRef.current?.kind !== 'layer') return;
                    e.preventDefault();
                    onDragOverTarget({ zone: 'group', groupName: block.name, edge: 'inside' }, e);
                  }}
                  onDrop={e => {
                    if (!block.empty) return;
                    e.preventDefault();
                    onDropTarget({ zone: 'group', groupName: block.name, edge: 'inside' });
                  }}
                >
                  {block.layers.map(layer => {
                    const lid = layer.sourceLayerId;
                    const beforeT: SiLayerDropTarget = { zone: 'layer', layerId: lid!, edge: 'before' };
                    const afterT: SiLayerDropTarget = { zone: 'layer', layerId: lid!, edge: 'after' };
                    const { before, after } = lid
                      ? {
                          before: dropLineFlags(indicatorKey, beforeT).before,
                          after: dropLineFlags(indicatorKey, afterT).after,
                        }
                      : { before: false, after: false };
                    return (
                      <SiEnvAddedLayerRow
                        key={layer.id}
                        layer={layer}
                        isDragging={dragging?.kind === 'layer' && dragging.id === lid}
                        dropIndicatorBefore={before}
                        dropIndicatorAfter={after}
                        {...rowProps}
                      />
                    );
                  })}
                  {block.empty ? (
                    <p
                      className={`si-layer-tree__drop-hint${
                        dropIndicator?.zone === 'group' &&
                        dropIndicator.groupName === block.name &&
                        dropIndicator.edge === 'inside'
                          ? ' si-layer-tree__drop-hint--active'
                          : ''
                      }`}
                    >
                      Drag layers here
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}

          {ungroupedLayers.length ? (
            <div
              className={`si-layer-tree__ungrouped-stack${
                ungroupedDropInside ? ' si-layer-tree__ungrouped-stack--drop-inside' : ''
              }`}
              role="group"
              aria-label="Layers"
              onDragOver={e => {
                e.preventDefault();
                onDragOverTarget(ungroupedTarget, e);
              }}
              onDrop={e => {
                e.preventDefault();
                onDropTarget(ungroupedTarget);
              }}
            >
              {ungroupedDropInside ? <div className="si-layer-tree__drop-line" aria-hidden /> : null}
              {ungroupedLayers.map(layer => {
                const lid = layer.sourceLayerId;
                const beforeT: SiLayerDropTarget = { zone: 'layer', layerId: lid!, edge: 'before' };
                const afterT: SiLayerDropTarget = { zone: 'layer', layerId: lid!, edge: 'after' };
                const { before, after } = lid
                  ? {
                      before: dropLineFlags(indicatorKey, beforeT).before,
                      after: dropLineFlags(indicatorKey, afterT).after,
                    }
                  : { before: false, after: false };
                return (
                  <SiEnvAddedLayerRow
                    key={layer.id}
                    layer={layer}
                    isDragging={dragging?.kind === 'layer' && dragging.id === lid}
                    dropIndicatorBefore={before}
                    dropIndicatorAfter={after}
                    {...rowProps}
                  />
                );
              })}
            </div>
          ) : null}

          {systemRows.length ? (
            <div className="si-layer-tree__branch si-layer-tree__branch--system" role="group" aria-label="Map services">
              <div className="si-layer-tree__row si-layer-tree__row--group si-layer-tree__row--static">
                <span className="si-layer-tree__chevron si-layer-tree__chevron--spacer" aria-hidden />
                <i className="fa-solid fa-globe si-layer-tree__row-icon" aria-hidden />
                <span className="si-layer-tree__label">Map services</span>
                <span className="si-layer-tree__count">{systemRows.length}</span>
              </div>
              <div className="si-layer-tree__children">
                {systemRows.map(layer => (
                  <SiEnvAddedLayerRow key={layer.id} layer={layer} compactTree showReorder={false} onActionClick={onActionClick} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
