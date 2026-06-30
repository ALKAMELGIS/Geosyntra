import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PIPELINE_STAGES,
  PRITHVI_CROP_CLASSES,
  type CropClassificationJob,
} from '../../../lib/siPrithviCropPipeline'
import { useMapOverlayIsolation } from '../useMapOverlayIsolation'
import './SiPrithviCropToolPanel.css'

const EARTH_RADIUS_M = 6378137

const toRad = (deg: number): number => (deg * Math.PI) / 180

/** Geodesic area (m²) of a single linear ring using the spherical-excess method. */
function ringAreaM2(ring: GeoJSON.Position[]): number {
  const n = ring.length
  if (n < 3) return 0
  let total = 0
  for (let i = 0; i < n; i++) {
    const [lng1, lat1] = ring[i]
    const [lng2, lat2] = ring[(i + 1) % n]
    total += toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)))
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2)
}

/** Total area of a Polygon/MultiPolygon in hectares (outer rings minus holes). */
function geometryAreaHectares(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
): number {
  if (!geom) return 0
  const polys: GeoJSON.Position[][][] =
    geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  let m2 = 0
  for (const rings of polys) {
    rings.forEach((ring, i) => {
      const a = ringAreaM2(ring)
      m2 += i === 0 ? a : -a
    })
  }
  return Math.max(0, m2) / 10000
}

/** Tabular hectare label with sensible precision and a unit suffix. */
function formatHectares(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value >= 100) return `${value.toFixed(0)} ha`
  if (value >= 10) return `${value.toFixed(1)} ha`
  return `${value.toFixed(2)} ha`
}

/** Fallback palette for classes the legend does not colour. */
const CHART_FALLBACK_COLORS = [
  '#1f7d5c',
  '#caa765',
  '#3f7fb0',
  '#a8443c',
  '#8e6fb0',
  '#cf8a3c',
  '#4fae8c',
  '#b0556f',
]

type CropStatRow = {
  key: string
  name: string
  pct: number
  areaHa: number | null
  color: string
}

export type SiPrithviCropToolPanelProps = {
  aoiGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  hasSelfInference: boolean
  season: { start: string; end: string }
  onSeasonChange: (season: { start: string; end: string }) => void
  job: CropClassificationJob | null
  isRunning: boolean
  onPickAoi: () => void
  onRunAoi: () => void
  onRunChip: (imageUrl: string) => void
  onCancel: () => void
  onAddToMap?: () => void
  onClose: () => void
}

function stageState(
  job: CropClassificationJob | null,
  stageStatus: string,
): 'idle' | 'active' | 'done' {
  if (!job) return 'idle'
  const order = ['fetching', 'preprocessing', 'inferring', 'done']
  const cur = order.indexOf(job.status)
  const me = order.indexOf(stageStatus)
  if (job.status === 'error') return cur >= me ? 'idle' : 'idle'
  if (cur < 0) return 'idle'
  if (me < cur) return 'done'
  if (me === cur) return job.status === 'done' ? 'done' : 'active'
  return 'idle'
}

