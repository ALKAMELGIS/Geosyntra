/**
 * OpenRouteService v2 client — directions, isochrones, matrix, snap.
 * @see https://github.com/GIScience/openrouteservice
 */
import type { FeatureCollection, LineString } from 'geojson'
import {
  buildGeoAiRouteSession,
  formatRouteDistance,
  formatRouteDuration,
  type GeoAiRouteEndpoint,
  type GeoAiRouteSession,
  type GroundingRouteLeg,
  type NavigationTurnStep,
  type RouteElevationSample,
} from './geoAiRoutePlan'
import type { RoutePreference } from './siNavigationTypes'
import { resolveApiUrl } from './apiClient'
import { readAccessToken } from './auth'
import { getOpenRouteServiceApiKey } from './openRouteServiceApiKey'
import { mustUseApiGateway } from './platformTokenRuntime'
import type { GeoAiTravelMode } from './geoAiRoutePlan'

export type RouteMapProfile = 'car' | 'foot' | 'bike' | 'truck'

function routeMapProfileToTravelMode(profile: RouteMapProfile): GeoAiTravelMode | 'TRUCK' {
  if (profile === 'foot') return 'WALK'
  if (profile === 'bike') return 'BICYCLE'
  if (profile === 'truck') return 'TRUCK'
  return 'DRIVE'
}

const ORS_API = 'https://api.openrouteservice.org'

export type OrsIsochroneMinutes = 5 | 10 | 15 | 30

export type OrsMatrixCell = {
  fromIndex: number
  toIndex: number
  fromLabel: string
  toLabel: string
  durationSeconds: number | null
  distanceMeters: number | null
  durationLabel: string
  distanceLabel: string
}

export type OrsMatrixResult = {
  locations: { label: string; lng: number; lat: number }[]
  cells: OrsMatrixCell[]
  lineGeoJson: FeatureCollection | null
}

function orsProfileFromRouteMap(profile: RouteMapProfile): string {
  if (profile === 'foot') return 'foot-walking'
  if (profile === 'bike') return 'cycling-regular'
  if (profile === 'truck') return 'driving-hgv'
  return 'driving-car'
}

async function orsPost<T>(path: string, body: Record<string, unknown>, apiKey: string): Promise<T> {
  const useGateway = mustUseApiGateway() || apiKey === '__gateway__'
  const res = await fetch(
    useGateway ? resolveApiUrl(`/api/gateway/openrouteservice${path}`) : `${ORS_API}${path}`,
    {
    method: 'POST',
    headers: useGateway
      ? {
          'Content-Type': 'application/json',
          Accept: 'application/json, application/geo+json',
          ...(readAccessToken() ? { Authorization: `Bearer ${readAccessToken()}` } : {}),
        }
      : {
          'Content-Type': 'application/json',
          Accept: 'application/json, application/geo+json',
          Authorization: apiKey,
        },
    credentials: useGateway ? 'include' : 'omit',
    body: JSON.stringify(body),
  },
  )
  const data = await res.json()
  if (!res.ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ||
      (data as { message?: string })?.message ||
      `OpenRouteService HTTP ${res.status}`
    throw new Error(msg)
  }
  return data as T
}

export function resolveOrsApiKey(): string {
  return getOpenRouteServiceApiKey()
}

type OrsSegment = {
  steps?: Array<{
    instruction?: string
    distance?: number
    duration?: number
    name?: string
    type?: number
  }>
}

type OrsFeatureProps = {
  summary?: { distance?: number; duration?: number }
  segments?: OrsSegment[]
}

function parseOrsSteps(props: OrsFeatureProps | undefined): NavigationTurnStep[] {
  const steps: NavigationTurnStep[] = []
  const segments = Array.isArray(props?.segments) ? props.segments : []
  for (const seg of segments) {
    for (const st of seg.steps ?? []) {
      const instruction = String(st.instruction || '').trim()
      if (!instruction) continue
      steps.push({
        instruction,
        distanceMeters: st.distance,
        durationSeconds: st.duration,
        streetName: st.name,
        type: st.type,
      })
    }
  }
  return steps
}

