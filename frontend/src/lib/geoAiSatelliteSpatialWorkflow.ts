/**
 * Geo AI — detect multi-step spatial / RS workflows so they are not mistaken
 * for empty-layer tabular stats (see `runGeoAiStatsCommand`).
 *
 * `planSatelliteSpatialWorkflow` returns a lightweight execution plan for
 * Satellite Intelligence: point + geodesic buffer polygon + optional NDVI WMS
 * when coordinates and intent are explicit in natural language.
 */

const COORD_PAIR_RE =
  /\b(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)\b/

const RS_OR_GEOM_INTENT_RE =
  /\b(buffer|buffers|radius|ndvi|ndwi|savi|evi|sentinel|cloud[\s-]*free|classify|vegetation|raster|imagery|heatmap|heat\s*map|time\s*series|zonal|clip|polygon|workflow|km\b|miles?\b|meters?\b)\b/i

/** When true, `runGeoAiStatsCommand` must not short-circuit with “no layer rows”. */
export function spatialWorkflowOverridesTabularStats(query: string): boolean {
  const q = query.trim()
  if (!q) return false
  if (!COORD_PAIR_RE.test(q)) return false
  if (!RS_OR_GEOM_INTENT_RE.test(q)) return false
  return true
}

function metersPerDegLat(): number {
  return 111_320
}

function metersPerDegLng(latDeg: number): number {
  return (Math.PI / 180) * 6_371_000 * Math.cos((latDeg * Math.PI) / 180)
}

/** Approximate geodesic circle as a closed WGS84 ring (adequate for Geo AI buffers ≤ ~50 km). */
export function geoAiBufferRingWgs84(centerLng: number, centerLat: number, radiusM: number, segments = 72): [number, number][] {
  const ring: [number, number][] = []
  const mLat = metersPerDegLat()
  const mLng = metersPerDegLng(centerLat)
  for (let i = 0; i <= segments; i += 1) {
    const t = (i / segments) * Math.PI * 2
    const dx = radiusM * Math.cos(t)
    const dy = radiusM * Math.sin(t)
    ring.push([centerLng + dx / mLng, centerLat + dy / mLat])
  }
  return ring
}

function parseCoordPair(q: string): { lng: number; lat: number } | null {
  const m = q.match(COORD_PAIR_RE)
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[2])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  /** Heuristic: UAE / MENA — if first looks like latitude and second like longitude, keep as lat,lng → lng,lat. */
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180 && Math.abs(a) < Math.abs(b)) {
    return { lng: b, lat: a }
  }
  return { lng: a, lat: b }
}

function parseBufferKm(q: string): number | null {
  const km =
    q.match(/\b(\d+(?:\.\d+)?)\s*(?:km|kilometers?)\b/i)?.[1] ??
    q.match(/\b(?:buffer|radius|within)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:km|kilometers?)\b/i)?.[1]
  if (km) {
    const v = Number(km)
    if (Number.isFinite(v) && v > 0 && v <= 200) return v
  }
  const m =
    q.match(/\b(\d+(?:\.\d+)?)\s*(?:m|meters?)\b/i)?.[1] ??
    q.match(/\b(?:buffer|radius)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:m|meters?)\b/i)?.[1]
  if (m) {
    const meters = Number(m)
    if (Number.isFinite(meters) && meters > 0 && meters <= 200_000) return meters / 1000
  }
  return null
}

export type SatelliteSpatialWorkflowPlan =
  | { kind: 'none' }
  | {
      kind: 'run'
      lng: number
      lat: number
      bufferKm: number | null
      bufferRing: [number, number][] | null
      wantsNdvi: boolean
      reply: string
    }

export function planSatelliteSpatialWorkflow(query: string): SatelliteSpatialWorkflowPlan {
  const q = query.trim()
  if (!q || !spatialWorkflowOverridesTabularStats(q)) return { kind: 'none' }
  const pt = parseCoordPair(q)
  if (!pt) return { kind: 'none' }
  const bufKm = parseBufferKm(q)
  const wantsNdvi = /\bndvi\b/i.test(q) || /\bvegetation\b/i.test(q) || /\bhealth\b/i.test(q)
  const ring = bufKm != null ? geoAiBufferRingWgs84(pt.lng, pt.lat, bufKm * 1000) : null
  const lines: string[] = [
    '**Spatial workflow (client)** — interpreted your message as a map-driven pipeline (not tabular layer stats).',
    '',
    `1. **Anchor** — WGS84 point **${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}** (map pin + vector layer).`,
  ]
  if (ring && bufKm != null) {
    lines.push(`2. **Buffer** — ~**${bufKm} km** geodesic polygon added as its own layer and registered as an AOI for clipped imagery.`)
  }
  if (wantsNdvi) {
    lines.push(
      '3. **NDVI** — Remote Sensing overlay enabled for the AOI when your Sentinel Hub instance exposes an NDVI-compatible layer name.',
    )
  }
  lines.push(
    '',
    '_Full cloud-free scene fetch, true zonal stats, classification export, and async workers are not wired in this preview — extend `planSatelliteSpatialWorkflow` + backend hooks for enterprise runs._',
  )
  return {
    kind: 'run',
    lng: pt.lng,
    lat: pt.lat,
    bufferKm: bufKm,
    bufferRing: ring,
    wantsNdvi,
    reply: lines.join('\n'),
  }
}
