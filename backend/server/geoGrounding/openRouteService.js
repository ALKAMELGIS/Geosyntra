/**
 * OpenRouteService directions (free tier with API key).
 * @see https://github.com/GIScience/openrouteservice
 */

function pickOrsKey() {
  return (
    process.env.OPENROUTESERVICE_API_KEY?.trim() ||
    process.env.ORS_API_KEY?.trim() ||
    process.env.OPENROUTE_SERVICE_API_KEY?.trim() ||
    ''
  )
}

function resolveBuiltinSecrets(raw) {
  if (!raw || typeof raw !== 'object') return {}
  if (raw.secretsPlain?.builtin && typeof raw.secretsPlain.builtin === 'object') {
    return raw.secretsPlain.builtin
  }
  if (raw.builtin && typeof raw.builtin === 'object') return raw.builtin
  return raw
}

function resolveCustomSlots(raw) {
  if (!raw || typeof raw !== 'object') return {}
  if (raw.secretsPlain?.customSlots && typeof raw.secretsPlain.customSlots === 'object') {
    return raw.secretsPlain.customSlots
  }
  if (raw.customSlots && typeof raw.customSlots === 'object') return raw.customSlots
  return {}
}

async function readOrsKeyFromSecretsFile(secretsFilePath) {
  if (!secretsFilePath) return null
  try {
    const fs = await import('fs')
    if (!fs.existsSync(secretsFilePath)) return null
    const raw = JSON.parse(fs.readFileSync(secretsFilePath, 'utf8'))
    const builtin = resolveBuiltinSecrets(raw)
    const custom = resolveCustomSlots(raw)
    const candidates = [
      builtin?.orsApiKey,
      builtin?.openRouteServiceApiKey,
      builtin?.openrouteserviceApiKey,
      custom?.ors_api_key,
      custom?.openrouteservice_api_key,
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

export async function resolveOpenRouteServiceKey(secretsFilePath) {
  return pickOrsKey() || (await readOrsKeyFromSecretsFile(secretsFilePath))
}

export function mapTravelModeToOrsProfile(travelMode = 'DRIVE') {
  const t = String(travelMode || 'DRIVE').toUpperCase()
  if (t === 'WALK' || t === 'WALKING' || t === 'PEDESTRIAN') return 'foot-walking'
  if (t === 'BICYCLE' || t === 'CYCLING' || t === 'BIKE') return 'cycling-regular'
  return 'driving-car'
}

function formatDurationSeconds(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  if (s < 60) return `${s} sec`
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m < 60) return r ? `${m} min ${r} sec` : `${m} min`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h} hr ${rm} min` : `${h} hr`
}

function formatDistanceMeters(m) {
  const n = Number(m)
  if (!Number.isFinite(n)) return ''
  if (n >= 1000) return `${(n / 1000).toFixed(1)} km`
  return `${Math.round(n)} m`
}

/**
 * @returns {Promise<{ routes: object[]; bbox?: number[] } | null>}
 */
export async function orsDirections(apiKey, { origin, destination, travelMode = 'DRIVE', alternatives = 2 }) {
  const profile = mapTravelModeToOrsProfile(travelMode)
  const url = `https://api.openrouteservice.org/v2/directions/${profile}/geojson`
  const altCount = Math.min(3, Math.max(1, alternatives))
  const body = {
    coordinates: [
      [origin.lng, origin.lat],
      [destination.lng, destination.lat],
    ],
    instructions: false,
    elevation: false,
  }
  if (altCount > 1) {
    body.alternative_routes = {
      target_count: altCount,
      share_factor: 0.6,
      weight_factor: 1.4,
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, application/geo+json',
      Authorization: apiKey,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `ors_http_${res.status}`
    throw new Error(msg)
  }

  const features = Array.isArray(data?.features) ? data.features : []
  if (!features.length) return null

  const routes = features.map((f, i) => {
    const summary = f?.properties?.summary || {}
    const distanceMeters = summary.distance
    const durationSeconds = summary.duration
    return {
      label: i === 0 ? 'Recommended' : `Alternative ${i}`,
      distanceMeters,
      durationSeconds,
      duration: formatDurationSeconds(durationSeconds),
      distance: formatDistanceMeters(distanceMeters),
      geometry: f.geometry,
    }
  })

  return { routes, bbox: Array.isArray(data.bbox) ? data.bbox : undefined, profile }
}
