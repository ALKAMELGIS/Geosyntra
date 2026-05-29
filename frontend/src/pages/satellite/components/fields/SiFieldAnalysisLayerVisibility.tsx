import { memo } from 'react'
import { cn } from '../../../../lib/utils'

export type SiFieldAnalysisLayerVisibilityProps = {
  visible: boolean
  layerLabel: string
  /** Timeline play: display-only, no toggle or checkbox-driven re-layout. */
  readOnly?: boolean
  onVisibleChange?: (next: boolean) => void
}

function SiFieldAnalysisLayerVisibilityInner({
  visible,
  layerLabel,
  readOnly = false,
  onVisibleChange,
}: SiFieldAnalysisLayerVisibilityProps) {
  if (readOnly) {
    return (
      <div
        className="si-field-analysis-layer-visibility si-field-analysis-layer-visibility--readonly"
        aria-live="off"
        data-si-timeline-layer-visibility-viewer
      >
        <div
          className="si-field-analysis-checkbox-row si-field-analysis-checkbox-row--readonly"
          role="status"
          aria-label={
            visible
              ? `${layerLabel} visible on map during timeline playback`
              : `${layerLabel} hidden on map during timeline playback`
          }
        >
          <i
            className={cn('fa-solid', visible ? 'fa-eye' : 'fa-eye-slash')}
            aria-hidden
          />
          <span>
            {visible ? 'Showing' : 'Hidden'}{' '}
            <strong>{layerLabel}</strong> on map
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="si-field-analysis-layer-visibility">
      <label className="si-field-analysis-checkbox-row">
        <input
          type="checkbox"
          checked={visible}
          onChange={e => onVisibleChange?.(e.target.checked)}
          aria-label="Show imagery layer on map"
        />
        <span>
          Show <strong>{layerLabel}</strong> on map
        </span>
      </label>
    </div>
  )
}

/** Layer visibility preference UI — decoupled from timeline tick updates. */
export const SiFieldAnalysisLayerVisibility = memo(SiFieldAnalysisLayerVisibilityInner)
