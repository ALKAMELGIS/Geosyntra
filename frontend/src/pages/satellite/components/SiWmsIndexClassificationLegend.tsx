import React, { useMemo } from 'react'
import type { WmsAoiEvalProfile } from '../../../lib/sentinelHubWmsAoiClip'
import {
  SI_EVI_CLASSIFICATION_STOPS,
  SI_GNDVI_CLASSIFICATION_STOPS,
  SI_NDMI_CLASSIFICATION_STOPS,
  SI_NDVI_CLASSIFICATION_STOPS,
  SI_NDWI_CLASSIFICATION_STOPS,
  siStopsToVerticalCssGradient,
  siThinLegendSegments,
} from '../../../lib/siWmsIndexClassificationRamp'

/** Indices rendered with a scalar classified ramp (matches WMS evalscript). */
const CLASSIFIED_PROFILES: readonly WmsAoiEvalProfile[] = ['ndvi', 'ndwi', 'gndvi', 'ndmi', 'evi']

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
  /** Week overlapping imagery date (from time-series chips; same engine as timeline chart). */
  temporal?: SiWmsSpectralTemporalSnapshot | null
}

export type SiWmsIndexClassificationLegendProps = {
  profile: WmsAoiEvalProfile
  layerLabel: string
  context: SiWmsSpectralLegendContext
  maxRows?: number
}

export function SiWmsIndexClassificationLegend({
  profile,
  layerLabel,
  context,
  maxRows = 10,
}: SiWmsIndexClassificationLegendProps) {
  const compositeKey =
    profile === 'true_color' || profile === 'false_color' || profile === 'swir' || profile === 'generic_rgb'
      ? profile
      : null
  const composite = compositeKey ? COMPOSITE_RGB[compositeKey] : null

  const classifiedStops = isClassifiedProfile(profile) ? stopsForClassified(profile) : null
  const gradient = useMemo(
    () => (classifiedStops ? siStopsToVerticalCssGradient(classifiedStops) : ''),
    [classifiedStops],
  )
  const rows = useMemo(
    () => (classifiedStops ? siThinLegendSegments(classifiedStops, maxRows) : []),
    [classifiedStops, maxRows],
  )

  const seriesLine =
    context.seriesStartIso && context.seriesEndIso
      ? `${context.seriesStartIso} → ${context.seriesEndIso}`
      : null

  const badge = composite ? composite.badge : 'Classified'

  return (
    <div className="si-wms-index-class-legend" dir="ltr" role="region" aria-label="Spectral layer legend">
      <div className="si-wms-index-class-legend__head">
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
            <span>min {context.temporal.min.toFixed(3)}</span>
            <span>mean {context.temporal.mean.toFixed(3)}</span>
            <span>max {context.temporal.max.toFixed(3)}</span>
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
            Piecewise classified ramp — value bands match the AOI WMS evalscript. Temporal line shows the chart week
            overlapping the imagery date (min / mean / max from the time-series chip).
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
