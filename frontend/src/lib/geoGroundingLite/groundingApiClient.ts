import type { GeoGroundingGeocodeResult, GeoGroundingPlace, GeoGroundingRouteResult, GeoGroundingToolId } from './types'

function apiBase(): string {
  const env = String(import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
  if (env) return env
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return ''
}

export async function fetchGeoGroundingStatus(): Promise<{
  configured: boolean
  tools: string[]
  googleMapsPlatform?: boolean
}> {
  const base = apiBase()
  if (!base) return { configured: false, tools: [] }
  try {
    const res = await fetch(`${base}/api/geo/grounding/status`)
    if (!res.ok) return { configured: false, tools: [] }
    const data = await res.json()
    const providers = data.providers && typeof data.providers === 'object' ? data.providers : {}
    return {
      configured: Boolean(data.configured),
      tools: Array.isArray(data.tools) ? data.tools : [],
      googleMapsPlatform: Boolean(providers.google_maps_platform),
    }
  } catch {
    return { configured: false, tools: [] }
  }
}

async function invokeTool<T>(tool: GeoGroundingToolId, body: Record<string, unknown>): Promise<T | null> {
  const base = apiBase()
  if (!base) return null
  try {
    const res = await fetch(`${base}/api/geo/grounding/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, ...body }),
    })
    const data = await res.json()
    if (!res.ok || !data.ok) return null
    return data as T
  } catch {
    return null
  }
}

export async function groundingGeocode(
  address: string,
  language = 'en',
): Promise<GeoGroundingGeocodeResult[]> {
  const data = await invokeTool<{ results: GeoGroundingGeocodeResult[] }>('geocode', { address, language })
  return data?.results ?? []
}

export async function groundingPlacesSearch(args: {
  textQuery: string
  lat?: number
  lng?: number
  radiusMeters?: number
  language?: string
  maxResults?: number
}): Promise<GeoGroundingPlace[]> {
  const body: Record<string, unknown> = {
    textQuery: args.textQuery,
    language: args.language ?? 'en',
    maxResults: args.maxResults ?? 8,
  }
  if (args.lat != null && args.lng != null) {
    body.locationBias = { lat: args.lat, lng: args.lng, radiusMeters: args.radiusMeters ?? 25000 }
  }
  const data = await invokeTool<{ results: GeoGroundingPlace[] }>('places_text_search', body)
  return data?.results ?? []
}

export type GroundingComputeRouteResponse = {
  route: GeoGroundingRouteResult | null
  routes?: GeoGroundingRouteResult[]
  provider?: string
  profile?: string
}

export async function groundingComputeRoute(args: {
  origin: { lat: number; lng: number }
  destination: { lat: number; lng: number }
  travelMode?: string
  alternatives?: number
}): Promise<GroundingComputeRouteResponse | null> {
  const data = await invokeTool<GroundingComputeRouteResponse & { ok?: boolean }>('compute_route', args)
  if (!data?.route && !data?.routes?.length) return null
  return {
    route: data.route ?? data.routes?.[0] ?? null,
    routes: data.routes,
    provider: data.provider,
    profile: data.profile,
  }
}

export async function groundingElevation(
  locations: { lat: number; lng: number }[],
): Promise<{ lat?: number; lng?: number; elevationMeters?: number }[]> {
  const data = await invokeTool<{ results: { lat?: number; lng?: number; elevationMeters?: number }[] }>(
    'elevation',
    { locations },
  )
  return data?.results ?? []
}
