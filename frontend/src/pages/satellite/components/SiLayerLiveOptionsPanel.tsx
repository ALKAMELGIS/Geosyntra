import { SiFieldAnalysisLayerVisibility } from './fields/SiFieldAnalysisLayerVisibility'
import { SiWmsSymbologyToolbarIconButton } from './SiWmsSymbologyPopup'
import './SiLayerLiveOptionsPanel.css'

export type SiLayerLiveOptionsPanelProps = {
  layerOptions: Array<{ id: string; label: string }>
  layerValue: string
  onLayerChange: (layerId: string) => void
  loadingLayers?: boolean
  providerLabel?: string
  visible: boolean
  visibilityLabel: string
  visibilityReadOnly?: boolean
  onVisibleChange: (next: boolean) => void
  imageryDate: string
  onImageryDateChange: (isoDate: string) => void
  symbologyDisabled?: boolean
  symbologyPressed?: boolean
  onSymbologyClick?: () => void
  onOpenRemoteSensing?: () => void
}

export function SiLayerLiveOptionsPanel({
  layerOptions,
  layerValue,
  onLayerChange,
  loadingLayers = false,
  providerLabel = 'Sentinel Hub',
  visible,
  visibilityLabel,
  visibilityReadOnly = false,
  onVisibleChange,
  imageryDate,
  onImageryDateChange,
  symbologyDisabled = false,
  symbologyPressed = false,
  onSymbologyClick,
  onOpenRemoteSensing,
}: SiLayerLiveOptionsPanelProps) {
  const activeLabel = layerOptions.find(o => o.id === layerValue)?.label?.trim() || layerValue

  return (
    <section className="si-layer-live-options" aria-labelledby="si-layer-live-options-title">
      <div className="si-layer-live-options__head">
        <div>
          <h3 id="si-layer-live-options-title" className="si-env-chart-title">
            Layer Live
          </h3>
          <p className="si-layer-live-options__sub">
            Sentinel Hub index raster on the map — layer, date, visibility, and symbology.
          </p>
        </div>
        {onOpenRemoteSensing ? (
          <button type="button" className="si-layer-live-options__link" onClick={onOpenRemoteSensing}>
            Remote Sensing
            <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden />
          </button>
        ) : null}
      </div>

      <label className="si-layer-live-options__field">
        <span className="si-layer-live-options__label">Index layer</span>
        <select
          className="si-layer-live-options__select"
          value={loadingLayers ? '' : layerValue}
          disabled={loadingLayers || layerOptions.length === 0}
          aria-label="Layer Live index layer"
          onChange={e => onLayerChange(e.target.value)}
        >
          {loadingLayers ? (
            <option value="">{`Loading ${providerLabel} layers…`}</option>
          ) : layerOptions.length === 0 ? (
            <option value="">No layers — check API tokens</option>
          ) : (
            layerOptions.map(layer => (
              <option key={layer.id} value={layer.id}>
                {layer.label}
              </option>
            ))
          )}
        </select>
        {activeLabel ? (
          <span className="si-layer-live-options__active" title={activeLabel}>
            Active: {activeLabel}
          </span>
        ) : null}
      </label>

      <label className="si-layer-live-options__field">
        <span className="si-layer-live-options__label">Imagery date</span>
        <input
          type="date"
          className="si-layer-live-options__input"
          value={imageryDate}
          aria-label="Layer Live imagery date"
          onChange={e => {
            const v = e.target.value
            if (v) onImageryDateChange(v)
          }}
        />
      </label>

      {layerOptions.length > 0 && (!loadingLayers || visibilityReadOnly) ? (
        <SiFieldAnalysisLayerVisibility
          visible={visible}
          layerLabel={visibilityLabel}
          readOnly={visibilityReadOnly}
          onVisibleChange={onVisibleChange}
        />
      ) : null}

      <div className="si-layer-live-options__actions">
        <SiWmsSymbologyToolbarIconButton
          variant="embedded"
          disabled={symbologyDisabled}
          pressed={symbologyPressed}
          onClick={() => onSymbologyClick?.()}
        />
        <span className="si-layer-live-options__actions-hint">Classified ramp & opacity for the active index.</span>
      </div>
    </section>
  )
}