function elevationProfileFromGeometry(geom: LineString | undefined): RouteElevationSample[] {
  if (!geom || geom.type !== 'LineString' || !Array.isArray(geom.coordinates)) return []
  const samples: RouteElevationSample[] = []
  let dist = 0
  let prev: [number, number, number] | null = null
  for (const c of geom.coordinates) {
    const lng = Number(c[0])
    const lat = Number(c[1])
    const elev = Number(c[2])
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    if (prev) {
      const dLat = ((lat - prev[1]) * Math.PI) / 180
      const dLng = ((lng - prev[0]) * Math.PI) / 180
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((prev[1] * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
      dist += 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }
    if (Number.isFinite(elev)) {
      samples.push({ distanceM: Math.round(dist), elevationM: Math.round(elev) })
    }
    prev = [lng, lat, elev]
  }
  return samples
}

function preferenceLabel(pref: RoutePreference, index: number): string {
  if (index > 0) return `Alternative ${index}`
  if (pref === 'fastest') return 'Fastest'
  if (pref === 'shortest') return 'Shortest'
  return 'Recommended'
}

export async function orsDirectionsSession(args: {
  origin: GeoAiRouteEndpoint
  destination: GeoAiRouteEndpoint
  waypoints?: GeoAiRouteEndpoint[]
  profile: RouteMapProfile
  alternatives?: number
  preference?: RoutePreference
  instructions?: boolean
  elevation?: boolean
  apiKey?: string
}): Promise<GeoAiRouteSession | null> {
  const apiKey = args.apiKey?.trim() || resolveOrsApiKey()
  if (!apiKey) return null

  const profile = orsProfileFromRouteMap(args.profile)
  const travelMode = routeMapProfileToTravelMode(args.profile)
  const altCount = Math.min(3, Math.max(1, args.alternatives ?? 3))
  const preference = args.preference ?? 'recommended'
  const waypoints = args.waypoints ?? []

  const coordinates: [number, number][] = [
    [args.origin.lng, args.origin.lat],
    ...waypoints.map(w => [w.lng, w.lat] as [number, number]),
    [args.destination.lng, args.destination.lat],
  ]

  const body: Record<string, unknown> = {
    coordinates,
    instructions: args.instructions !== false,
    elevation: args.elevation !== false,
    preference,
  }
  if (altCount > 1 && coordinates.length === 2) {
    body.alternative_routes = {
      target_count: altCount,
      share_factor: 0.6,
      weight_factor: 1.4,
    }
  }

  const data = await orsPost<{
    features?: Array<{ geometry?: LineString; properties?: OrsFeatureProps }>
  }>(`/v2/directions/${profile}/geojson`, body, apiKey)

  const features = Array.isArray(data?.features) ? data.features : []
  if (!features.length) return null

  const legs: GroundingRouteLeg[] = features.map((f, i) => {
    const summary = f?.properties?.summary || {}
    const distanceMeters = summary.distance
    const durationSeconds = summary.duration
    return {
      label: preferenceLabel(preference, i),
      distanceMeters,
      durationSeconds,
      duration: formatRouteDuration(durationSeconds),
      distance: formatRouteDistance(distanceMeters),
      geometry: f.geometry,
      steps: parseOrsSteps(f.properties),
      elevationProfile: elevationProfileFromGeometry(f.geometry),
      preference,
    }
  })

  return buildGeoAiRouteSession(
    legs,
    args.origin,
    args.destination,
    travelMode === 'TRUCK' ? 'DRIVE' : travelMode,
    'openrouteservice',
    { waypoints, preference },
  )
}

/** Compare fastest vs shortest when only two endpoints. */
export async function orsCompareRoutePreferences(args: {
  origin: GeoAiRouteEndpoint
  destination: GeoAiRouteEndpoint
  waypoints?: GeoAiRouteEndpoint[]
  profile: RouteMapProfile
  apiKey?: string
}): Promise<GeoAiRouteSession | null> {
  const fastest = await orsDirectionsSession({
    ...args,
    preference: 'fastest',
    alternatives: 1,
    instructions: true,
    elevation: true,
  })
  const shortest = await orsDirectionsSession({
    ...args,
    preference: 'shortest',
    alternatives: 1,
    instructions: true,
    elevation: true,
  })
  if (!fastest && !shortest) return null
  if (!shortest) return fastest
  if (!fastest) return shortest
  const options = [...fastest.options, ...shortest.options.map((o, i) => ({
    ...o,
    id: `shortest-${i}`,
    label: o.label.startsWith('Shortest') ? o.label : `Shortest · ${o.durationLabel}`,
  }))]
  return {
    ...fastest,
    options,
    selectedIndex: 0,
  }
}

export async function orsIsochronesGeoJson(args: {
  center: { lng: number; lat: number; label?: string }
  profile: RouteMapProfile
  minutes: OrsIsochroneMinutes[]
  apiKey?: string
}): Promise<FeatureCollection | null> {
  const apiKey = args.apiKey?.trim() || resolveOrsApiKey()
  if (!apiKey) return null

  const profile = orsProfileFromRouteMap(args.profile)
  const range = args.minutes.map(m => m * 60).filter(n => n > 0)
  if (!range.length) return null

  const data = await orsPost<FeatureCollection>(
    `/v2/isochrones/${profile}`,
    {
      locations: [[args.center.lng, args.center.lat]],
      range,
      range_type: 'time',
    },
    apiKey,
  )

  if (!data?.features?.length) return null

  const centerLabel = args.center.label?.trim() || `${args.center.lat.toFixed(5)}, ${args.center.lng.toFixed(5)}`
  return {
    type: 'FeatureCollection',
    features: data.features.map((f, i) => ({
      ...f,
      properties: {
        ...(typeof f.properties === 'object' && f.properties ? f.properties : {}),
        role: 'isochrone',
        centerLabel,
        intervalMinutes: args.minutes[Math.min(i, args.minutes.length - 1)],
      },
    })),
  }
}

export async function orsSnapGeoJson(args: {
  points: { lng: number; lat: number; label?: string }[]
  profile: RouteMapProfile
  apiKey?: string
}): Promise<FeatureCollection | null> {
  const apiKey = args.apiKey?.trim() || resolveOrsApiKey()
  if (!apiKey || !args.points.length) return null

  const profile = orsProfileFromRouteMap(args.profile)
  const data = await orsPost<FeatureCollection>(
    `/v2/snap/${profile}`,
    {
      locations: args.points.map(p => [p.lng, p.lat]),
      radius: 350,
    },
    apiKey,
  )

  if (!data?.features?.length) return null

  return {
    type: 'FeatureCollection',
    features: data.features.map((f, i) => {
      const src = args.points[i]
      const coords = f.geometry?.type === 'Point' ? f.geometry.coordinates : null
      return {
        ...f,
        properties: {
          ...(typeof f.properties === 'object' && f.properties ? f.properties : {}),
          role: 'snapped',
          sourceLabel: src?.label || `Point ${i + 1}`,
          snappedLng: coords?.[0],
          snappedLat: coords?.[1],
        },
      }
    }),
  }
}

/** Parse matrix location lines: `lat,lng`, `label, lat, lng`, or free-text address. */
export function parseMatrixLocationLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
}

export async function orsMatrixAnalysis(args: {
  locations: { label: string; lng: number; lat: number }[]
  profile: RouteMapProfile
  apiKey?: string
}): Promise<OrsMatrixResult | null> {
  const apiKey = args.apiKey?.trim() || resolveOrsApiKey()
  if (!apiKey || args.locations.length < 2) return null

  const profile = orsProfileFromRouteMap(args.profile)
  const data = await orsPost<{
    durations?: (number | null)[][]
    distances?: (number | null)[][]
  }>(
    `/v2/matrix/${profile}`,
    {
      locations: args.locations.map(l => [l.lng, l.lat]),
      metrics: ['duration', 'distance'],
    },
    apiKey,
  )

  const durations = Array.isArray(data?.durations) ? data.durations : []
  const distances = Array.isArray(data?.distances) ? data.distances : []
  const cells: OrsMatrixCell[] = []
  const lineFeatures: FeatureCollection['features'] = []

  for (let i = 0; i < args.locations.length; i++) {
    for (let j = 0; j < args.locations.length; j++) {
      if (i === j) continue
      const durationSeconds = durations[i]?.[j] ?? null
      const distanceMeters = distances[i]?.[j] ?? null
      const from = args.locations[i]
      const to = args.locations[j]
      cells.push({
        fromIndex: i,
        toIndex: j,
        fromLabel: from.label,
        toLabel: to.label,
        durationSeconds: durationSeconds != null ? Math.round(durationSeconds) : null,
        distanceMeters: distanceMeters != null ? Math.round(distanceMeters) : null,
        durationLabel: formatRouteDuration(durationSeconds ?? undefined),
        distanceLabel: formatRouteDistance(distanceMeters ?? undefined),
      })
      if (durationSeconds != null && Number.isFinite(durationSeconds)) {
        lineFeatures.push({
          type: 'Feature',
          properties: {
            role: 'matrix-link',
            fromLabel: from.label,
            toLabel: to.label,
            durationSeconds: Math.round(durationSeconds),
            distanceMeters: distanceMeters != null ? Math.round(distanceMeters) : undefined,
          },
          geometry: {
            type: 'LineString',
            coordinates: [
              [from.lng, from.lat],
              [to.lng, to.lat],
            ],
          },
        })
      }
    }
  }

  const pointFeatures = args.locations.map((l, idx) => ({
    type: 'Feature' as const,
    properties: { role: 'matrix-node', label: l.label, matrixIndex: idx },
    geometry: { type: 'Point' as const, coordinates: [l.lng, l.lat] },
  }))

  return {
    locations: args.locations,
    cells,
    lineGeoJson: {
      type: 'FeatureCollection',
      features: [...pointFeatures, ...lineFeatures],
    },
  }
}
