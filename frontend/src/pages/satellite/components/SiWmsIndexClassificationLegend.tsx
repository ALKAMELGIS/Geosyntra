import React, { useMemo } from 'react'
import {
  SI_EVI_CLASSIFICATION_STOPS,
  SI_GNDVI_CLASSIFICATION_STOPS,
  SI_NDMI_CLASSIFICATION_STOPS,
  SI_NDVI_CLASSIFICATION_STOPS,
  SI_NDWI_CLASSIFICATION_STOPS,
  siStopsToVerticalCssGradient,
  siThinLegendSegments,
} from '../../../lib/siWmsIndexClassificationRamp'

export type SiWmsClassifiedIndexProfile = 'ndvi' | 'ndwi' | 'gndvi' | 'ndmi' | 'evi'

const SI_CLASSIFIED_WMS_PROFILES: readonly SiWmsClassifiedIndexProfile[] = ['ndvi', 'ndwi', 'gndvi', 'ndmi', 'evi']

export function siIsWmsClassifiedWmsProfile(p: string): p is SiWmsClassifiedIndexProfile {
  return (SI_CLASSIFIED_WMS_PROFILES as readonly string[]).includes(p)
}

function stopsForProfile(profile: SiWmsClassifiedIndexProfile) {
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

export type SiWmsIndexClassificationLegendProps = {
  profile: SiWmsClassifiedIndexProfile
  layerLabel: string
  /** Max legend rows (dense NDVI ramps are thinned). */
  maxRows?: number
}

export function SiWmsIndexClassificationLegend({
  profile,
  layerLabel,
  maxRows = 10,
}: SiWmsIndexClassificationLegendProps) {
  const stops = stopsForProfile(profile)
  const gradient = useMemo(() => siStopsToVerticalCssGradient(stops), [stops])
  const rows = useMemo(() => siThinLegendSegments(stops, maxRows), [stops, maxRows])

  return (
    <div className="si-wms-index-class-legend" dir="ltr" role="region" aria-label="Index classification legend">
      <div className="si-wms-index-class-legend__head">
        <span className="si-wms-index-class-legend__title">{layerLabel}</span>
        <span className="si-wms-index-class-legend__badge">Classified</span>
      </div>
      <p className="si-wms-index-class-legend__hint">Piecewise classified ramp — each row is an index value band.</p>
      <div className="si-wms-index-class-legend__body">
        <div
          className="si-wms-index-class-legend__bar"
          style={{ backgroundImage: gradient }}
          aria-hidden
        />
        <div className="si-wms-index-class-legend__rows">
          {rows.map((row, i) => (
            <div key={`${row.from}-${row.to}-${i}`} className="si-wms-index-class-legend__row">
              <span className="si-wms-index-class-legend__swatch" style={{ background: row.color }} />
              <span className="si-wms-index-class-legend__range">{formatRange(row.from, row.to)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
