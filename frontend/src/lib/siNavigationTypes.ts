import type { GeoAiRouteEndpoint, GeoAiRouteSession } from './geoAiRoutePlan'

export type RoutePreference = 'recommended' | 'fastest' | 'shortest'

export type NavigationTurnStep = {
  instruction: string
  distanceMeters?: number
  durationSeconds?: number
  streetName?: string
  type?: number
}

export type ElevationSample = {
  distanceM: number
  elevationM: number
}

export type NavigationProgress = {
  active: boolean
  stepIndex: number
  /** 0–1 along full route geometry */
  routeProgress: number
  voiceEnabled: boolean
}

export type CachedRouteEntry = {
  key: string
  savedAt: string
  session: GeoAiRouteSession
}

export function buildRouteCacheKey(
  coords: Array<{ lng: number; lat: number }>,
  profile: string,
  preference: RoutePreference,
): string {
  const flat = coords.map(c => `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`).join('|')
  return `${profile}:${preference}:${flat}`
}

export function estimateFuelLiters(distanceMeters: number, profile: string): number {
  const km = distanceMeters / 1000
  const per100 =
    profile === 'truck' ? 28 : profile === 'foot' || profile === 'bike' ? 0 : 8.2
  return Math.round((km / 100) * per100 * 10) / 10
}
