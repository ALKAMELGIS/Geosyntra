import type { LineString } from 'geojson'
import {
  buildGeoAiRouteSession,
  formatRouteDistance,
  formatRouteDuration,
  routeOptionsFromGroundingLegs,
  type GeoAiRouteEndpoint,
  type GeoAiRouteSession,
  type GroundingRouteLeg,
} from './geoAiRoutePlan'
import { resolveApiUrl } from './apiClient'
import { readAccessToken } from './auth'
import { getGraphHopperApiKey } from './graphHopperApiKey'
import { mustUseApiGateway } from './platformTokenRuntime'
import { orsDirectionsSession } from './openRouteServiceRouting'
import { getOpenRouteServiceApiKey } from './openRouteServiceApiKey'
import { groundingComputeRoute } from './geoGroundingLite/groundingApiClient'

export type { RouteMapProfile } from './openRouteServiceRouting'
import type { RouteMapProfile } from './openRouteServiceRouting'

export type RouteMapTravelMode = 'DRIVE' | 'WALK' | 'BICYCLE' | 'TRUCK'

export function routeMapProfileToTravelMode(profile: RouteMapProfile): RouteMapTravelMode {
  if (profile === 'foot') return 'WALK'
  if (profile === 'bike') return 'BICYCLE'
  if (profile === 'truck') return 'TRUCK'
  return 'DRIVE'
}

export function travelModeToRouteMapProfile(mode: RouteMapTravelMode): RouteMapProfile {
  if (mode === 'WALK') return 'foot'
  if (mode === 'BICYCLE') return 'bike'
  if (mode === 'TRUCK') return 'truck'
  return 'car'
}

function lineCoordsFromGhPath(path: {
  points?: { coordinates?: number[][] } | number[][]
}): [number, number][] {
  const pts = path?.points
  if (pts && typeof pts === 'object' && 'coordinates' in pts && Array.isArray(pts.coordinates)) {
    return pts.coordinates
      .map(c => [Number(c[0]), Number(c[1])] as [number, number])
      .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))
  }
  if (Array.isArray(pts) && pts.length && Array.isArray(pts[0])) {
    return (pts as number[][])
      .map(c => [Number(c[0]), Number(c[1])] as [number, number])
      .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))
  }
  return []
}

async function graphHopperDirectionsClient(
  apiKey: string,
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  profile: RouteMapProfile,
  alternatives: number,
): Promise<GroundingRouteLeg[]> {
  const useGateway = mustUseApiGateway() || apiKey === '__gateway__'
  const params = new URLSearchParams({
    profile,
    locale: 'en',
    points_encoded: 'false',
    instructions: 'true',
    calc_points: 'true',
    point: `${origin.lat},${origin.lng}`,
  })
  if (!useGateway) params.set('key', apiKey)
  params.append('point', `${destination.lat},${destination.lng}`)
  const altCount = Math.min(3, Math.max(1, alternatives))
  if (altCount > 1) {
    params.set('algorithm', 'alternative_route')
    params.set('alternative_route.max_paths', String(altCount))
    params.set('alternative_route.max_weight_factor', '1.4')
    params.set('alternative_route.max_share_factor', '0.6')
  }

  const url = useGateway
    ? resolveApiUrl(`/api/gateway/graphhopper/route?${params.toString()}`)
    : `https://graphhopper.com/api/1/route?${params.toString()}`
  const res = await fetch(url, {
    credentials: useGateway ? 'include' : 'omit',
    headers: {
      Accept: 'application/json',
      ...(useGateway && readAccessToken() ? { Authorization: `Bearer ${readAccessToken()}` } : {}),
    },
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.message || data?.hint || `GraphHopper HTTP ${res.status}`)
  }

  const paths = Array.isArray(data?.paths) ? data.paths : []
  return paths.map((path, i) => {
    const coords = lineCoordsFromGhPath(path)
    const distanceMeters = Number(path.distance)
    const durationSeconds = Math.round((Number(path.time) || 0) / 1000)
    const geometry: LineString | undefined =
      coords.length >= 2 ? { type: 'LineString', coordinates: coords } : undefined
    return {
      label: i === 0 ? 'Recommended' : `Alternative ${i}`,
      distanceMeters,
      durationSeconds,
      duration: formatRouteDuration(durationSeconds),
      distance: formatRouteDistance(distanceMeters),
      geometry,
    }
  })
}

export async function computeSiRouteSession(args: {
  origin: GeoAiRouteEndpoint
  destination: GeoAiRouteEndpoint
  waypoints?: GeoAiRouteEndpoint[]
  profile: RouteMapProfile
  alternatives?: number
  preference?: import('./siNavigationTypes').RoutePreference
  compareFastestShortest?: boolean
}): Promise<GeoAiRouteSession | null> {
  const travelMode = routeMapProfileToTravelMode(args.profile)
  const orsKey = getOpenRouteServiceApiKey()

  if (orsKey) {
    try {
      const session = args.compareFastestShortest
        ? await import('./openRouteServiceRouting').then(m =>
            m.orsCompareRoutePreferences({
              origin: args.origin,
              destination: args.destination,
              waypoints: args.waypoints,
              profile: args.profile,
              apiKey: orsKey,
            }),
          )
        : await orsDirectionsSession({
            origin: args.origin,
            destination: args.destination,
            waypoints: args.waypoints,
            profile: args.profile,
            alternatives: args.alternatives ?? 3,
            preference: args.preference ?? 'recommended',
            instructions: true,
            elevation: true,
            apiKey: orsKey,
          })
      if (session) return session
    } catch (e) {
      console.warn('[openrouteservice] client route failed, trying fallbacks:', e)
    }
  }

  const ghKey = getGraphHopperApiKey()

  if (ghKey) {
    try {
      const legs = await graphHopperDirectionsClient(
        ghKey,
        { lat: args.origin.lat, lng: args.origin.lng },
        { lat: args.destination.lat, lng: args.destination.lng },
        args.profile,
        args.alternatives ?? 3,
      )
      if (legs.length) {
        return buildGeoAiRouteSession(
          legs,
          args.origin,
          args.destination,
          travelMode === 'TRUCK' ? 'DRIVE' : travelMode,
          'graphhopper',
        )
      }
    } catch (e) {
      console.warn('[graphhopper] client route failed, trying server:', e)
    }
  }

  const resp = await groundingComputeRoute({
    origin: { lat: args.origin.lat, lng: args.origin.lng },
    destination: { lat: args.destination.lat, lng: args.destination.lng },
    travelMode,
    alternatives: args.alternatives ?? 3,
  })
  if (!resp) return null

  const legs: GroundingRouteLeg[] = []
  if (Array.isArray(resp.routes) && resp.routes.length) {
    for (const r of resp.routes) legs.push(r)
  } else if (resp.route) {
    legs.push(resp.route)
  }
  if (!legs.length) return null

  return buildGeoAiRouteSession(
    legs,
    args.origin,
    args.destination,
    travelMode === 'TRUCK' ? 'DRIVE' : travelMode,
    resp.provider,
  )
}

export function routeSessionFromLegs(
  legs: GroundingRouteLeg[],
  origin: GeoAiRouteEndpoint,
  destination: GeoAiRouteEndpoint,
  profile: RouteMapProfile,
  provider?: string,
): GeoAiRouteSession | null {
  const travelMode = routeMapProfileToTravelMode(profile)
  return buildGeoAiRouteSession(
    legs,
    origin,
    destination,
    travelMode === 'TRUCK' ? 'DRIVE' : travelMode,
    provider,
  )
}

export { routeOptionsFromGroundingLegs }
