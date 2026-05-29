/**
 * Google Maps Platform helpers for Geo Explor AI Agent (Grounding Lite–style MCP tools).
 * Architecture inspired by googlemaps-samples/grounding-lite-mcp-sample-app (Apache-2.0).
 */

function pickApiKey() {
  const k =
    process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.SERVER_API_KEY?.trim() ||
    ''
  return k || null
}

async function readKeyFromSecretsFile(secretsFilePath) {
  if (!secretsFilePath) return null
  try {
    const fs = await import('fs')
    if (!fs.existsSync(secretsFilePath)) return null
    const raw = JSON.parse(fs.readFileSync(secretsFilePath, 'utf8'))
    const builtin = raw?.builtin && typeof raw.builtin === 'object' ? raw.builtin : raw
    const custom = raw?.customSlots && typeof raw.customSlots === 'object' ? raw.customSlots : {}
    const candidates = [
      builtin?.googleMapsServerApiKey,
      builtin?.googleMapsApiKey,
      custom?.google_maps_server_api_key,
      custom?.google_maps_api_key,
    ]
    for (const c of candidates) {
      const s = typeof c === 'string' ? c.trim() : ''
      if (s) return s
    }
  } catch {
    /* ignore */
  }
  return null
}

export async function resolveGoogleMapsServerApiKey(secretsFilePath) {
  return pickApiKey() || (await readKeyFromSecretsFile(secretsFilePath))
}

export async function geocodeAddress(apiKey, { address, language = 'en' }) {
  const q = new URLSearchParams({ address, key: apiKey, language })
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${q}`)
  const data = await res.json()
  if (!res.ok || data.status === 'REQUEST_DENIED') {
    throw new Error(data?.error_message || data?.status || `geocode_http_${res.status}`)
  }
  const results = Array.isArray(data.results) ? data.results : []
  return results.slice(0, 5).map(r => ({
    label: r.formatted_address,
    lat: r.geometry?.location?.lat,
    lng: r.geometry?.location?.lng,
    placeId: r.place_id,
    types: r.types,
  }))
}

export async function placesTextSearch(apiKey, { textQuery, locationBias, language = 'en', maxResults = 8 }) {
  const body = { textQuery, languageCode: language, maxResultCount: Math.min(20, Math.max(1, maxResults)) }
  if (locationBias?.lat != null && locationBias?.lng != null) {
    body.locationBias = {
      circle: {
        center: { latitude: locationBias.lat, longitude: locationBias.lng },
        radius: locationBias.radiusMeters ?? 25000,
      },
    }
  }
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.googleMapsUri,places.id',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = data?.error?.message || `places_http_${res.status}`
    throw new Error(msg)
  }
  const places = Array.isArray(data.places) ? data.places : []
  return places.map(p => ({
    id: p.id,
    name: p.displayName?.text || p.formattedAddress,
    address: p.formattedAddress,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    types: p.types,
    rating: p.rating,
    mapsUri: p.googleMapsUri,
  }))
}

export async function computeRoute(apiKey, { origin, destination, travelMode = 'DRIVE' }) {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode,
      languageCode: 'en',
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error?.message || `routes_http_${res.status}`)
  }
  const route = data.routes?.[0]
  if (!route) return null
  return {
    distanceMeters: route.distanceMeters,
    duration: route.duration,
    polyline: route.polyline?.encodedPolyline,
    legs: route.legs,
  }
}

export async function sampleElevation(apiKey, { locations }) {
  const locParam = locations
    .slice(0, 20)
    .map(p => `${p.lat},${p.lng}`)
    .join('|')
  const q = new URLSearchParams({ locations: locParam, key: apiKey })
  const res = await fetch(`https://maps.googleapis.com/maps/api/elevation/json?${q}`)
  const data = await res.json()
  if (!res.ok || data.status === 'REQUEST_DENIED') {
    throw new Error(data?.error_message || data?.status || `elevation_http_${res.status}`)
  }
  return (data.results || []).map((r, i) => ({
    lat: locations[i]?.lat,
    lng: locations[i]?.lng,
    elevationMeters: r.elevation,
    resolutionMeters: r.resolution,
  }))
}
