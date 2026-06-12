import { createPortal } from 'react-dom'
import type { SymbologyCategoryStyle } from '../layerTypes'
import { useDraggablePanel } from '../hooks/useDraggablePanel'
import { SiCategorySymbolStylePanel } from './SiCategorySymbolStylePanel'
import './SiSymbolStyleFloatingPanel.css'

export type SiSymbolStyleFloatingPanelProps = {
  categoryLabel: string
  valueKey: string
  style: SymbologyCategoryStyle
  geometryKind: 'polygon' | 'line' | 'point'
  previewCornerRadius?: number
  mapZoom?: number
  onChange: (next: SymbologyCategoryStyle) => void
  onApply: () => void
  onClose: () => void
}

export function SiSymbolStyleFloatingPanel({
  categoryLabel,
  style,
  geometryKind,
  previewCornerRadius,
  mapZoom,
  onChange,
  onApply,
  onClose,
}: SiSymbolStyleFloatingPanelProps) {
  const { panelStyle, onHeaderPointerDown } = useDraggablePanel({
    storageKey: 'geosyntra-si-symbol-style-panel-pos-v1',
    panelWidth: 340,
    panelHeight: 560,
  })

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="si-symbol-float"
      style={panelStyle}
      role="presentation"
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="si-symbol-float__chrome">
        <div
          className="si-symbol-float__drag-bar"
          onPointerDown={onHeaderPointerDown}
          title="Drag to move"
        >
          <i className="fa-solid fa-grip-vertical" aria-hidden />
          <span>Symbol style</span>
          <span className="si-symbol-float__drag-hint">Drag</span>
        </div>
        <div className="si-symbol-float__body">
          <SiCategorySymbolStylePanel
            categoryLabel={categoryLabel}
            style={style}
            geometryKind={geometryKind}
            previewCornerRadius={previewCornerRadius}
            mapZoom={mapZoom}
            onChange={onChange}
            onClose={onClose}
            embedded
          />
        </div>
        <footer className="si-symbol-float__foot">
          <button type="button" className="si-symbol-float__btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="si-symbol-float__btn si-symbol-float__btn--primary" onClick={onApply}>
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
