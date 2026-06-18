import { useEffect, useRef, useState } from 'react'
import type { RouteMapProfile } from '../../../lib/graphHopperRouting'
import type { LaAnalysisReport, LaImpedanceAttribute, LaProblemType } from '../utils/siLocationAllocationTypes'
import { formatLaCost } from '../utils/siLocationAllocationEngine'
import type { LaCostMatrix } from '../utils/siLocationAllocationEngine'
import {
  LA_SYMBOLOGY_COLOR_PRESETS,
  type LaAllocationSymbology,
  type LaLineStyle,
} from '../utils/siLocationAllocationSymbology'
import type {
  LaServiceAreaRingStat,
  LaServiceAreaSettings,
  LaServiceAreaTravelMode,
} from '../utils/siLocationAllocationServiceAreas'
import './SiRouteMapLocAllocSection.css'

export type LocAllocPickTarget = 'facility' | 'demand' | null
export type LocAllocImportTarget = 'facility' | 'demand'

const PROBLEM_MODES: { id: LaProblemType; label: string; icon: string; title: string }[] = [
  {
    id: 'MINIMIZE_IMPEDANCE',
    label: 'Min cost',
    icon: 'fa-route',
    title: 'Minimize impedance — reduce total travel cost',
  },
  {
    id: 'MAXIMIZE_COVERAGE',
    label: 'Coverage',
    icon: 'fa-bullseye',
    title: 'Maximize coverage — serve most demand within cutoff',
  },
  {
    id: 'MAXIMIZE_CAPACITY',
    label: 'Capacitated',
    icon: 'fa-gauge-high',
    title: 'Maximize capacitated coverage — facility capacity limits',
  },
  {
    id: 'MINIMIZE_FACILITIES',
    label: 'Min sites',
    icon: 'fa-minimize',
    title: 'Minimize facilities — fewest sites for coverage',
  },
]

export type LaLayerImportOption = { id: string; name: string; pointCount: number }

export type SiRouteMapLocAllocSectionProps = {
  facilitiesText: string
  demandText: string
  onFacilitiesTextChange: (v: string) => void
  onDemandTextChange: (v: string) => void
  facilityCount: number
  demandCount: number
  pickTarget: LocAllocPickTarget
  onPickTargetChange: (t: LocAllocPickTarget) => void
  problemType: LaProblemType
  onProblemTypeChange: (v: LaProblemType) => void
  facilitiesToLocate: number
  onFacilitiesToLocateChange: (v: number) => void
  impedanceAttribute: LaImpedanceAttribute
  onImpedanceAttributeChange: (v: LaImpedanceAttribute) => void
  profile: RouteMapProfile
  cutoffMinutes: number
  onCutoffMinutesChange: (v: number) => void
  running: boolean
  error: string | null
  report: LaAnalysisReport | null
  costMatrix: LaCostMatrix | null
  onRunAnalysis: () => void
  onClearResults: () => void
  canClear: boolean
  symbology: LaAllocationSymbology
  onSymbologyChange: (next: LaAllocationSymbology) => void
  selectedLinkId: string | null
  onSelectedLinkIdChange: (id: string | null) => void
  allocationLinkSummaries?: Array<{ linkId: string; label: string }>
  importableLayers?: LaLayerImportOption[]
  onImportFile?: (file: File, target: LocAllocImportTarget) => void
  onImportFromLayer?: (layerId: string, target: LocAllocImportTarget) => void
  serviceAreaSettings: LaServiceAreaSettings
  onServiceAreaSettingsChange: (next: LaServiceAreaSettings) => void
  serviceAreaStats?: LaServiceAreaRingStat[]
  serviceAreaBuilding?: boolean
  serviceAreaServedCount?: number
}

