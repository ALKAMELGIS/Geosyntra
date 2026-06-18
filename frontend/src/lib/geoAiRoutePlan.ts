import type { FeatureCollection, LineString, Position } from 'geojson'
import {
  decodeGoogleEncodedPolyline,
  lineStringFeatureCollectionFromLngLat,
} from './geoAiPolylineDecode'

export type GeoAiTravelMode = 'DRIVE' | 'WALK' | 'BICYCLE'

export type GeoAiRouteEndpoint = {
  label: string
  lng: number
  lat: number
}

export type NavigationTurnStep = {
  instruction: string
  distanceMeters?: number
  durationSeconds?: number
  streetName?: string
}

export type RouteElevationSample = {
  distanceM: number
  elevationM: number
}

export type GeoAiRouteOption = {
  id: string
  label: string
  distanceMeters?: number
  durationSeconds?: number
  distanceLabel: string
  durationLabel: string
  featureCollection: FeatureCollection
  steps?: NavigationTurnStep[]
  elevationProfile?: RouteElevationSample[]
  preference?: 'recommended' | 'fastest' | 'shortest'
}

export type GeoAiRouteSession = {
  origin: GeoAiRouteEndpoint
  destination: GeoAiRouteEndpoint
  travelMode: GeoAiTravelMode
  provider?: string
  options: GeoAiRouteOption[]
  selectedIndex: number
  /** Intermediate stops between origin and destination */
  waypoints?: GeoAiRouteEndpoint[]
  preference?: 'recommended' | 'fastest' | 'shortest'
}

export type GroundingRouteLeg = {
  distanceMeters?: number
  durationSeconds?: number
  duration?: string
  distance?: string
  polyline?: string
  geometry?: LineString
  label?: string
  steps?: NavigationTurnStep[]
  elevationProfile?: RouteElevationSample[]
  preference?: 'recommended' | 'fastest' | 'shortest'
}

export function detectGeoAiTravelMode(query: string): GeoAiTravelMode {
  const q = query.toLowerCase()
  if (/\b(walk|walking|on\s+foot|pedestrian|foot\s+path)\b/.test(q)) return 'WALK'
  if (/\b(bike|bicycl|cycling|cycle\b)\b/.test(q)) return 'BICYCLE'
  return 'DRIVE'
}

export function formatRouteDistance(meters?: number): string {
  const n = Number(meters)
  if (!Number.isFinite(n)) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(1)} km`
  return `${Math.round(n)} m`
}

export function formatRouteDuration(seconds?: number, fallbackLabel?: string): string {
  if (fallbackLabel?.trim()) return fallbackLabel.trim()
  const s = Math.max(0, Math.round(Number(seconds) || 0))
  if (!s) return '—'
  if (s < 60) return `${s} sec`
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m < 60) return r ? `${m} min ${r} sec` : `${m} min`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h} hr ${rm} min` : `${h} hr`
}

function coordsFromGeometry(geom: LineString | undefined): [number, number][] {
  if (!geom || geom.type !== 'LineString' || !Array.isArray(geom.coordinates)) return []
  return geom.coordinates
    .map(c => {
      const lng = Number((c as Position)[0])
      const lat = Number((c as Position)[1])
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
      return [lng, lat] as [number, number]
    })
    .filter((p): p is [number, number] => p != null)
}

export function buildRouteFeatureCollection(
  lineCoords: [number, number][],
  origin: GeoAiRouteEndpoint,
  destination: GeoAiRouteEndpoint,
  meta?: Record<string, unknown>,
  waypoints: GeoAiRouteEndpoint[] = [],
): FeatureCollection | null {
  if (lineCoords.length < 2) return null
  const fc = lineStringFeatureCollectionFromLngLat(lineCoords, {
    name: 'Geo AI route',
    ...meta,
  })
  fc.features.push(
    {
      type: 'Feature',
      properties: { role: 'origin', label: origin.label },
      geometry: { type: 'Point', coordinates: [origin.lng, origin.lat] },
    },
    ...waypoints.map((wp, i) => ({
      type: 'Feature' as const,
      properties: { role: 'waypoint', label: wp.label, waypointIndex: i },
      geometry: { type: 'Point' as const, coordinates: [wp.lng, wp.lat] },
    })),
    {
      type: 'Feature',
      properties: { role: 'destination', label: destination.label },
      geometry: { type: 'Point', coordinates: [destination.lng, destination.lat] },
    },
  )
  return fc
}

