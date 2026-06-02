/**
 * GraphHopper Directions API — driving, walking, cycling, truck, alternatives.
 * @see https://docs.graphhopper.com/
 */

function pickGraphHopperKey() {
  return (
    process.env.GRAPHHOPPER_API_KEY?.trim() ||
    process.env.GRAPHOPPER_API_KEY?.trim() ||
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

async function readGraphHopperKeyFromSecretsFile(secretsFilePath) {
  if (!secretsFilePath) return null
  try {
    const fs = await import('fs')
    if (!fs.existsSync(secretsFilePath)) return null
    const raw = JSON.parse(fs.readFileSync(secretsFilePath, 'utf8'))
    const builtin = resolveBuiltinSecrets(raw)
    const custom = resolveCustomSlots(raw)
    const candidates = [
      builtin?.graphHopperApiKey,
      builtin?.graphhopperApiKey,
      custom?.graphhopper_api_key,
      custom?.graph_hopper_api_key,
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

export async function resolveGraphHopperKey(secretsFilePath) {
  return pickGraphHopperKey() || (await readGraphHopperKeyFromSecretsFile(secretsFilePath))
}

export function mapTravelModeToGraphHopperProfile(travelMode = 'DRIVE') {
  const t = String(travelMode || 'DRIVE').toUpperCase()
  if (t === 'TRUCK') return 'truck'
  if (t === 'WALK' || t === 'WALKING' || t === 'PEDESTRIAN' || t === 'FOOT') return 'foot'
  if (t === 'BICYCLE' || t === 'CYCLING' || t === 'BIKE') return 'bike'
  return 'car'
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

function lineCoordsFromPath(path) {
  const pts = path?.points
  if (pts?.coordinates && Array.isArray(pts.coordinates)) {
    return pts.coordinates.map(c => [Number(c[0]), Number(c[1])]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))
  }
  if (Array.isArray(pts) && pts.length && Array.isArray(pts[0])) {
    return pts.map(c => [Number(c[0]), Number(c[1])]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))
  }
  return []
}

/**
 * @returns {Promise<{ routes: object[]; profile: string } | null>}
 */
export async function graphHopperDirections(
  apiKey,
  { origin, destination, travelMode = 'DRIVE', alternatives = 2 },
) {
  const profile = mapTravelModeToGraphHopperProfile(travelMode)
  const altCount = Math.min(3, Math.max(1, alternatives))
  const params = new URLSearchParams({
    key: apiKey,
    profile,
    locale: 'en',
    points_encoded: 'false',
    instructions: 'true',
    calc_points: 'true',
    point: `${origin.lat},${origin.lng}`,
  })
  params.append('point', `${destination.lat},${destination.lng}`)
  if (altCount > 1) {
    params.set('algorithm', 'alternative_route')
    params.set('alternative_route.max_paths', String(altCount))
    params.set('alternative_route.max_weight_factor', '1.4')
    params.set('alternative_route.max_share_factor', '0.6')
  }

  const url = `https://graphhopper.com/api/1/route?${params.toString()}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const data = await res.json()
  if (!res.ok) {
    const msg = data?.message || data?.hint || `graphhopper_http_${res.status}`
    throw new Error(msg)
  }

  const paths = Array.isArray(data?.paths) ? data.paths : []
  if (!paths.length) return null

  const routes = paths.map((path, i) => {
    const coords = lineCoordsFromPath(path)
    const distanceMeters = path.distance
    const durationSeconds = Math.round((Number(path.time) || 0) / 1000)
    return {
      label: i === 0 ? 'Recommended' : `Alternative ${i}`,
      distanceMeters,
      durationSeconds,
      duration: formatDurationSeconds(durationSeconds),
      distance: formatDistanceMeters(distanceMeters),
      geometry: coords.length >= 2 ? { type: 'LineString', coordinates: coords } : undefined,
      instructions: Array.isArray(path.instructions) ? path.instructions : undefined,
    }
  })

  return { routes, profile }
}
