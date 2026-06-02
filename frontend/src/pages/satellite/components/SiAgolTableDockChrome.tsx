import type { PointerEvent } from 'react';
import './SiAgolTableDockChrome.css';

export type SiAgolTableDockChromeProps = {
  layerLabel: string;
  collapsed: boolean;
  resizing?: boolean;
  activePreset?: 'compact' | 'quarter' | 'half' | 'custom';
  onClose: () => void;
  onResizeStart: (e: PointerEvent<HTMLDivElement>) => void;
  onResizeDoubleClick: () => void;
  onCompact: () => void;
  onQuarter: () => void;
  onHalf: () => void;
  onToggleCollapse: () => void;
};

/** AGOL-style top chrome: layer tab + resize grip + window presets. */
export function SiAgolTableDockChrome({
  layerLabel,
  collapsed,
  resizing,
  activePreset,
  onClose,
  onResizeStart,
  onResizeDoubleClick,
  onCompact,
  onQuarter,
  onHalf,
  onToggleCollapse,
}: SiAgolTableDockChromeProps) {
  return (
    <div
      className={`si-agol-dock-chrome${collapsed ? ' si-agol-dock-chrome--collapsed' : ''}${resizing ? ' si-agol-dock-chrome--resizing' : ''}`}
      role="toolbar"
      aria-label="Attribute table window"
    >
      <div
        className="si-agol-dock-chrome__resize-rail"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Drag to resize table height"
        title="Drag up or down to resize"
        onPointerDown={onResizeStart}
        onDoubleClick={onResizeDoubleClick}
      >
        <span className="si-agol-dock-chrome__grip-bars" aria-hidden />
        <span className="si-agol-dock-chrome__grip-label">Resize</span>
      </div>
      <div className="si-agol-dock-chrome__row">
      <div className="si-agol-dock-chrome__tab" id="si-layer-action-title">
        <i className="fa-solid fa-table-cells" aria-hidden />
        <span title={layerLabel}>{layerLabel}</span>
      </div>
      <div className="si-agol-dock-chrome__win">
        <button
          type="button"
          className={`si-agol-dock-chrome__win-btn${activePreset === 'compact' ? ' is-active' : ''}`}
          title="Compact height (~16% screen)"
          aria-pressed={activePreset === 'compact'}
          onClick={e => {
            e.stopPropagation();
            onCompact();
          }}
        >
          S
        </button>
        <button
          type="button"
          className={`si-agol-dock-chrome__win-btn${activePreset === 'quarter' ? ' is-active' : ''}`}
          title="Quarter screen height"
          aria-pressed={activePreset === 'quarter'}
          onClick={e => {
            e.stopPropagation();
            onQuarter();
          }}
        >
          ¼
        </button>
        <button
          type="button"
          className={`si-agol-dock-chrome__win-btn${activePreset === 'half' ? ' is-active' : ''}`}
          title="Half screen height"
          aria-pressed={activePreset === 'half'}
          onClick={e => {
            e.stopPropagation();
            onHalf();
          }}
        >
          ½
        </button>
        <button
          type="button"
          className="si-agol-dock-chrome__win-btn"
          title={collapsed ? 'Expand table' : 'Collapse table'}
          aria-label={collapsed ? 'Expand table' : 'Collapse table'}
          onClick={onToggleCollapse}
        >
          <i className={`fa-solid fa-chevron-${collapsed ? 'up' : 'down'}`} aria-hidden />
        </button>
        <button type="button" className="si-agol-dock-chrome__win-btn si-agol-dock-chrome__win-btn--close" title="Close table" aria-label="Close table" onClick={onClose}>
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </div>
      </div>
    </div>
  );
}