export function SiRouteMapLocAllocSection({
  facilitiesText,
  demandText,
  onFacilitiesTextChange,
  onDemandTextChange,
  facilityCount,
  demandCount,
  pickTarget,
  onPickTargetChange,
  problemType,
  onProblemTypeChange,
  facilitiesToLocate,
  onFacilitiesToLocateChange,
  impedanceAttribute,
  onImpedanceAttributeChange,
  profile,
  cutoffMinutes,
  onCutoffMinutesChange,
  running,
  error,
  report,
  costMatrix,
  onRunAnalysis,
  onClearResults,
  canClear,
  symbology,
  onSymbologyChange,
  selectedLinkId,
  onSelectedLinkIdChange,
  allocationLinkSummaries = [],
  importableLayers = [],
  onImportFile,
  onImportFromLayer,
  serviceAreaSettings,
  onServiceAreaSettingsChange,
  serviceAreaStats = [],
  serviceAreaBuilding = false,
  serviceAreaServedCount = 0,
}: SiRouteMapLocAllocSectionProps) {
  const facFileRef = useRef<HTMLInputElement>(null)
  const demFileRef = useRef<HTMLInputElement>(null)
  const layerSelectRef = useRef<HTMLSelectElement>(null)
  const [stylePopoverOpen, setStylePopoverOpen] = useState(false)

  const hasResultsStyle = Boolean(report || allocationLinkSummaries.length > 0)

  const reportKey = report
    ? `${report.totalDemandServed}|${report.coveragePercent}|${report.averageTravelCost}|${report.maxTravelCost}`
    : ''

  useEffect(() => {
    if (!hasResultsStyle) setStylePopoverOpen(false)
  }, [hasResultsStyle])

  useEffect(() => {
    setStylePopoverOpen(false)
  }, [reportKey])

  useEffect(() => {
    if (running) setStylePopoverOpen(false)
  }, [running])

  const clampSymNum = (v: number, min: number, max: number, step: number) => {
    const snapped = Math.round(v / step) * step
    return Math.min(max, Math.max(min, snapped))
  }

  const patchSym = (patch: Partial<LaAllocationSymbology>) =>
    onSymbologyChange({ ...symbology, ...patch })

  const patchServiceArea = (patch: Partial<LaServiceAreaSettings>) =>
    onServiceAreaSettingsChange({ ...serviceAreaSettings, ...patch })

  const patchServiceAreaSym = (patch: Partial<LaServiceAreaSettings['symbology']>) =>
    patchServiceArea({ symbology: { ...serviceAreaSettings.symbology, ...patch } })

  const toggleTimePreset = (key: '5' | '10' | '15' | '30') =>
    patchServiceArea({
      timePresets: { ...serviceAreaSettings.timePresets, [key]: !serviceAreaSettings.timePresets[key] },
    })

  const toggleDistancePreset = (key: '1' | '3' | '5' | '10') =>
    patchServiceArea({
      distancePresets: {
        ...serviceAreaSettings.distancePresets,
        [key]: !serviceAreaSettings.distancePresets[key],
      },
    })

  const travelModes: { id: LaServiceAreaTravelMode; label: string; icon: string }[] = [
    { id: 'car', label: 'Driving', icon: 'fa-car' },
    { id: 'foot', label: 'Walking', icon: 'fa-person-walking' },
    { id: 'bike', label: 'Cycling', icon: 'fa-bicycle' },
  ]

  const triggerFile = (target: LocAllocImportTarget) => {
    if (target === 'facility') facFileRef.current?.click()
    else demFileRef.current?.click()
  }

  const handleFile = (target: LocAllocImportTarget) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file && onImportFile) onImportFile(file, target)
  }

  const importFromSelectedLayer = (target: LocAllocImportTarget) => {
    const layerId = layerSelectRef.current?.value
    if (layerId && onImportFromLayer) onImportFromLayer(layerId, target)
  }

  return (
    <>
      <p className="si-route-map-panel__section-label">Data input</p>
      <div className="si-la-section__counts">
        <button
          type="button"
          className={`si-la-section__count${pickTarget === 'facility' ? ' is-active' : ''}`}
          disabled={running}
          onClick={() => onPickTargetChange(pickTarget === 'facility' ? null : 'facility')}
          title="Draw on map — click to add facilities"
        >
          <i className="fa-solid fa-building" aria-hidden />
          Facility <strong>({facilityCount})</strong>
        </button>
        <button
          type="button"
          className={`si-la-section__count${pickTarget === 'demand' ? ' is-active' : ''}`}
          disabled={running}
          onClick={() => onPickTargetChange(pickTarget === 'demand' ? null : 'demand')}
          title="Draw on map — click to add demand points"
        >
          <i className="fa-solid fa-location-dot" aria-hidden />
          Demand <strong>({demandCount})</strong>
        </button>
      </div>

      {pickTarget ? (
        <p className="si-la-section__hint">
          {pickTarget === 'facility'
            ? 'Click the map to place facilities — or pick from a visible point layer.'
            : 'Click the map to place demand points — or pick from a visible point layer.'}
        </p>
      ) : null}

      <div className="si-la-section__inputs">
        <button
          type="button"
          className="si-la-section__input-btn"
          disabled={running || !onImportFile}
          onClick={() => triggerFile('facility')}
        >
          <i className="fa-solid fa-file-csv" aria-hidden />
          CSV → Fac
        </button>
        <button
          type="button"
          className="si-la-section__input-btn"
          disabled={running || !onImportFile}
          onClick={() => triggerFile('demand')}
        >
          <i className="fa-solid fa-file-csv" aria-hidden />
          CSV → Dem
        </button>
        <button
          type="button"
          className="si-la-section__input-btn"
          disabled={running || !onImportFile}
          onClick={() => triggerFile('facility')}
          title="Shapefile (.zip) or GeoJSON"
        >
          <i className="fa-solid fa-map" aria-hidden />
          SHP → Fac
        </button>
        <button
          type="button"
          className="si-la-section__input-btn"
          disabled={running || !onImportFile}
          onClick={() => triggerFile('demand')}
          title="Shapefile (.zip) or GeoJSON"
        >
          <i className="fa-solid fa-map" aria-hidden />
          SHP → Dem
        </button>
      </div>

      <input
        ref={facFileRef}
        type="file"
        accept=".csv,.zip,.geojson,.json,.shp"
        hidden
        onChange={handleFile('facility')}
      />
      <input
        ref={demFileRef}
        type="file"
        accept=".csv,.zip,.geojson,.json,.shp"
        hidden
        onChange={handleFile('demand')}
      />

      {importableLayers.length > 0 && onImportFromLayer ? (
        <div className="si-la-section__layer-row">
          <select ref={layerSelectRef} disabled={running} defaultValue="">
            <option value="" disabled>
              Select layer…
            </option>
            {importableLayers.map(l => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.pointCount})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="si-la-section__input-btn"
            disabled={running}
            onClick={() => importFromSelectedLayer('facility')}
          >
            → Fac
          </button>
          <button
            type="button"
            className="si-la-section__input-btn"
            disabled={running}
            onClick={() => importFromSelectedLayer('demand')}
          >
            → Dem
          </button>
        </div>
      ) : null}

      <p className="si-route-map-panel__section-label">Model</p>
      <div className="si-route-map-panel__modes" role="group" aria-label="Location-allocation model">
        {PROBLEM_MODES.map(m => (
          <button
            key={m.id}
            type="button"
            className={`si-route-map-panel__mode${problemType === m.id ? ' is-active' : ''}`}
            disabled={running}
            title={m.title}
            onClick={() => onProblemTypeChange(m.id)}
          >
            <i className={`fa-solid ${m.icon}`} aria-hidden />
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      <div className="si-route-map-panel__pref-row">
        <span className="si-route-map-panel__pref-label">Cost</span>
        <select
          className="si-route-map-panel__select"
          value={impedanceAttribute}
          disabled={running}
          onChange={e => onImpedanceAttributeChange(e.target.value as LaImpedanceAttribute)}
        >
          <option value="TravelTime">Travel time</option>
          <option value="Distance">Distance</option>
        </select>
        <label className="si-route-map-panel__check-inline">
          Cutoff
          <input
            type="number"
            className="si-route-map-panel__input si-route-map-panel__input--inline"
            min={0}
            step={1}
            value={cutoffMinutes}
            disabled={running}
            onChange={e => onCutoffMinutesChange(Math.max(0, Number(e.target.value) || 0))}
            title="Max travel minutes (0 = no limit)"
          />
          min
        </label>
      </div>

      <div className="si-route-map-panel__pref-row">
        <span className="si-route-map-panel__pref-label">New sites</span>
        <input
          type="number"
          className="si-route-map-panel__input si-route-map-panel__input--inline"
          min={0}
          value={facilitiesToLocate}
          disabled={running}
          onChange={e => onFacilitiesToLocateChange(Math.max(0, Number(e.target.value) || 0))}
        />
        <span className="si-route-map-panel__pref-hint">to locate ({profile})</span>
      </div>

      <details className="si-la-advanced">
        <summary className="si-la-advanced__summary">
          <i className="fa-solid fa-circle-nodes" aria-hidden />
          <span>Advanced Analysis Options</span>
        </summary>
        <div className="si-la-advanced__body">
          <div className="si-la-advanced__toggle-row">
            <button
              type="button"
              className={`si-la-advanced__icon-toggle${serviceAreaSettings.enabled ? ' is-on' : ''}`}
              title={serviceAreaSettings.enabled ? 'Disable service areas' : 'Enable service areas'}
              aria-label="Toggle service areas"
              aria-pressed={serviceAreaSettings.enabled}
              onClick={() => patchServiceArea({ enabled: !serviceAreaSettings.enabled })}
            >
              <i className="fa-solid fa-draw-polygon" aria-hidden />
            </button>
            <div className="si-la-advanced__toggle-copy">
              <strong>Service Areas</strong>
              <span>{serviceAreaSettings.enabled ? 'Enabled' : 'Disabled (default)'}</span>
            </div>
            {serviceAreaBuilding ? (
              <i className="fa-solid fa-spinner fa-spin si-la-advanced__spinner" aria-hidden />
            ) : null}
          </div>

          {serviceAreaSettings.enabled ? (
            <>
              <div className="si-la-advanced__segmented" role="group" aria-label="Service area measure">
                <button
                  type="button"
                  className={`si-la-advanced__seg${serviceAreaSettings.measure === 'time' ? ' is-active' : ''}`}
                  onClick={() => patchServiceArea({ measure: 'time' })}
                >
                  Travel time
                </button>
                <button
                  type="button"
                  className={`si-la-advanced__seg${serviceAreaSettings.measure === 'distance' ? ' is-active' : ''}`}
                  onClick={() => patchServiceArea({ measure: 'distance' })}
                >
                  Travel distance
                </button>
              </div>

              {serviceAreaSettings.measure === 'time' ? (
                <div className="si-la-advanced__chips" role="group" aria-label="Travel time rings">
                  {(['5', '10', '15', '30'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      className={`si-la-advanced__chip${serviceAreaSettings.timePresets[m] ? ' is-active' : ''}`}
                      onClick={() => toggleTimePreset(m)}
                    >
                      {m} min
                    </button>
                  ))}
                  <label className="si-la-advanced__custom">
                    <input
                      type="checkbox"
                      checked={serviceAreaSettings.useCustomTime}
                      onChange={e => patchServiceArea({ useCustomTime: e.target.checked })}
                    />
                    Custom
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={serviceAreaSettings.customTimeMinutes}
                      disabled={!serviceAreaSettings.useCustomTime}
                      onChange={e =>
                        patchServiceArea({ customTimeMinutes: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                    min
                  </label>
                </div>
              ) : (
                <div className="si-la-advanced__chips" role="group" aria-label="Travel distance rings">
                  {(['1', '3', '5', '10'] as const).map(km => (
                    <button
                      key={km}
                      type="button"
                      className={`si-la-advanced__chip${serviceAreaSettings.distancePresets[km] ? ' is-active' : ''}`}
                      onClick={() => toggleDistancePreset(km)}
                    >
                      {km} km
                    </button>
                  ))}
                  <label className="si-la-advanced__custom">
                    <input
                      type="checkbox"
                      checked={serviceAreaSettings.useCustomDistance}
                      onChange={e => patchServiceArea({ useCustomDistance: e.target.checked })}
                    />
                    Custom
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={serviceAreaSettings.customDistanceKm}
                      disabled={!serviceAreaSettings.useCustomDistance}
                      onChange={e =>
                        patchServiceArea({ customDistanceKm: Math.max(0.1, Number(e.target.value) || 0.1) })
                      }
                    />
                    km
                  </label>
                </div>
              )}

              <div className="si-la-advanced__modes" role="group" aria-label="Service area travel mode">
                {travelModes.map(mode => (
                  <button
                    key={mode.id}
                    type="button"
                    title={mode.label}
                    aria-label={mode.label}
                    className={`si-la-advanced__mode${serviceAreaSettings.travelMode === mode.id ? ' is-active' : ''}`}
                    onClick={() => patchServiceArea({ travelMode: mode.id })}
                  >
                    <i className={`fa-solid ${mode.icon}`} aria-hidden />
                  </button>
                ))}
              </div>

              <div className="si-la-advanced__style">
                <span className="si-la-advanced__style-k">Area style</span>
                <label className="si-la-advanced__style-field" title="Fill color">
                  <input
                    type="color"
                    value={serviceAreaSettings.symbology.fillColor}
                    onChange={e => patchServiceAreaSym({ fillColor: e.target.value })}
                  />
                  Fill
                </label>
                <label className="si-la-advanced__style-field">
                  α
                  <input
                    type="range"
                    min={0.04}
                    max={0.45}
                    step={0.01}
                    value={serviceAreaSettings.symbology.fillOpacity}
                    onChange={e => patchServiceAreaSym({ fillOpacity: Number(e.target.value) })}
                  />
                </label>
                <label className="si-la-advanced__style-field" title="Border color">
                  <input
                    type="color"
                    value={serviceAreaSettings.symbology.borderColor}
                    onChange={e => patchServiceAreaSym({ borderColor: e.target.value })}
                  />
                  Border
                </label>
                <label className="si-la-advanced__style-field">
                  W
                  <input
                    type="range"
                    min={0.5}
                    max={4}
                    step={0.25}
                    value={serviceAreaSettings.symbology.borderWidth}
                    onChange={e => patchServiceAreaSym({ borderWidth: Number(e.target.value) })}
                  />
                </label>
              </div>

              {serviceAreaStats.length > 0 ? (
                <div className="si-la-advanced__stats">
                  <div className="si-la-advanced__stat-row si-la-advanced__stat-row--summary">
                    <span>Served demand points</span>
                    <strong>
                      {serviceAreaServedCount}/{demandCount}
                    </strong>
                  </div>
                  <span className="si-la-advanced__stats-k">Coverage by ring</span>
                  {serviceAreaStats.map(stat => (
                    <div key={stat.ringId} className="si-la-advanced__stat-row">
                      <span>
                        {stat.facilityLabel} · {stat.ringLabel}
                      </span>
                      <strong>
                        {stat.servedCount}/{stat.totalDemand} ({stat.coveragePercent.toFixed(0)}%)
                      </strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </details>

      {hasResultsStyle ? (
        <div className="si-la-style-dock">
          <div className="si-la-style-dock__bar">
            <button
              type="button"
              className={`si-la-style-dock__trigger${stylePopoverOpen ? ' is-active' : ''}`}
              title="Results style — line color, glow, and link highlight"
              aria-label="Results style"
              aria-expanded={stylePopoverOpen}
              aria-haspopup="dialog"
              onClick={() => setStylePopoverOpen(open => !open)}
            >
              <i className="fa-solid fa-palette" aria-hidden />
            </button>
            {allocationLinkSummaries.length > 0 ? (
              <span className="si-la-style-dock__meta">
                {allocationLinkSummaries.length} link{allocationLinkSummaries.length === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="si-la-style-dock__meta">Results style</span>
            )}
          </div>

          {stylePopoverOpen ? (
            <div className="si-la-style-popover" role="dialog" aria-label="Results style">
              <div className="si-la-style-popover__head">
                <span className="si-la-style-popover__title">
                  <i className="fa-solid fa-sliders" aria-hidden />
                  Results style
                </span>
                <button
                  type="button"
                  className="si-la-style-popover__close"
                  aria-label="Close results style"
                  onClick={() => setStylePopoverOpen(false)}
                >
                  <i className="fa-solid fa-xmark" aria-hidden />
                </button>
              </div>

              <div className="si-la-style-popover__block">
                <div className="si-la-style-popover__block-head">
                  <i className="fa-solid fa-minus" aria-hidden />
                  <span>Allocation line</span>
                </div>
                <div className="si-la-style-popover__controls">
                  <label className="si-la-style-popover__color" title="Line color">
                    <input
                      type="color"
                      value={symbology.lineColor}
                      onChange={e => patchSym({ lineColor: e.target.value })}
                    />
                    <span>Color</span>
                  </label>
                  <label className="si-la-style-popover__slider">
                    <span>Width</span>
                    <div className="si-la-style-popover__slider-row">
                      <input
                        type="range"
                        min={3}
                        max={5}
                        step={0.5}
                        value={symbology.lineWidth}
                        onChange={e => patchSym({ lineWidth: Number(e.target.value) })}
                      />
                      <input
                        type="number"
                        className="si-la-style-popover__num"
                        min={3}
                        max={5}
                        step={0.5}
                        value={symbology.lineWidth}
                        onChange={e =>
                          patchSym({ lineWidth: clampSymNum(Number(e.target.value), 3, 5, 0.5) })
                        }
                        aria-label="Line width in pixels"
                      />
                      <span className="si-la-style-popover__unit">px</span>
                    </div>
                  </label>
                  <label className="si-la-style-popover__slider">
                    <span>Opacity</span>
                    <input
                      type="range"
                      min={0.3}
                      max={1}
                      step={0.05}
                      value={symbology.lineOpacity}
                      onChange={e => patchSym({ lineOpacity: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <div className="si-la-style-popover__pills" role="group" aria-label="Line style">
                  {(['solid', 'dashed', 'dotted'] as LaLineStyle[]).map(style => (
                    <button
                      key={style}
                      type="button"
                      className={`si-la-style-popover__pill${symbology.lineStyle === style ? ' is-active' : ''}`}
                      onClick={() => patchSym({ lineStyle: style })}
                    >
                      {style === 'solid' ? 'Solid' : style === 'dashed' ? 'Dash' : 'Dot'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="si-la-style-popover__block">
                <div className="si-la-style-popover__block-head">
                  <i className="fa-solid fa-wand-magic-sparkles" aria-hidden />
                  <span>Glow</span>
                </div>
                <div className="si-la-style-popover__controls">
                  <label className="si-la-style-popover__color" title="Glow color">
                    <input
                      type="color"
                      value={symbology.glowColor}
                      onChange={e => patchSym({ glowColor: e.target.value })}
                    />
                    <span>Color</span>
                  </label>
                  <label className="si-la-style-popover__slider si-la-style-popover__slider--wide">
                    <span>Intensity</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={symbology.glowIntensity}
                      onChange={e => patchSym({ glowIntensity: Number(e.target.value) })}
                    />
                  </label>
                </div>
              </div>

              <div className="si-la-style-popover__block">
                <div className="si-la-style-popover__block-head">
                  <i className="fa-solid fa-font" aria-hidden />
                  <span>Map labels</span>
                </div>
                <label className="si-la-style-popover__slider si-la-style-popover__slider--wide">
                  <span>Font size</span>
                  <div className="si-la-style-popover__slider-row">
                    <input
                      type="range"
                      min={8}
                      max={18}
                      step={1}
                      value={symbology.labelFontSize}
                      onChange={e => patchSym({ labelFontSize: Number(e.target.value) })}
                    />
                    <input
                      type="number"
                      className="si-la-style-popover__num"
                      min={8}
                      max={18}
                      step={1}
                      value={symbology.labelFontSize}
                      onChange={e =>
                        patchSym({ labelFontSize: clampSymNum(Number(e.target.value), 8, 18, 1) })
                      }
                      aria-label="Label font size in pixels"
                    />
                    <span className="si-la-style-popover__unit">px</span>
                  </div>
                </label>
              </div>

              <div className="si-la-style-popover__presets" role="group" aria-label="Color presets">
                {LA_SYMBOLOGY_COLOR_PRESETS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className={`si-la-style-popover__swatch${symbology.lineColor === p.color ? ' is-active' : ''}`}
                    style={{ background: p.color }}
                    title={p.label}
                    aria-label={p.label}
                    onClick={() => patchSym({ lineColor: p.color })}
                  />
                ))}
              </div>

              {allocationLinkSummaries.length > 0 ? (
                <div className="si-la-style-popover__links">
                  <span className="si-la-style-popover__links-k">Highlight link</span>
                  {allocationLinkSummaries.map(link => (
                    <button
                      key={link.linkId}
                      type="button"
                      className={`si-la-style-popover__link${selectedLinkId === link.linkId ? ' is-active' : ''}`}
                      onClick={() =>
                        onSelectedLinkIdChange(selectedLinkId === link.linkId ? null : link.linkId)
                      }
                    >
                      {link.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <details className="si-route-map-panel__details">
        <summary>Coordinates (optional paste)</summary>
        <label className="si-route-map-panel__field">
          <span className="si-route-map-panel__field-k">Facilities</span>
          <textarea
            className="si-route-map-panel__textarea si-route-map-panel__textarea--compact"
            value={facilitiesText}
            onChange={e => onFacilitiesTextChange(e.target.value)}
            spellCheck={false}
            rows={2}
            placeholder="lat, lng per line"
          />
        </label>
        <label className="si-route-map-panel__field">
          <span className="si-route-map-panel__field-k">Demand</span>
          <textarea
            className="si-route-map-panel__textarea si-route-map-panel__textarea--compact"
            value={demandText}
            onChange={e => onDemandTextChange(e.target.value)}
            spellCheck={false}
            rows={2}
            placeholder="lat, lng per line"
          />
        </label>
      </details>

      {error ? <p className="si-route-map-panel__error">{error}</p> : null}

      {report ? (
        <div className="si-route-map-panel__metrics si-route-map-panel__metrics--la">
          <div>
            <span>Coverage</span>
            <strong>{report.coveragePercent.toFixed(1)}%</strong>
          </div>
          <div>
            <span>Served</span>
            <strong>
              {report.totalDemandServed.toFixed(0)}/{report.totalDemandWeight.toFixed(0)}
            </strong>
          </div>
          <div>
            <span>Avg</span>
            <strong>{costMatrix ? formatLaCost(report.averageTravelCost, costMatrix) : '—'}</strong>
          </div>
          <div>
            <span>Max</span>
            <strong>{costMatrix ? formatLaCost(report.maxTravelCost, costMatrix) : '—'}</strong>
          </div>
        </div>
      ) : null}

      <div className="si-route-map-panel__secondary-row">
        <button
          type="button"
          className="si-route-map-panel__secondary"
          disabled={running || !canClear}
          onClick={onClearResults}
        >
          <i className="fa-solid fa-eraser" aria-hidden />
          Clear
        </button>
      </div>

      <button
        type="button"
        className="si-route-map-panel__primary"
        disabled={running || demandCount < 1}
        onClick={onRunAnalysis}
      >
        {running ? (
          <>
            <i className="fa-solid fa-spinner fa-spin" aria-hidden />
            Running allocation…
          </>
        ) : (
          <>
            <i className="fa-solid fa-play" aria-hidden />
            Run analysis
          </>
        )}
      </button>
    </>
  )
}
