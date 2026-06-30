import { useCallback, useMemo } from 'react'
import { useMapOverlayIsolation } from '../useMapOverlayIsolation'
import { useDraggablePanel } from '../useDraggablePanel'
import {
  FLOOD_DB_MAX,
  FLOOD_DB_MIN,
  type FloodResult,
} from '../../../lib/floodSar/floodEngine'
import type { SiFloodLayerKey } from '../utils/siFloodMapLayers'
import './FloodSarPanel.css'

export type FloodSarPanelProps = {
  hasAoi: boolean
  isRunning: boolean
  progress: number
  error: string | null
  result: FloodResult | null
  thresholdDb: number
  onThresholdChange: (db: number) => void
  preEventDate: string
  postEventDate: string
  onPreEventDateChange: (date: string) => void
  onPostEventDateChange: (date: string) => void
  layerVis: Record<SiFloodLayerKey, boolean>
  onToggleLayer: (key: SiFloodLayerKey) => void
  onRun: () => void
  onCancel: () => void
  onClose: () => void
  onZoomToLayer: () => void
  onExportGeoJson: () => void
}

const OUTPUT_ROWS: Array<{ key: SiFloodLayerKey; label: string; swatch: string }> = [
  { key: 'flood', label: 'Flood extent · raster', swatch: '#38bdf8' },
  { key: 'boundaries', label: 'Flood boundaries · vector', swatch: '#ff5a5f' },
  { key: 'change', label: 'Change detection · raster', swatch: '#ef4444' },
]

/** Compact donut from the surface-composition slices (no animation / no flashing). */
function CompositionDonut({
  slices,
  centerPct,
}: {
  slices: Array<{ key: string; color: string; pct: number }>
  centerPct: number
}) {
  const r = 26
  const c = 2 * Math.PI * r
  let offset = 0
  const total = slices.reduce((s, x) => s + x.pct, 0) || 100
  return (
    <svg className="flood-tool__donut" viewBox="0 0 72 72" role="img" aria-label="Flood composition">
      <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
      {slices.map(s => {
        const len = (s.pct / total) * c
        const dash = `${len} ${c - len}`
        const el = (
          <circle
            key={s.key}
            cx="36"
            cy="36"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="10"
            strokeDasharray={dash}
            strokeDashoffset={-offset}
            transform="rotate(-90 36 36)"
          />
        )
        offset += len
        return el
      })}
      <text className="flood-tool__donut-pct" x="36" y="34" textAnchor="middle">
        {centerPct.toFixed(2)}%
      </text>
      <text className="flood-tool__donut-cap" x="36" y="46" textAnchor="middle">
        FLOOD
      </text>
    </svg>
  )
}

const fmtHa = (ha: number): string =>
  ha >= 1000 ? `${(ha / 1000).toFixed(1)}k` : ha.toFixed(2)

/**
 * Flood Monitoring (SAR-Based) — luxury obsidian-glass cockpit panel. Run-only,
 * AOI-gated. Mirrors the platform's contextual-analysis tool aesthetic: small
 * black-glass icon, muted off-white type, restrained accents, no flashing.
 */
