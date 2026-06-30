import { useMemo, useState } from 'react'
import { useMapOverlayIsolation } from '../useMapOverlayIsolation'
import './SiAnalyticsDashboard.css'

export type DashboardMetric = { label: string; value: string; sub?: string }

/** One category slice — the SAME object feeds both the pie and the bar chart. */
export type DashboardSlice = {
  label: string
  /** Share of the whole (0–100). */
  pct: number
  /** Area in hectares (drives the bar chart when present). */
  areaHa?: number
  color: string
}

export type AnalysisCardId = 'crop' | 'ndvi' | 'hydro' | 'raster'

export type AnalysisCard = {
  id: AnalysisCardId
  title: string
  icon: string
  /** Accent colour (neon) for the card chrome. */
  accent: string
  updatedAt: number
  metrics: DashboardMetric[]
  slices: DashboardSlice[]
  /** When true, the bar chart shows hectares; otherwise percentages. */
  barInHectares?: boolean
  note?: string
}

export type SiAnalyticsDashboardProps = {
  open: boolean
  cards: AnalysisCard[]
  onClose: () => void
}

function PieChart({ slices, size = 96 }: { slices: DashboardSlice[]; size?: number }) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 4
  const total = slices.reduce((a, s) => a + Math.max(0, s.pct), 0) || 1
  let acc = -Math.PI / 2
  const paths = slices.map(s => {
    const frac = Math.max(0, s.pct) / total
    const a0 = acc
    const a1 = acc + frac * Math.PI * 2
    acc = a1
    const x0 = cx + r * Math.cos(a0)
    const y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    const large = a1 - a0 > Math.PI ? 1 : 0
    const d =
      frac >= 0.999
        ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`
        : `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`
    return { d, color: s.color, key: s.label }
  })
  return (
    <svg className="si-adash-pie" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Composition pie chart">
      {paths.map(p => (
        <path key={p.key} d={p.d} fill={p.color} stroke="rgba(0,0,0,0.4)" strokeWidth="0.5" />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.46} fill="rgba(8,10,13,0.92)" />
    </svg>
  )
}

function DashboardCard({ card }: { card: AnalysisCard }) {
  const [view, setView] = useState<'pie' | 'bar'>('pie')
  const maxHa = useMemo(
    () => card.slices.reduce((a, s) => Math.max(a, s.areaHa ?? 0), 0) || 1,
    [card.slices],
  )
  const showHa = card.barInHectares && card.slices.some(s => typeof s.areaHa === 'number')

  return (
    <article
      className="si-adash-card"
      style={{ ['--adash-accent' as string]: card.accent }}
    >
      <header className="si-adash-card__head">
        <span className="si-adash-card__icon" aria-hidden>
          <i className={card.icon} />
        </span>
        <span className="si-adash-card__titlewrap">
          <span className="si-adash-card__title">{card.title}</span>
          <span className="si-adash-card__live">
            <span className="si-adash-card__dot" /> live
          </span>
        </span>
        {card.slices.length ? (
          <span className="si-adash-card__viewtoggle" role="tablist" aria-label="Chart view">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'pie'}
              className={view === 'pie' ? 'is-on' : ''}
              onClick={() => setView('pie')}
              title="Pie"
            >
              <i className="fa-solid fa-chart-pie" aria-hidden />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'bar'}
              className={view === 'bar' ? 'is-on' : ''}
              onClick={() => setView('bar')}
              title={showHa ? 'Bar (ha)' : 'Bar (%)'}
            >
              <i className="fa-solid fa-chart-column" aria-hidden />
            </button>
          </span>
        ) : null}
      </header>

      <div className="si-adash-card__metrics">
        {card.metrics.map(m => (
          <div key={m.label} className="si-adash-metric">
            <span className="si-adash-metric__value">{m.value}</span>
            <span className="si-adash-metric__label">{m.label}</span>
            {m.sub ? <span className="si-adash-metric__sub">{m.sub}</span> : null}
          </div>
        ))}
      </div>

      {card.slices.length ? (
        <div className="si-adash-card__chart">
          {view === 'pie' ? (
            <div className="si-adash-pie-wrap">
              <PieChart slices={card.slices} />
              <ul className="si-adash-legend">
                {card.slices.slice(0, 6).map(s => (
                  <li key={s.label}>
                    <span className="si-adash-swatch" style={{ background: s.color }} />
                    <span className="si-adash-legend__name">{s.label}</span>
                    <span className="si-adash-legend__pct">{s.pct.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ul className="si-adash-bars">
              {card.slices.slice(0, 7).map(s => {
                const val = showHa ? s.areaHa ?? 0 : s.pct
                const w = showHa ? (val / maxHa) * 100 : Math.min(100, s.pct)
                return (
                  <li key={s.label} className="si-adash-bar">
                    <span className="si-adash-bar__name" title={s.label}>{s.label}</span>
                    <span className="si-adash-bar__track">
                      <span
                        className="si-adash-bar__fill"
                        style={{ width: `${Math.max(2, w)}%`, background: s.color }}
                      />
                    </span>
                    <span className="si-adash-bar__val">
                      {showHa ? `${val.toFixed(val >= 100 ? 0 : 1)} ha` : `${s.pct.toFixed(1)}%`}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}

      {card.note ? <p className="si-adash-card__note">{card.note}</p> : null}
    </article>
  )
}

/**
 * Embeddable analytics body — the SAME live result cards used by the standalone
 * dashboard, rendered as a vertical stack so they can live inside the unified
 * Hydro cockpit panel (Analytics tab) with the panel's own chrome around them.
 */
export function SiAnalyticsCardList({ cards }: { cards: AnalysisCard[] }) {
  if (!cards.length) {
    return (
      <div className="si-adash__empty si-adash__empty--panel">
        <i className="fa-solid fa-wave-square" aria-hidden />
        <span>Run an analysis (Crop, NDVI, Hydro, or Raster) — results stream in here.</span>
      </div>
    )
  }
  return (
    <div className="si-adash__stack">
      {cards.map(card => (
        <DashboardCard key={card.id} card={card} />
      ))}
    </div>
  )
}

export function SiAnalyticsDashboard({ open, cards, onClose }: SiAnalyticsDashboardProps) {
  const isolation = useMapOverlayIsolation(open, { native: true })
  if (!open) return null
  return (
    <section className="si-adash" aria-label="Analysis statistics dashboard" {...isolation}>
      <header className="si-adash__bar">
        <span className="si-adash__brand">
          <i className="fa-solid fa-gauge-high" aria-hidden />
          <span className="si-adash__brand-text">
            <span className="si-adash__title">Intelligence Dashboard</span>
            <span className="si-adash__sub">Live analytics across every analysis</span>
          </span>
        </span>
        <span className="si-adash__count">{cards.length} active</span>
        <button type="button" className="si-adash__close" onClick={onClose} aria-label="Hide dashboard" title="Hide dashboard">
          <i className="fa-solid fa-chevron-down" aria-hidden />
        </button>
      </header>
      <div className="si-adash__track">
        {cards.length ? (
          cards.map(card => <DashboardCard key={card.id} card={card} />)
        ) : (
          <div className="si-adash__empty">
            <i className="fa-solid fa-wave-square" aria-hidden />
            <span>Run an analysis (Crop, NDVI, Hydro, or Raster) — results stream in here.</span>
          </div>
        )}
      </div>
    </section>
  )
}

export default SiAnalyticsDashboard
