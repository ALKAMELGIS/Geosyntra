import React, { useCallback, useMemo, useRef, useState } from 'react'
import type { WmsAoiEvalProfile } from '../../../lib/sentinelHubWmsAoiClip'
import {
  SI_EVI_CLASSIFICATION_STOPS,
  SI_GNDVI_CLASSIFICATION_STOPS,
  SI_NDMI_CLASSIFICATION_STOPS,
  SI_NDVI_CLASSIFICATION_STOPS,
  SI_NDWI_CLASSIFICATION_STOPS,
  type IndexRampStop,
  siStopsToVerticalCssGradient,
} from '../../../lib/siWmsIndexClassificationRamp'
import { SI_WMS_SPECTRAL_CLASS_COUNT, siWmsLegendRowsFromStops } from '../utils/siWmsSpectralClassification'
import { formatStatFixed } from '../utils/weeklyCompositeStats'

const SI_WMS_LEGEND_OFFSET_LS = 'si-wms-spectral-legend-offset-v1'

function readStoredLegendOffset(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 0, y: 0 }
  try {
    const raw = localStorage.getItem(SI_WMS_LEGEND_OFFSET_LS)
    if (!raw) return { x: 0, y: 0 }
    const o = JSON.parse(raw) as { x?: unknown; y?: unknown }
    const x = Number(o.x)
    const y = Number(o.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 }
    return { x, y }
  } catch {
    return { x: 0, y: 0 }
  }
}

function clampLegendOffset(x: number, y: number): { x: number; y: number } {
  if (typeof window === 'undefined') return { x, y }
  const vw = window.innerWidth
  const vh = window.innerHeight
  const maxX = Math.min(280, vw * 0.4)
  const maxY = Math.min(320, vh * 0.45)
  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    y: Math.max(-maxY, Math.min(maxY, y)),
  }
}

/** Indices rendered with a scalar classified ramp (matches WMS evalscript). */
const CLASSIFIED_PROFILES: readonly WmsAoiEvalProfile[] = [
  'ndvi',
  'ndwi',
  'gndvi',
  'ndmi',
  'evi',
  'savi',
  'ndbi',
  'lst',
]

export function siWmsShowsSpectralLegend(profile: WmsAoiEvalProfile): profile is Exclude<WmsAoiEvalProfile, 'native'> {
  return profile !== 'native'
}

function isClassifiedProfile(p: WmsAoiEvalProfile): p is (typeof CLASSIFIED_PROFILES)[number] {
  return (CLASSIFIED_PROFILES as readonly WmsAoiEvalProfile[]).includes(p)
}

function stopsForClassified(profile: (typeof CLASSIFIED_PROFILES)[number]) {
  switch (profile) {
    case 'ndvi':
      return SI_NDVI_CLASSIFICATION_STOPS
    case 'ndwi':
      return SI_NDWI_CLASSIFICATION_STOPS
    case 'gndvi':
      return SI_GNDVI_CLASSIFICATION_STOPS
    case 'ndmi':
      return SI_NDMI_CLASSIFICATION_STOPS
    case 'evi':
      return SI_EVI_CLASSIFICATION_STOPS
    case 'savi':
      return SI_NDVI_CLASSIFICATION_STOPS
    case 'ndbi':
      return SI_NDWI_CLASSIFICATION_STOPS
    case 'lst':
      return SI_NDMI_CLASSIFICATION_STOPS
    default:
      return SI_NDVI_CLASSIFICATION_STOPS
  }
}

function formatRange(from: number, to: number): string {
  const a = Number(from.toFixed(3))
  const b = Number(to.toFixed(3))
  return `${a} – ${b}`
}

type CompositeRow = { ch: string; band: string; hex: string }

const COMPOSITE_RGB: Record<
  'true_color' | 'false_color' | 'swir' | 'generic_rgb',
  { badge: string; rows: CompositeRow[] }