export function FloodSarPanel({
  hasAoi,
  isRunning,
  progress,
  error,
  result,
  thresholdDb,
  onThresholdChange,
  preEventDate,
  postEventDate,
  onPreEventDateChange,
  onPostEventDateChange,
  layerVis,
  onToggleLayer,
  onRun,
  onCancel,
  onClose,
  onZoomToLayer,
  onExportGeoJson,
}: FloodSarPanelProps) {
  const { ref: isolationRef, ...isolation } = useMapOverlayIsolation(true, { native: true })
  const drag = useDraggablePanel()
  const setRoot = useCallback(
    (node: HTMLDivElement | null) => {
      drag.panelRef(node)
      isolationRef?.(node)
    },
    [drag, isolationRef],
  )
  const st = result?.stats
  const composition = useMemo(() => st?.composition ?? [], [st])

  return (
    <div className="flood-tool" dir="auto" ref={setRoot} style={drag.style} {...isolation}>
      <header className="flood-tool__head" title="Drag to move" {...drag.handleProps}>
        <span className="flood-tool__grip" aria-hidden>
          <i className="fa-solid fa-grip-vertical" />
        </span>
        <span className="flood-tool__brand-icon" aria-hidden>
          <i className="fa-solid fa-house-flood-water" />
        </span>
        <span className="flood-tool__brand">
          <span className="flood-tool__title">Flood Mapping</span>
          <span className="flood-tool__sub">Sentinel-1 · C-band SAR</span>
        </span>
        <button
          type="button"
          className="flood-tool__close"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      {/* Step 1 — event window */}
      <section className="flood-tool__card">
        <div className="flood-tool__card-head">
          <span className="flood-tool__step-num">1</span>
          <span className="flood-tool__card-title">Event window</span>
          <span className="flood-tool__tag">Change detection</span>
        </div>
        <div className="flood-tool__dates">
          <label className="flood-tool__date">
            <span className="flood-tool__date-lbl">Pre-event · baseline</span>
            <input
              type="date"
              value={preEventDate}
              onChange={e => onPreEventDateChange(e.target.value)}
            />
          </label>
          <label className="flood-tool__date">
            <span className="flood-tool__date-lbl">Post-event · flood</span>
            <input
              type="date"
              value={postEventDate}
              onChange={e => onPostEventDateChange(e.target.value)}
            />
          </label>
        </div>
      </section>

      {/* Step 2 — water sensitivity */}
      <section className="flood-tool__card">
        <div className="flood-tool__card-head">
          <span className="flood-tool__step-num">2</span>
          <span className="flood-tool__card-title">Water sensitivity</span>
          <span className="flood-tool__db">{thresholdDb} dB</span>
        </div>
        <input
          className="flood-tool__slider"
          type="range"
          min={FLOOD_DB_MIN}
          max={FLOOD_DB_MAX}
          step={1}
          value={thresholdDb}
          onChange={e => onThresholdChange(Number(e.target.value))}
        />
        <div className="flood-tool__slider-cap">
          <span>Conservative</span>
          <span>VV backscatter ≤</span>
          <span>Aggressive</span>
        </div>
      </section>

      {/* Run / status */}
      {isRunning ? (
        <>
          <button type="button" className="flood-tool__btn is-danger" onClick={onCancel}>
            <i className="fa-solid fa-stop" aria-hidden /> Cancel analysis
          </button>
          <div className="flood-tool__scan" role="progressbar">
            <span
              className="flood-tool__scan-bar"
              style={{ width: `${Math.max(6, Math.round(progress * 100))}%` }}
            />
          </div>
        </>
      ) : result ? (
        <div className="flood-tool__done">
          <span className="flood-tool__done-lbl">
            <i className="fa-solid fa-circle-check" aria-hidden /> Analysis complete
          </span>
          <button type="button" className="flood-tool__rerun" onClick={onRun} disabled={!hasAoi}>
            <i className="fa-solid fa-rotate-right" aria-hidden /> Re-run
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="flood-tool__btn is-primary"
          onClick={onRun}
          disabled={!hasAoi}
          title={hasAoi ? 'Run SAR flood analysis on the AOI' : 'Draw or select an AOI first'}
        >
          <i className="fa-solid fa-play" aria-hidden /> Run flood analysis
        </button>
      )}

      {!hasAoi ? (
        <div className="flood-tool__hint">
          <i className="fa-solid fa-circle-info" aria-hidden /> Requires an active AOI — draw or
          select one on the map.
        </div>
      ) : null}
      {error ? <div className="flood-tool__err">{error}</div> : null}

      {/* Results */}
      {st ? (
        <>
          <div className="flood-tool__hero">
            <div className="flood-tool__hero-main">
              <span className="flood-tool__hero-lbl">Flooded area</span>
              <span className="flood-tool__hero-val">
                {fmtHa(st.floodedAreaHa)} <em>ha</em>
              </span>
            </div>
            <div className="flood-tool__hero-pct">
              <span className="flood-tool__hero-pctval">{st.floodPctOfAoi}%</span>
              <span className="flood-tool__hero-pctcap">of AOI inundated</span>
            </div>
          </div>

          <div className="flood-tool__pair">
            <div className="flood-tool__stat">
              <span className="flood-tool__stat-lbl">Post-event water</span>
              <span className="flood-tool__stat-val">{fmtHa(st.postWaterHa)} ha</span>
            </div>
            <div className="flood-tool__stat">
              <span className="flood-tool__stat-lbl">Pre-event water</span>
              <span className="flood-tool__stat-val">{fmtHa(st.preWaterHa)} ha</span>
            </div>
          </div>

          <section className="flood-tool__card">
            <div className="flood-tool__card-head">
              <span className="flood-tool__card-title">Surface composition</span>
            </div>
            <div className="flood-tool__comp">
              <CompositionDonut
                slices={composition.map(s => ({ key: s.key, color: s.color, pct: s.pct }))}
                centerPct={st.floodPctOfAoi}
              />
              <ul className="flood-tool__legend">
                {composition.map(s => (
                  <li key={s.key}>
                    <span className="flood-tool__legend-dot" style={{ background: s.color }} />
                    <span className="flood-tool__legend-lbl">{s.label}</span>
                    <span className="flood-tool__legend-pct">{s.pct}%</span>
                    <span className="flood-tool__legend-bar">
                      <span style={{ width: `${Math.min(100, s.pct)}%`, background: s.color }} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <div className="flood-tool__chips">
            <span className="flood-tool__chip">
              <i className="fa-regular fa-clock" aria-hidden /> {result?.preEventDate} →{' '}
              {result?.postEventDate}
            </span>
            <span className="flood-tool__chip">VV ≤ {st.thresholdDb} dB</span>
            <span className="flood-tool__chip">
              {st.gridWidth}×{st.gridHeight}px
            </span>
          </div>

          <section className="flood-tool__card">
            <div className="flood-tool__card-head">
              <span className="flood-tool__card-title">Output layers</span>
            </div>
            <ul className="flood-tool__outputs">
              {OUTPUT_ROWS.map(row => (
                <li key={row.key}>
                  <span className="flood-tool__out-dot" style={{ background: row.swatch }} />
                  <span className="flood-tool__out-lbl">{row.label}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={layerVis[row.key]}
                    aria-label={`${layerVis[row.key] ? 'Hide' : 'Show'} ${row.label}`}
                    className={`flood-tool__switch${layerVis[row.key] ? ' is-on' : ''}`}
                    onClick={() => onToggleLayer(row.key)}
                  >
                    <span className="flood-tool__switch-knob" />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <div className="flood-tool__foot">
            <button type="button" className="flood-tool__foot-btn" onClick={onZoomToLayer}>
              <i className="fa-solid fa-magnifying-glass-location" aria-hidden /> Zoom to layer
            </button>
            <button type="button" className="flood-tool__foot-btn" onClick={onExportGeoJson}>
              <i className="fa-solid fa-download" aria-hidden /> Export GeoJSON
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

export default FloodSarPanel
