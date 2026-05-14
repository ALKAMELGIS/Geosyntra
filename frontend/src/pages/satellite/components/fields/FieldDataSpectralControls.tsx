/**
 * Field Data · spectral / scene controls (Satellite Intelligence)
 *
 * Same controls and order as Remote Sensing (imagery date, layer, AOI
 * upload, time-series range) but wired only through props — no shared
 * state with the RS card. Rendered as a flat vertical stack (no inner
 * summary card wrapper).
 */

import './FieldDataSpectralControls.css'

export type FieldDataSpectralLayerOption = { id: string; label: string }

export type FieldDataSpectralControlsProps = {
  imageryDateIso: string
  onImageryDateIsoChange: (iso: string) => void
  layerOptions: FieldDataSpectralLayerOption[]
  layerSelectValue: string
  onLayerSelectChange: (layerId: string) => void
  layersLoading: boolean
  showLayerOnMap: boolean
  onShowLayerOnMapChange: (next: boolean) => void
  resolvedLayerLabel: string
  timeSeriesStart: string
  timeSeriesEnd: string
  onTimeSeriesStartChange: (v: string) => void
  onTimeSeriesEndChange: (v: string) => void
  onAddDataSourceClick: () => void
}

export default function FieldDataSpectralControls({
  imageryDateIso,
  onImageryDateIsoChange,
  layerOptions,
  layerSelectValue,
  onLayerSelectChange,
  layersLoading,
  showLayerOnMap,
  onShowLayerOnMapChange,
  resolvedLayerLabel,
  timeSeriesStart,
  timeSeriesEnd,
  onTimeSeriesStartChange,
  onTimeSeriesEndChange,
  onAddDataSourceClick,
}: FieldDataSpectralControlsProps) {
  return (
    <div className="gs-field-data-spectral-root" aria-label="Field Data scene and imagery">
      <div className="si-field-analysis-section">
        <div className="si-field-analysis-kicker">Imagery date</div>
        <label className="si-field-analysis-field">
          <input
            type="date"
            value={imageryDateIso}
            onChange={e => {
              const v = e.target.value
              if (v) onImageryDateIsoChange(v)
            }}
            aria-label="Field Data imagery date"
          />
        </label>
      </div>

      <div className="si-field-analysis-section">
        <label className="si-field-analysis-field si-field-analysis-field--labeled">
          <span className="si-field-analysis-label">Layer</span>
          <select
            className="si-field-analysis-select"
            value={layersLoading ? '' : layerSelectValue}
            onChange={e => onLayerSelectChange(e.target.value)}
            disabled={layersLoading}
            aria-label="Field Data layer"
          >
            {layersLoading ? (
              <option value="">Loading Sentinel Hub layers…</option>
            ) : layerOptions.length === 0 ? (
              <option value="">No Sentinel Hub WMS layers — check API tokens / instance ID.</option>
            ) : (
              layerOptions.map(layer => (
                <option key={layer.id} value={layer.id}>
                  {layer.label}
                </option>
              ))
            )}
          </select>
        </label>
        {!layersLoading && layerOptions.length > 0 ? (
          <div className="si-field-analysis-layer-visibility">
            <label className="si-field-analysis-checkbox-row">
              <input
                type="checkbox"
                checked={showLayerOnMap}
                onChange={e => onShowLayerOnMapChange(e.target.checked)}
                aria-label="Field Data layer visibility preference"
              />
              <span>
                Show <strong>{resolvedLayerLabel}</strong> on map
              </span>
            </label>
          </div>
        ) : null}
        <button
          type="button"
          className="si-field-analysis-aoi-upload-btn"
          onClick={onAddDataSourceClick}
          title="Add Data Source (AOI): SHP (.zip), KML/KMZ, GeoJSON — saves to Field Data only"
        >
          <i className="fa-solid fa-cloud-arrow-up" aria-hidden />
          <span>Add Data Source (AOI)</span>
        </button>
      </div>

      <div className="si-field-analysis-section">
        <div className="si-field-analysis-kicker">Time-series analysis</div>
        <div className="si-field-analysis-date-row">
          <label className="si-field-analysis-field">
            <span className="si-field-analysis-label">Start</span>
            <input
              type="date"
              value={timeSeriesStart}
              onChange={e => onTimeSeriesStartChange(e.target.value)}
              aria-label="Field Data time series start"
            />
          </label>
          <label className="si-field-analysis-field">
            <span className="si-field-analysis-label">End</span>
            <input
              type="date"
              value={timeSeriesEnd}
              onChange={e => onTimeSeriesEndChange(e.target.value)}
              aria-label="Field Data time series end"
            />
          </label>
        </div>
      </div>
    </div>
  )
}
