import type { ReactNode } from 'react';
import { SiEnvLayerInlineEdit } from './SiEnvLayerInlineEdit';
import { SiLayerTreeGrip } from './SiLayerTreeGrip';
import type { SiAddedLayerRowModel } from '../siAddedLayersTypes';
import type { SiLayerDropTarget } from '../utils/siAddedLayersOrganize';
import { siLayerDropEdgeFromPointer } from '../utils/siAddedLayersOrganize';
import './SiEnvAddedLayersList.css';

export type SiEnvAddedLayerRowProps = {
  layer: SiAddedLayerRowModel;
  compactTree?: boolean;
  showReorder?: boolean;
  isDragging?: boolean;
  dropIndicatorBefore?: boolean;
  dropIndicatorAfter?: boolean;
  onMoveInStack?: (layerId: string, dir: -1 | 1) => void;
  onDragHandleStart?: (layerId: string) => void;
  onDragHandleEnd?: () => void;
  onDragOverTarget?: (target: SiLayerDropTarget, e: React.DragEvent) => void;
  onDropTarget?: (target: SiLayerDropTarget) => void;
  renderActions?: ReactNode;
  layerOptionsMenuLayerId?: string | null;
  onLayerOptionsMenuToggle?: (layerId: string, anchor: HTMLElement | null, opening: boolean) => void;
  editingLayerId?: string | null;
  onStartEditLayerName?: (layerId: string) => void;
  onCommitLayerRename?: (layerId: string, name: string) => void;
  onCancelLayerRename?: () => void;
};

