import type { GeoDatasetAoiSnapshot, GeoDatasetEngineInput, GeoGroundingPlace, GeoGroundingRouteResult } from './types'

function formatAoiBlock(aoi: GeoDatasetAoiSnapshot | null | undefined): string {
  if (!aoi) return ''
  const lines: string[] = ['### Geo Dataset Engine — AOI snapshot']
  if (aoi.label) lines.push(`- Label: ${aoi.label}`)
  if (aoi.bbox) {
    lines.push(
      `- Bbox (W,S,E,N): ${aoi.bbox.map(n => Number(n).toFixed(5)).join(', ')}`,
    )
  }
  if (aoi.areaHa != null) lines.push(`- Area (ha): ${aoi.areaHa.toFixed(2)}`)
  if (aoi.timelineLabel) lines.push(`- Timeline: ${aoi.timelineLabel}`)
  if (aoi.layerId) lines.push(`- Layer: ${aoi.layerId}`)
  if (aoi.ndviMean != null) {
    lines.push(
      `- NDVI: mean ${aoi.ndviMean.toFixed(3)}${aoi.ndviMin != null ? `, min ${aoi.ndviMin.toFixed(3)}` : ''}${aoi.ndviMax != null ? `, max ${aoi.ndviMax.toFixed(3)}` : ''}`,
    )
  }
  return lines.length > 1 ? lines.join('\n') : ''
}

function formatPlaces(places: GeoGroundingPlace[]): string {
  if (!places.length) return '(no places returned)'
  return places
    .slice(0, 8)
    .map((p, i) => {
      const coords =
        p.lat != null && p.lng != null ? ` @ ${p.lng?.toFixed(5)},${p.lat?.toFixed(5)}` : ''
      const rating = p.rating != null ? ` · rating ${p.rating}` : ''
      return `${i + 1}. **${p.name || 'Place'}** — ${p.address || '—'}${coords}${rating}`
    })
    .join('\n')
}

function formatRoute(route: GeoGroundingRouteResult | null | undefined): string {
  if (!route) return '(no route returned)'
  const distKm = route.distanceMeters != null ? (route.distanceMeters / 1000).toFixed(1) : '?'
  return `- Distance: ~${distKm} km\n- Duration: ${route.duration || '—'}\n- Encoded polyline available: ${route.polyline ? 'yes' : 'no'}`
}

export function buildGeoDatasetContextBlock(args: {
  engine: GeoDatasetEngineInput
  places: GeoGroundingPlace[]
  geocodes: { label?: string; lat?: number; lng?: number }[]
  route: GeoGroundingRouteResult | null
  elevations: { elevationMeters?: number; lat?: number; lng?: number }[]
  toolsUsed: string[]
}): string {
  const parts: string[] = []
  const aoi = formatAoiBlock(args.engine.aoi)
  if (aoi) parts.push(aoi)
  if (args.engine.satelliteLayerSummary?.trim()) {
    parts.push(`### Geo Dataset Engine — Live layers\n${args.engine.satelliteLayerSummary.trim().slice(0, 4000)}`)
  }
  if (args.engine.pinLngLat) {
    parts.push(
      `### Session map anchor\nWGS84: ${args.engine.pinLngLat[0].toFixed(5)}, ${args.engine.pinLngLat[1].toFixed(5)}`,
    )
  }

  parts.push(
    `### GOOGLE MAPS GROUNDING (live)\nTools invoked: ${args.toolsUsed.join(', ') || 'none'}\nUser query: ${args.engine.userText.slice(0, 300)}`,
  )

  if (args.places.length) {
    parts.push(`**Places (text search)**\n${formatPlaces(args.places)}`)
  }
  if (args.geocodes.length) {
    parts.push(
      `**Geocoding**\n${args.geocodes
        .map((g, i) => `${i + 1}. ${g.label} → ${g.lng?.toFixed(5)},${g.lat?.toFixed(5)}`)
        .join('\n')}`,
    )
  }
  if (args.route) {
    parts.push(`**Route**\n${formatRoute(args.route)}`)
  }
  if (args.elevations.length) {
    parts.push(
      `**Elevation**\n${args.elevations
        .map(e => `- ${e.lat?.toFixed(5)},${e.lng?.toFixed(5)} → ${e.elevationMeters?.toFixed(1)} m`)
        .join('\n')}`,
    )
  }

  return parts.join('\n\n')
}