export function routeOptionsFromGroundingLegs(
  legs: GroundingRouteLeg[],
  origin: GeoAiRouteEndpoint,
  destination: GeoAiRouteEndpoint,
  waypoints: GeoAiRouteEndpoint[] = [],
): GeoAiRouteOption[] {
  const out: GeoAiRouteOption[] = []
  legs.forEach((leg, i) => {
    let coords: [number, number][] = []
    if (leg.geometry) coords = coordsFromGeometry(leg.geometry)
    else if (leg.polyline) coords = decodeGoogleEncodedPolyline(leg.polyline)
    const fc = buildRouteFeatureCollection(
      coords,
      origin,
      destination,
      {
        routeIndex: i,
        distanceMeters: leg.distanceMeters,
        durationSeconds: leg.durationSeconds,
      },
      waypoints,
    )
    if (!fc) return
    out.push({
      id: `route-${i}`,
      label: leg.label || (i === 0 ? 'Recommended' : `Alternative ${i}`),
      distanceMeters: leg.distanceMeters,
      durationSeconds: leg.durationSeconds,
      distanceLabel: leg.distance || formatRouteDistance(leg.distanceMeters),
      durationLabel: formatRouteDuration(leg.durationSeconds, leg.duration),
      featureCollection: fc,
      steps: leg.steps,
      elevationProfile: leg.elevationProfile,
      preference: leg.preference,
    })
  })
  return out
}

export function bboxFromFeatureCollection(fc: FeatureCollection): [number, number, number, number] | null {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  const walk = (coords: Position[]) => {
    for (const c of coords) {
      const lng = Number(c[0])
      const lat = Number(c[1])
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
      minLng = Math.min(minLng, lng)
      maxLng = Math.max(maxLng, lng)
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
    }
  }
  const walkRing = (ring: Position[]) => walk(ring)
  for (const f of fc.features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'Point') walk([g.coordinates as Position])
    if (g.type === 'LineString') walk(g.coordinates as Position[])
    if (g.type === 'Polygon') {
      for (const ring of g.coordinates) walkRing(ring as Position[])
    }
    if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) {
        for (const ring of poly) walkRing(ring as Position[])
      }
    }
  }
  if (!Number.isFinite(minLng)) return null
  return [minLng, minLat, maxLng, maxLat]
}

export function buildGeoAiRouteSession(
  legs: GroundingRouteLeg[],
  origin: GeoAiRouteEndpoint,
  destination: GeoAiRouteEndpoint,
  travelMode: GeoAiTravelMode,
  provider?: string,
  extras?: {
    waypoints?: GeoAiRouteEndpoint[]
    preference?: 'recommended' | 'fastest' | 'shortest'
  },
): GeoAiRouteSession | null {
  const waypoints = extras?.waypoints ?? []
  const options = routeOptionsFromGroundingLegs(legs, origin, destination, waypoints)
  if (!options.length) return null
  return {
    origin,
    destination,
    travelMode,
    provider,
    options,
    selectedIndex: 0,
    waypoints: waypoints.length ? waypoints : undefined,
    preference: extras?.preference,
  }
}

/** Sample point along route LineString at fraction 0–1. */
export function lngLatAlongRoute(
  geometry: LineString | undefined,
  t: number,
): [number, number] | null {
  const coords = coordsFromGeometry(geometry)
  if (coords.length < 2) return null
  const clamped = Math.max(0, Math.min(1, t))
  const total = coords.length - 1
  const f = clamped * total
  const i = Math.min(Math.floor(f), total - 1)
  const frac = f - i
  const a = coords[i]!
  const b = coords[i + 1] ?? a
  return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac]
}