export function SiPrithviCropToolPanel(props: SiPrithviCropToolPanelProps) {
  const {
    aoiGeometry,
    season,
    onSeasonChange,
    job,
    isRunning,
    onRunAoi,
    onCancel,
    onClose,
  } = props

  const isolation = useMapOverlayIsolation(true, { native: true })

  const hasAoi = Boolean(aoiGeometry)
  const result = job?.status === 'done' ? job.result : null
  const scenes = result?.scenes
  const prediction = result?.prediction
  const country = result?.country ?? null
  const classStats = result?.classStats ?? null
  const progressPct = Math.round((job?.progress ?? 0) * 100)

  const sceneTiles = useMemo(
    () => [
      { key: 'T1', src: scenes?.t1 ?? null },
      { key: 'T2', src: scenes?.t2 ?? null },
      { key: 'T3', src: scenes?.t3 ?? null },
      { key: 'Crop Type', src: prediction?.url ?? null },
    ],
    [scenes, prediction],
  )

  // Full palette (every class the model/profile can output) — only used to
  // resolve a stable colour per class. Never rendered directly.
  const paletteItems = useMemo(() => {
    if (result?.legend && result.legend.length) {
      return result.legend.map(c => ({ id: c.id, name: c.name, color: c.color }))
    }
    return PRITHVI_CROP_CLASSES.map(c => ({ id: c.id, name: c.name, color: c.color }))
  }, [result])

  /* ── Analysis results: shared data feeding all three tabs ─────────────── */
  const [activeResultTab, setActiveResultTab] = useState<'stats' | 'pie' | 'bar'>('stats')

  // AOI area drives the hectare conversion (class ha = AOI ha × pct/100, since
  // `pct` is the share of valid raster pixels inside the AOI). Keep the last
  // measured area so the figures survive a "Clear Drawing" that nulls the AOI.
  const liveAoiAreaHa = useMemo(() => geometryAreaHectares(aoiGeometry), [aoiGeometry])
  const stickyAoiAreaHaRef = useRef(0)
  if (liveAoiAreaHa > 0) stickyAoiAreaHaRef.current = liveAoiAreaHa
  const totalAreaHa = liveAoiAreaHa > 0 ? liveAoiAreaHa : stickyAoiAreaHaRef.current

  const colorByKey = useMemo(() => {
    const m = new Map<string, string>()
    paletteItems.forEach(c => {
      if (c.name) m.set(c.name.toLowerCase(), c.color)
      if (c.id != null) m.set(String(c.id), c.color)
    })
    return m
  }, [paletteItems])

  // Single source of truth: every tab renders from these rows.
  const statRows = useMemo<CropStatRow[]>(() => {
    if (!classStats || !classStats.length) return []
    return classStats.map((s, i) => {
      const color =
        (s.id != null ? colorByKey.get(String(s.id)) : undefined) ??
        colorByKey.get(s.name.toLowerCase()) ??
        CHART_FALLBACK_COLORS[i % CHART_FALLBACK_COLORS.length]
      const areaHa = totalAreaHa > 0 ? totalAreaHa * (s.pct / 100) : null
      return { key: s.id ?? s.name, name: s.name, pct: s.pct, areaHa, color }
    })
  }, [classStats, colorByKey, totalAreaHa])

  // Dynamic legend — after an analysis, show ONLY the classes the model actually
  // produced (from statRows). Before any result (or when the engine can't report
  // per-class stats), fall back to the full palette so users see what's possible.
  const legendItems = useMemo(() => {
    if (statRows.length) {
      return statRows.map(r => ({ id: r.key, name: r.name, color: r.color }))
    }
    return paletteItems.map(c => ({ id: c.id, name: c.name, color: c.color }))
  }, [statRows, paletteItems])

  // Reset to the Stats tab whenever a new analysis result arrives.
  const resultKey = prediction?.url ?? null
  useEffect(() => {
    if (resultKey) setActiveResultTab('stats')
  }, [resultKey])

  const pctSum = useMemo(() => statRows.reduce((a, r) => a + r.pct, 0) || 1, [statRows])
  const maxAreaHa = useMemo(
    () => statRows.reduce((a, r) => Math.max(a, r.areaHa ?? 0), 0) || 1,
    [statRows],
  )

  // Pre-compute SVG pie slice paths (donut) from the shared rows.
  const pieSlices = useMemo(() => {
    const cx = 70
    const cy = 70
    const r = 64
    let acc = -Math.PI / 2
    return statRows.map(row => {
      const frac = row.pct / pctSum
      const a0 = acc
      const a1 = acc + frac * Math.PI * 2
      acc = a1
      const x0 = cx + r * Math.cos(a0)
      const y0 = cy + r * Math.sin(a0)
      const x1 = cx + r * Math.cos(a1)
      const y1 = cy + r * Math.sin(a1)
      const largeArc = a1 - a0 > Math.PI ? 1 : 0
      // A near-full single slice needs an explicit full-circle path.
      const d =
        frac >= 0.999
          ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`
          : `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`
      return { key: row.key, d, color: row.color }
    })
  }, [statRows, pctSum])

  const hasStats = statRows.length > 0

  return (
    <div className="prithvi-tool" dir="auto" {...isolation}>
      <header className="prithvi-tool__head">
        <span className="prithvi-tool__brand-icon" aria-hidden>
          <i className="fa-solid fa-wheat-awn" />
        </span>
        <span className="prithvi-tool__brand">
          <span className="prithvi-tool__title">Crop Classification</span>
          <span className="prithvi-tool__sub">AOI → Sentinel/HLS → Prithvi AI</span>
        </span>
        <button
          type="button"
          className="prithvi-tool__close"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      <div className="prithvi-tool__section">
        <div className="prithvi-tool__dates">
          <label>
            <span>Season start</span>
            <input
              type="date"
              value={season.start}
              max={season.end}
              disabled={isRunning}
              onChange={e => onSeasonChange({ ...season, start: e.target.value })}
            />
          </label>
          <label>
            <span>Season end</span>
            <input
              type="date"
              value={season.end}
              min={season.start}
              disabled={isRunning}
              onChange={e => onSeasonChange({ ...season, end: e.target.value })}
            />
          </label>
        </div>

        <div className="prithvi-tool__row">
          {isRunning ? (
            <button type="button" className="prithvi-tool__btn is-danger" onClick={onCancel}>
              <i className="fa-solid fa-stop" aria-hidden /> Cancel
            </button>
          ) : (
            <button
              type="button"
              className="prithvi-tool__btn is-primary"
              onClick={onRunAoi}
              disabled={!hasAoi}
            >
              <i className="fa-solid fa-play" aria-hidden /> Run classification
            </button>
          )}
        </div>
        {!hasAoi ? (
          <div className="prithvi-tool__hint">Draw or select an AOI on the map to enable classification.</div>
        ) : null}
      </div>

      {/* Pipeline stepper */}
      {job ? (
        <div className="prithvi-tool__pipeline">
          <div className="prithvi-tool__progress">
            <div className="prithvi-tool__progress-bar" style={{ width: `${progressPct}%` }} />
          </div>
          <ol className="prithvi-tool__steps">
            {PIPELINE_STAGES.map(stage => {
              const st = stageState(job, stage.status)
              return (
                <li key={stage.status} className={`prithvi-tool__step is-${st}`}>
                  <span className="prithvi-tool__step-dot">
                    {st === 'done' ? <i className="fa-solid fa-check" aria-hidden /> : null}
                    {st === 'active' ? <i className="fa-solid fa-spinner fa-spin" aria-hidden /> : null}
                  </span>
                  <span className="prithvi-tool__step-label">{stage.label}</span>
                </li>
              )
            })}
          </ol>
          <div className={`prithvi-tool__status is-${job.status}`}>{job.message}</div>
          {job.status === 'error' && job.error ? (
            <div className="prithvi-tool__error">{job.error}</div>
          ) : null}
        </div>
      ) : null}

      {/* Results */}
      {result ? (
        <div className="prithvi-tool__results">
          {country ? (
            <div className="prithvi-tool__country">
              <i className="fa-solid fa-location-dot" aria-hidden />{' '}
              Detected country: <strong>{country.name}</strong>
              {country.code ? ` (${country.code})` : ''}
              <span className="prithvi-tool__country-src"> · {country.source}</span>
            </div>
          ) : null}
          <div className="prithvi-tool__grid">
            {sceneTiles.map(tile => (
              <figure key={tile.key} className="prithvi-tool__tile">
                {tile.src ? (
                  <img src={tile.src} alt={tile.key} loading="lazy" />
                ) : (
                  <div className="prithvi-tool__tile-empty">
                    <i className="fa-regular fa-image" aria-hidden />
                  </div>
                )}
                <figcaption>{tile.key}</figcaption>
              </figure>
            ))}
          </div>
          {hasStats ? (
            <div className="prithvi-tool__analysis">
              <div className="prithvi-tool__stats-title">Crop composition</div>
              <div className="prithvi-tool__tabs" role="tablist" aria-label="Analysis result views">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeResultTab === 'stats'}
                  className={`prithvi-tool__tab${activeResultTab === 'stats' ? ' is-active' : ''}`}
                  onClick={() => setActiveResultTab('stats')}
                >
                  <i className="fa-solid fa-table-list" aria-hidden /> Stats
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeResultTab === 'pie'}
                  className={`prithvi-tool__tab${activeResultTab === 'pie' ? ' is-active' : ''}`}
                  onClick={() => setActiveResultTab('pie')}
                >
                  <i className="fa-solid fa-chart-pie" aria-hidden /> Pie
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeResultTab === 'bar'}
                  className={`prithvi-tool__tab${activeResultTab === 'bar' ? ' is-active' : ''}`}
                  onClick={() => setActiveResultTab('bar')}
                >
                  <i className="fa-solid fa-chart-column" aria-hidden /> Bar (ha)
                </button>
              </div>

              {/* Stats tab — raw numbers: class, % and area (ha). */}
              {activeResultTab === 'stats' ? (
                <div className="prithvi-tool__tabpanel" role="tabpanel">
                  <div className="prithvi-tool__stats-table">
                    <div className="prithvi-tool__stats-th">
                      <span>Class</span>
                      <span className="prithvi-tool__stats-num">%</span>
                      <span className="prithvi-tool__stats-num">Area (ha)</span>
                    </div>
                    {statRows.map(row => (
                      <div key={row.key} className="prithvi-tool__stats-tr">
                        <span className="prithvi-tool__stats-name">
                          <span className="prithvi-tool__swatch" style={{ background: row.color }} />
                          {row.name}
                        </span>
                        <span className="prithvi-tool__stats-num prithvi-tool__stats-pct">
                          {row.pct}%
                        </span>
                        <span className="prithvi-tool__stats-num prithvi-tool__stats-area">
                          {formatHectares(row.areaHa)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {totalAreaHa > 0 ? (
                    <div className="prithvi-tool__stats-total">
                      AOI area: <strong>{formatHectares(totalAreaHa)}</strong>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Pie tab — percentage distribution of land-cover classes. */}
              {activeResultTab === 'pie' ? (
                <div className="prithvi-tool__tabpanel" role="tabpanel">
                  <div className="prithvi-tool__pie-wrap">
                    <svg
                      className="prithvi-tool__pie"
                      viewBox="0 0 140 140"
                      role="img"
                      aria-label="Crop composition by percentage"
                    >
                      {pieSlices.map(slice => (
                        <path key={slice.key} d={slice.d} fill={slice.color} stroke="rgba(0,0,0,0.35)" strokeWidth="0.5" />
                      ))}
                      <circle cx="70" cy="70" r="30" fill="rgba(10,12,16,0.92)" />
                    </svg>
                    <ul className="prithvi-tool__chart-legend">
                      {statRows.map(row => (
                        <li key={row.key}>
                          <span className="prithvi-tool__swatch" style={{ background: row.color }} />
                          <span className="prithvi-tool__chart-legend-name">{row.name}</span>
                          <span className="prithvi-tool__stats-pct">{row.pct}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              {/* Bar tab — area in hectares per class (NOT percentages). */}
              {activeResultTab === 'bar' ? (
                <div className="prithvi-tool__tabpanel" role="tabpanel">
                  {totalAreaHa > 0 ? (
                    <ul className="prithvi-tool__bars">
                      {statRows.map(row => (
                        <li key={row.key} className="prithvi-tool__bar-row">
                          <div className="prithvi-tool__bar-head">
                            <span className="prithvi-tool__bar-name">
                              <span className="prithvi-tool__swatch" style={{ background: row.color }} />
                              {row.name}
                            </span>
                            <span className="prithvi-tool__bar-value">{formatHectares(row.areaHa)}</span>
                          </div>
                          <div className="prithvi-tool__bar-track">
                            <div
                              className="prithvi-tool__bar-fill"
                              style={{
                                width: `${Math.max(2, ((row.areaHa ?? 0) / maxAreaHa) * 100)}%`,
                                background: row.color,
                              }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="prithvi-tool__hint">
                      Hectare values need an AOI to measure area. Draw or select an AOI and re-run.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Legend */}
      <div className="prithvi-tool__legend">
        <div className="prithvi-tool__legend-title">
          {statRows.length ? 'Detected crop types' : 'Model prediction legend'}
        </div>
        <ul className="prithvi-tool__legend-list">
          {legendItems.map(c => (
            <li key={String(c.id)}>
              <span className="prithvi-tool__swatch" style={{ background: c.color }} />
              {c.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default SiPrithviCropToolPanel