> = {
  true_color: {
    badge: 'RGB',
    rows: [
      { ch: 'R', band: 'B04 Red', hex: '#dc2626' },
      { ch: 'G', band: 'B03 Green', hex: '#16a34a' },
      { ch: 'B', band: 'B02 Blue', hex: '#2563eb' },
    ],
  },
  generic_rgb: {
    badge: 'RGB',
    rows: [
      { ch: 'R', band: 'B04 Red', hex: '#dc2626' },
      { ch: 'G', band: 'B03 Green', hex: '#16a34a' },
      { ch: 'B', band: 'B02 Blue', hex: '#2563eb' },
    ],
  },
  false_color: {
    badge: 'FCIR',
    rows: [
      { ch: 'R', band: 'B08 NIR', hex: '#7c2d12' },
      { ch: 'G', band: 'B04 Red', hex: '#ca8a04' },
      { ch: 'B', band: 'B03 Green', hex: '#166534' },
    ],
  },
  swir: {
    badge: 'SWIR',
    rows: [
      { ch: 'R', band: 'B12', hex: '#ea580c' },
      { ch: 'G', band: 'B8A', hex: '#ca8a04' },
      { ch: 'B', band: 'B04', hex: '#2563eb' },
    ],
  },
}

export type SiWmsSpectralTemporalSnapshot = {
  min: number
  max: number
  mean: number
  weekStart: string
  weekEnd: string
}

export type SiWmsSpectralLegendContext = {
  imageryDateIso: string
  seriesStartIso?: string | null
  seriesEndIso?: string | null
  timelinePlaying?: boolean
  satelliteProviderName?: string | null
  providerResolutionLabel?: string | null
  /** Week overlapping imagery date (from time-series chips; same engine as timeline chart). */
  temporal?: SiWmsSpectralTemporalSnapshot | null
}

export type SiWmsIndexClassificationLegendProps = {
  profile: WmsAoiEvalProfile
  layerLabel: string
  context: SiWmsSpectralLegendContext
  maxRows?: number
  /** When set (≥2 stops), legend + ramp reflect user symbology instead of service defaults. */
  classifiedStopsOverride?: readonly IndexRampStop[] | null
}

