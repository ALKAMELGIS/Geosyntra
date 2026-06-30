/**
 * Geosyntra · Measurement geodesic math
 * --------------------------------------
 * Self-contained spherical/geodesic helpers for the unified Measurement tool.
 * No external dependency (turf is not installed) — uses WGS84 sphere math which
 * is accurate to well under 0.5% for typical AOI-scale measurements.
 */

export type LngLat = [number, number]

const EARTH_RADIUS_M = 6371008.8 // mean Earth radius (IUGG)
const DEG2RAD = Math.PI / 180

export type DistanceUnit = 'm' | 'km' | 'ft' | 'mi'
export type AreaUnit = 'm2' | 'ha' | 'ac' | 'km2'

/** Great-circle distance between two lng/lat points, in metres. */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const lat1 = a[1] * DEG2RAD
  const lat2 = b[1] * DEG2RAD
  const dLat = (b[1] - a[1]) * DEG2RAD
  const dLng = (b[0] - a[0]) * DEG2RAD
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Total length of a polyline (sum of segment great-circle distances), metres. */
export function polylineMeters(points: LngLat[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += haversineMeters(points[i - 1], points[i])
  return total
}

/**
 * Geodesic polygon area (metres²) using the spherical excess formula.
 * Ring may be open or closed; sign is normalised to a positive magnitude.
 */
export function polygonAreaMeters(ring: LngLat[]): number {
  if (ring.length < 3) return 0
  const pts = ring.slice()
  // Ensure closed for the summation loop.
  const first = pts[0]
  const last = pts[pts.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) pts.push(first)

  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [lng1, lat1] = pts[i]
    const [lng2, lat2] = pts[i + 1]
    total += (lng2 - lng1) * DEG2RAD * (2 + Math.sin(lat1 * DEG2RAD) + Math.sin(lat2 * DEG2RAD))
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2)
}

/** Initial bearing (azimuth) from a→b, degrees clockwise from true north [0,360). */
export function bearingDegrees(a: LngLat, b: LngLat): number {
  const lat1 = a[1] * DEG2RAD
  const lat2 = b[1] * DEG2RAD
  const dLng = (b[0] - a[0]) * DEG2RAD
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  const deg = Math.atan2(y, x) / DEG2RAD
  return (deg + 360) % 360
}

/** Compass label (16-wind) for an azimuth in degrees. */
export function compass16(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return dirs[Math.round(deg / 22.5) % 16]
}

/** Interior angle (degrees) at vertex b formed by a-b-c. */
export function angleAtVertex(a: LngLat, b: LngLat, c: LngLat): number {
  const ba = bearingDegrees(b, a)
  const bc = bearingDegrees(b, c)
  let diff = Math.abs(ba - bc) % 360
  if (diff > 180) diff = 360 - diff
  return diff
}

/** Midpoint (simple linear interpolation — adequate for label placement). */
export function midpoint(a: LngLat, b: LngLat): LngLat {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

/** Centroid of a ring (average of vertices — adequate for label placement). */
export function ringCentroid(ring: LngLat[]): LngLat {
  let x = 0
  let y = 0
  for (const p of ring) {
    x += p[0]
    y += p[1]
  }
  return [x / ring.length, y / ring.length]
}

/** Build a geodesic circle polygon ring around a centre with a given radius (m). */
export function circleRing(center: LngLat, radiusM: number, steps = 96): LngLat[] {
  const ring: LngLat[] = []
  const latR = center[1] * DEG2RAD
  const dLat = (radiusM / EARTH_RADIUS_M) / DEG2RAD
  const dLng = (radiusM / (EARTH_RADIUS_M * Math.cos(latR))) / DEG2RAD
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    ring.push([center[0] + dLng * Math.cos(t), center[1] + dLat * Math.sin(t)])
  }
  return ring
}

/** Axis-aligned rectangle ring from two opposite corners. */
export function rectangleRing(a: LngLat, b: LngLat): LngLat[] {
  return [
    [a[0], a[1]],
    [b[0], a[1]],
    [b[0], b[1]],
    [a[0], b[1]],
    [a[0], a[1]],
  ]
}

const M_PER = { m: 1, km: 1000, ft: 0.3048, mi: 1609.344 } as const
const M2_PER = { m2: 1, km2: 1e6, ha: 1e4, ac: 4046.8564224 } as const
const UNIT_LABEL_D: Record<DistanceUnit, string> = { m: 'm', km: 'km', ft: 'ft', mi: 'mi' }
const UNIT_LABEL_A: Record<AreaUnit, string> = { m2: 'm²', km2: 'km²', ha: 'ha', ac: 'ac' }

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (Math.abs(n) >= 100) return n.toFixed(1)
  return n.toFixed(2)
}

export function formatDistance(meters: number, unit: DistanceUnit): string {
  return `${fmt(meters / M_PER[unit])} ${UNIT_LABEL_D[unit]}`
}

export function formatArea(m2: number, unit: AreaUnit): string {
  return `${fmt(m2 / M2_PER[unit])} ${UNIT_LABEL_A[unit]}`
}

export function formatLngLat(p: LngLat): string {
  return `${p[1].toFixed(6)}°, ${p[0].toFixed(6)}°`
}

export const DISTANCE_UNITS: { id: DistanceUnit; label: string }[] = [
  { id: 'm', label: 'Meters' },
  { id: 'km', label: 'Kilometers' },
  { id: 'ft', label: 'Feet' },
  { id: 'mi', label: 'Miles' },
]

export const AREA_UNITS: { id: AreaUnit; label: string }[] = [
  { id: 'm2', label: 'Square Meters' },
  { id: 'ha', label: 'Hectares' },
  { id: 'ac', label: 'Acres' },
  { id: 'km2', label: 'Square Kilometers' },
]