export function SiEnvAddedLayerRow({
  layer,
  compactTree = false,
  showReorder = false,
  isDragging = false,
  dropIndicatorBefore = false,
  dropIndicatorAfter = false,
  onMoveInStack,
  onDragHandleStart,
  onDragHandleEnd,
  onDragOverTarget,
  onDropTarget,
  renderActions,
  layerOptionsMenuLayerId,
  onLayerOptionsMenuToggle,
  editingLayerId,
  onStartEditLayerName,
  onCommitLayerRename,
  onCancelLayerRename,
}: SiEnvAddedLayerRowProps) {
  const lid = layer.sourceLayerId;
  const menuOpen = Boolean(lid && layerOptionsMenuLayerId === lid);
  const isEditing = Boolean(lid && editingLayerId === lid);

  const dragHandlers =
    lid && onDragOverTarget && onDropTarget
      ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const edge = siLayerDropEdgeFromPointer(e.clientY, (e.currentTarget as HTMLElement).getBoundingClientRect());
            onDragOverTarget({ zone: 'layer', layerId: lid, edge }, e);
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const edge = siLayerDropEdgeFromPointer(e.clientY, (e.currentTarget as HTMLElement).getBoundingClientRect());
            onDropTarget({ zone: 'layer', layerId: lid, edge });
          },
        }
      : {};

  if (compactTree) {
    return (
      <div
        className="si-layer-tree__layer-slot"
        data-si-env-layer-options-root={layer.actionable && lid ? lid : undefined}
      >
        {dropIndicatorBefore ? <div className="si-layer-tree__drop-line" aria-hidden /> : null}
        <div
          className={`si-layer-tree__row si-layer-tree__row--layer${layer.visible ? ' si-layer-tree__row--visible' : ''}${
            !layer.toggleable ? ' si-layer-tree__row--static' : ''
          }${isDragging ? ' si-layer-tree__row--dragging' : ''}`}
          {...dragHandlers}
        >
          <SiLayerTreeGrip
            draggable={Boolean(showReorder && lid && onDragHandleStart)}
            onDragStart={e => {
              e.stopPropagation();
              if (!lid || !onDragHandleStart) return;
              onDragHandleStart(lid);
              try {
                e.dataTransfer.setData('text/plain', lid);
                e.dataTransfer.effectAllowed = 'move';
              } catch {
                /* ignore */
              }
            }}
            onDragEnd={() => onDragHandleEnd?.()}
          />
          {isEditing && lid && onCommitLayerRename && onCancelLayerRename ? (
            <SiEnvLayerInlineEdit
              value={layer.label}
              ariaLabel="Rename layer"
              onCommit={v => onCommitLayerRename(lid, v)}
              onCancel={onCancelLayerRename}
            />
          ) : (
            <span
              className="si-layer-tree__label"
              title={layer.meta ? `${layer.label} — ${layer.meta}` : layer.label}
              onDoubleClick={
                lid && layer.supportsRename && onStartEditLayerName
                  ? e => {
                      e.stopPropagation();
                      onStartEditLayerName(lid);
                    }
                  : undefined
              }
            >
              {layer.label}
            </span>
          )}
          {layer.meta && !isEditing ? (
            <span className="si-layer-tree__meta" title={layer.meta}>
              {layer.busy ? <i className="fa-solid fa-spinner fa-spin si-layer-tree__meta-spin" aria-hidden /> : null}
              {layer.meta}
            </span>
          ) : null}
          {layer.toggleable ? (
            <button
              type="button"
              className="si-layer-tree__icon-btn"
              title={layer.visible ? 'Hide layer' : 'Show layer'}
              aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
              aria-pressed={layer.visible}
              onClick={e => {
                e.stopPropagation();
                layer.onToggle();
              }}
            >
              <i className={`fa-solid ${layer.visible ? 'fa-eye' : 'fa-eye-slash'}`} aria-hidden />
            </button>
          ) : (
            <span className="si-layer-tree__static-badge">on</span>
          )}
          {layer.onExport ? (
            <button
              type="button"
              className="si-layer-tree__icon-btn"
              title="Export raster — GeoTIFF clipped to AOI"
              aria-label={`Export ${layer.label}`}
              onClick={e => {
                e.stopPropagation();
                layer.onExport?.();
              }}
            >
              <i className="fa-solid fa-file-export" aria-hidden />
            </button>
          ) : null}
          {layer.onRemove ? (
            <button
              type="button"
              className="si-layer-tree__icon-btn si-layer-tree__icon-btn--danger"
              title="Remove layer"
              aria-label={`Remove ${layer.label}`}
              onClick={e => {
                e.stopPropagation();
                layer.onRemove?.();
              }}
            >
              <i className="fa-solid fa-trash-can" aria-hidden />
            </button>
          ) : null}
          {layer.actionable && lid && onLayerOptionsMenuToggle ? (
            <div data-si-env-layer-options-anchor={lid}>
              <button
                type="button"
                className={`si-layer-tree__icon-btn si-layer-tree__icon-btn--menu${menuOpen ? ' si-layer-tree__icon-btn--active' : ''}`}
                title="Layer options"
                aria-label={`Options for ${layer.label}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={e => {
                  e.stopPropagation();
                  const opening = !menuOpen;
                  onLayerOptionsMenuToggle(
                    lid,
                    (e.currentTarget as HTMLElement).closest('[data-si-env-layer-options-anchor]'),
                    opening,
                  );
                }}
              >
                <i className="fa-solid fa-ellipsis" aria-hidden />
              </button>
            </div>
          ) : null}
        </div>
        {layer.onOpacityChange ? (
          <div
            className="si-layer-tree__opacity"
            onClick={e => e.stopPropagation()}
            title={`Opacity ${Math.round((layer.opacity ?? 1) * 100)}%`}
          >
            <i className="fa-solid fa-circle-half-stroke" aria-hidden />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={layer.opacity ?? 1}
              aria-label={`Opacity for ${layer.label}`}
              onChange={e => layer.onOpacityChange?.(Number(e.target.value))}
            />
          </div>
        ) : null}
        {dropIndicatorAfter ? <div className="si-layer-tree__drop-line" aria-hidden /> : null}
      </div>
    );
  }

  const reorder =
    showReorder && lid && onMoveInStack ? (
      <div className="si-env-layer-reorder" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          className="si-env-layer-reorder__btn"
          title="Move up (draw on top)"
          aria-label="Move layer up"
          disabled={!layer.canMoveUp}
          onClick={() => onMoveInStack(lid, 1)}
        >
          <i className="fa-solid fa-chevron-up" aria-hidden />
        </button>
        <button
          type="button"
          className="si-env-layer-reorder__btn"
          title="Move down"
          aria-label="Move layer down"
          disabled={!layer.canMoveDown}
          onClick={() => onMoveInStack(lid, -1)}
        >
          <i className="fa-solid fa-chevron-down" aria-hidden />
        </button>
        <SiLayerTreeGrip
          draggable
          onDragStart={e => {
            e.stopPropagation();
            onDragHandleStart?.(lid);
            try {
              e.dataTransfer.setData('text/plain', lid);
              e.dataTransfer.effectAllowed = 'move';
            } catch {
              /* ignore */
            }
          }}
          onDragEnd={() => onDragHandleEnd?.()}
        />
      </div>
    ) : null;

  return (
    <div
      data-si-env-layer-options-root={layer.actionable && lid ? lid : undefined}
      className={`si-env-layer-item${layer.visible ? ' active' : ''}${!layer.toggleable ? ' static' : ''}${
        layer.actionable ? ' si-env-layer-item--actionable' : ''
      }${isDragging ? ' si-env-layer-item--dragging' : ''}`}
      onClick={layer.toggleable ? layer.onToggle : undefined}
      role={layer.toggleable ? 'button' : undefined}
      tabIndex={layer.toggleable ? 0 : -1}
      onKeyDown={
        layer.toggleable
          ? e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                layer.onToggle();
              }
            }
          : undefined
      }
      {...dragHandlers}
      title={layer.toggleable ? 'Click to toggle visibility' : layer.label}
    >
      <div className="si-env-layer-top">
        {reorder}
        <div className="si-env-layer-info">
          <span className="si-env-layer-name">{layer.label}</span>
          {layer.meta ? (
            <span className="si-env-layer-submeta">
              {layer.busy ? <i className="fa-solid fa-spinner fa-spin si-layer-tree__meta-spin" aria-hidden /> : null}
              {layer.meta}
            </span>
          ) : null}
        </div>
        <div className="si-env-layer-top-side">
          {layer.toggleable ? (
            <span className="si-env-layer-toggle" aria-hidden>
              <span className="si-env-layer-toggle-knob" />
            </span>
          ) : (
            <span className="si-env-layer-meta-static">always on</span>
          )}
          {layer.actionable && lid && onLayerOptionsMenuToggle ? (
            <div data-si-env-layer-options-anchor={lid}>
              <button
                type="button"
                className={`si-layer-tree__icon-btn si-layer-tree__icon-btn--menu${menuOpen ? ' si-layer-tree__icon-btn--active' : ''}`}
                title="Layer options"
                aria-label={`Options for ${layer.label}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={e => {
                  e.stopPropagation();
                  const opening = !menuOpen;
                  onLayerOptionsMenuToggle(
                    lid,
                    (e.currentTarget as HTMLElement).closest('[data-si-env-layer-options-anchor]'),
                    opening,
                  );
                }}
              >
                <i className="fa-solid fa-ellipsis" aria-hidden />
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {renderActions ?? null}
    </div>
  );
}