export function SiWmsIndexClassificationLegend({
  profile,
  layerLabel,
  context,
  maxRows = SI_WMS_SPECTRAL_CLASS_COUNT,
  classifiedStopsOverride = null,
}: SiWmsIndexClassificationLegendProps) {
  const offsetRef = useRef(readStoredLegendOffset())
  const [legendOffset, setLegendOffset] = useState(offsetRef.current)
  const [legendDragging, setLegendDragging] = useState(false)
  offsetRef.current = legendOffset

  const onLegendHeadPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    const start = { ox: offsetRef.current.x, oy: offsetRef.current.y, cx: e.clientX, cy: e.clientY }
    setLegendDragging(true)
    const head = e.currentTarget
    try {
      head.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }

    const onMove = (ev: PointerEvent) => {
      setLegendOffset(clampLegendOffset(start.ox + (ev.clientX - start.cx), start.oy + (ev.clientY - start.cy)))
    }

    const finish = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      try {
        head.releasePointerCapture(ev.pointerId)
      } catch {
        /* ignore */
      }
      setLegendDragging(false)
      setLegendOffset(prev => {
        const c = clampLegendOffset(prev.x, prev.y)
        try {
          localStorage.setItem(SI_WMS_LEGEND_OFFSET_LS, JSON.stringify(c))
        } catch {
          /* ignore */
        }
        return c
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }, [])

  const compositeKey =
    profile === 'true_color' || profile === 'false_color' || profile === 'swir' || profile === 'generic_rgb'
      ? profile
      : null
  const composite = compositeKey ? COMPOSITE_RGB[compositeKey] : null

  const classifiedStops = isClassifiedProfile(profile)
    ? classifiedStopsOverride && classifiedStopsOverride.length >= 2
      ? classifiedStopsOverride
      : stopsForClassified(profile)
    : null
  const gradient = useMemo(
    () => (classifiedStops ? siStopsToVerticalCssGradient(classifiedStops) : ''),
    [classifiedStops],
  )
  const rows = useMemo(
    () => (classifiedStops ? siWmsLegendRowsFromStops(classifiedStops, maxRows) : []),
    [classifiedStops, maxRows],
  );

  const seriesLine =
    context.seriesStartIso && context.seriesEndIso
      ? `${context.seriesStartIso} → ${context.seriesEndIso}`
      : null

  const badge = composite ? composite.badge : 'Scientific'

  return (
    <div
      className={`si-wms-index-class-legend${legendDragging ? ' si-wms-index-class-legend--dragging' : ''}`}
      dir="ltr"
      role="region"
      aria-label="Spectral layer legend"
      style={{ transform: `translate(${legendOffset.x}px, ${legendOffset.y}px)` }}
    >
      <div
        className="si-wms-index-class-legend__head si-wms-index-class-legend__head--draggable"
        onPointerDown={onLegendHeadPointerDown}
        title="Drag header to move legend"
      >
        <span className="si-wms-index-class-legend__drag-icon" aria-hidden>
          <i className="fa-solid fa-grip-lines" />
        </span>
        <span className="si-wms-index-class-legend__title">{layerLabel}</span>
        <span className={`si-wms-index-class-legend__badge${composite ? ' si-wms-index-class-legend__badge--composite' : ''}`}>{badge}</span>
      </div>

      <div className="si-wms-index-class-legend__live" aria-live="polite">
        <div className="si-wms-index-class-legend__live-row">
          <span className="si-wms-index-class-legend__live-k">Imagery</span>
          <span className="si-wms-index-class-legend__live-v">{context.imageryDateIso}</span>
          {context.timelinePlaying ? (
            <span className="si-wms-index-class-legend__live-playing">Playing</span>
          ) : null}
        </div>
        {context.satelliteProviderName ? (
          <div className="si-wms-index-class-legend__live-row">
            <span className="si-wms-index-class-legend__live-k">Provider</span>
            <span className="si-wms-index-class-legend__live-v">
              {context.satelliteProviderName}
              {context.providerResolutionLabel ? ` · ${context.providerResolutionLabel}` : ''}
            </span>
          </div>
        ) : null}
        {seriesLine ? (
          <div className="si-wms-index-class-legend__live-row">
            <span className="si-wms-index-class-legend__live-k">Series</span>
            <span className="si-wms-index-class-legend__live-v">{seriesLine}</span>
          </div>
        ) : null}
        {context.temporal ? (
          <div className="si-wms-index-class-legend__live-row si-wms-index-class-legend__live-row--stats">
            <span className="si-wms-index-class-legend__live-k">Window</span>
            <span className="si-wms-index-class-legend__live-v">
              {context.temporal.weekStart} – {context.temporal.weekEnd}
            </span>
          </div>
        ) : null}
        {context.temporal ? (
          <div className="si-wms-index-class-legend__stats">
            <span>min {formatStatFixed(context.temporal.min, 3)}</span>
            <span>mean {formatStatFixed(context.temporal.mean, 3)}</span>
            <span>max {formatStatFixed(context.temporal.max, 3)}</span>
          </div>
        ) : null}
      </div>

      {composite ? (
        <>
          <p className="si-wms-index-class-legend__hint">
            RGB composite (Sentinel-2). Colors follow band assignment; map gain is fixed in the WMS script.
          </p>
          <div className="si-wms-index-class-legend__body si-wms-index-class-legend__body--composite">
            <div className="si-wms-index-class-legend__composite-strip" aria-hidden>
              {composite.rows.map(r => (
                <span key={r.ch} className="si-wms-index-class-legend__composite-seg" style={{ background: r.hex }} />
              ))}
            </div>
            <div className="si-wms-index-class-legend__rows">
              {composite.rows.map(r => (
                <div key={r.ch} className="si-wms-index-class-legend__row">
                  <span className="si-wms-index-class-legend__swatch" style={{ background: r.hex }} />
                  <span className="si-wms-index-class-legend__range">
                    {r.ch} · {r.band}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : classifiedStops ? (
        <>
          <p className="si-wms-index-class-legend__hint">
            {classifiedStopsOverride && classifiedStopsOverride.length >= 2
              ? `Custom symbology — ${maxRows} classes; bands match the AOI WMS evalscript exactly.`
              : `Spectral classification — ${maxRows} classes by layer type; colors and ranges match the map tiles and export.`}
          </p>
          <div className="si-wms-index-class-legend__body">
            <div className="si-wms-index-class-legend__bar" style={{ backgroundImage: gradient }} aria-hidden />
            <div className="si-wms-index-class-legend__rows">
              {rows.map((row, i) => (
                <div key={`${row.from}-${row.to}-${i}`} className="si-wms-index-class-legend__row">
                  <span className="si-wms-index-class-legend__swatch" style={{ background: row.color }} />
                  <span className="si-wms-index-class-legend__range">{formatRange(row.from, row.to)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
