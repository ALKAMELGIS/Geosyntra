import { useEffect, useRef } from 'react';
import './SiDrawContextMenu.css';

export type SiDrawContextMenuProps = {
  open: boolean;
  x: number;
  y: number;
  featureLabel: string;
  editDrawActive: boolean;
  geometryLocked: boolean;
  onClose: () => void;
  onEditDraw: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onZoomTo: () => void;
  onDelete: () => void;
  onExport: () => void;
  onToggleLock: () => void;
};

export function SiDrawContextMenu({
  open,
  x,
  y,
  featureLabel,
  editDrawActive,
  geometryLocked,
  onClose,
  onEditDraw,
  onRename,
  onDuplicate,
  onZoomTo,
  onDelete,
  onExport,
  onToggleLock,
}: SiDrawContextMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointer = (e: PointerEvent) => {
      const el = rootRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  const clampedX = Math.min(Math.max(8, x), typeof window !== 'undefined' ? window.innerWidth - 200 : x);
  const clampedY = Math.min(Math.max(8, y), typeof window !== 'undefined' ? window.innerHeight - 280 : y);

  return (
    <div
      ref={rootRef}
      className="si-draw-ctx-menu"
      role="menu"
      aria-label="Drawing context menu"
      style={{ left: clampedX, top: clampedY }}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="si-draw-ctx-menu__head">
        <span className="si-draw-ctx-menu__swatch" aria-hidden />
        <p className="si-draw-ctx-menu__title">Drawing</p>
      </div>
      <span className="si-draw-ctx-menu__label" title={featureLabel}>
        {featureLabel}
      </span>
      <p className="si-draw-ctx-menu__mode-hint">
        {geometryLocked
          ? 'Geometry locked — unlock to edit or move.'
          : editDrawActive
            ? 'Edit mode — vertices active.'
            : 'Select to choose · Move tool to translate · Shift+right-click for options.'}
      </p>
      <button
        type="button"
        className="si-draw-ctx-menu__item si-draw-ctx-menu__item--primary"
        role="menuitem"
        disabled={geometryLocked}
        onClick={() => {
          onEditDraw();
          onClose();
        }}
      >
        <i className="fa-solid fa-pen-ruler" aria-hidden />
        <span>{editDrawActive ? 'Exit Edit Draw' : 'Edit Draw'}</span>
      </button>
      <div className="si-draw-ctx-menu__sep" role="separator" />
      <button type="button" className="si-draw-ctx-menu__item" role="menuitem" onClick={() => { onRename(); onClose(); }}>
        <i className="fa-solid fa-pen" aria-hidden />
        <span>Rename</span>
      </button>
      <button type="button" className="si-draw-ctx-menu__item" role="menuitem" onClick={() => { onDuplicate(); onClose(); }}>
        <i className="fa-solid fa-clone" aria-hidden />
        <span>Duplicate</span>
      </button>
      <button type="button" className="si-draw-ctx-menu__item" role="menuitem" onClick={() => { onZoomTo(); onClose(); }}>
        <i className="fa-solid fa-magnifying-glass-plus" aria-hidden />
        <span>Zoom To</span>
      </button>
      <button type="button" className="si-draw-ctx-menu__item" role="menuitem" onClick={() => { onExport(); onClose(); }}>
        <i className="fa-solid fa-file-export" aria-hidden />
        <span>Export</span>
      </button>
      <button
        type="button"
        className={`si-draw-ctx-menu__item${geometryLocked ? ' si-draw-ctx-menu__item--on' : ''}`}
        role="menuitem"
        onClick={() => {
          onToggleLock();
          onClose();
        }}
      >
        <i className={`fa-solid ${geometryLocked ? 'fa-lock' : 'fa-lock-open'}`} aria-hidden />
        <span>{geometryLocked ? 'Unlock Geometry' : 'Lock Geometry'}</span>
      </button>
      <div className="si-draw-ctx-menu__sep" role="separator" />
      <button
        type="button"
        className="si-draw-ctx-menu__item si-draw-ctx-menu__item--danger"
        role="menuitem"
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        <i className="fa-solid fa-trash-can" aria-hidden />
        <span>Delete</span>
      </button>
    </div>
  );
}
