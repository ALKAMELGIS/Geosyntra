/**
 * Local Geo AI spatial actions (buffer, …) executed without waiting for an LLM.
 * Keeps answers map-grounded: add GeoJSON layer + zoom when intent + anchor are clear.
 */

import type { FeatureCollection, Polygon } from 'geojson'

const BUFFER_VERBS =
  /\b(buffer|buffers|buffered|ring\b|radius|ح\s*ول|دائرة|نطاق|منطقة|عازل|منطقة\s*عازلة|buffer\s*zone)\b/i

/** Distance with explicit unit (English + common Arabic). */
const RADIUS_WITH_UNIT_RE =
  /(\d+(?:[.,]\d+)?)\s*(km|kilometers?|kms?|m\b|meters?|metres?|كم|ك\s*م|كيلومتر|م\s*تر|متر)/i

function sanitizeLayerName(raw: string): string {
  const t = raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim()
  return (t.length > 80 ? t.slice(0, 80).trim() : t) || 'Geo AI layer'
}

function parseRadiusMeters(query: string): number | null {
  const m = query.match(RADIUS_WITH_UNIT_RE)
  if (!m) return null
  const n = parseFloat(String(m[1]).replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  const u = String(m[2]).toLowerCase()
  const isKm =
    u.startsWith('k') ||
    u.includes('kilom') ||
    /كم|ك\s*م|كيلومتر/.test(m[2]) ||
    u === 'kms'
  if (isKm) return n * 1000
  return n
}

function extractRequestedLayerName(query: string, fallback: string): string {
  const patterns: RegExp[] = [
    /(?:layer\s+)?(?:named|called)\s+["']([^"']{1,120})["']/i,
    /(?:layer\s+)?(?:named|called)\s+([A-Za-z0-9 _\-]{2,80})/i,
    /\bname\s*(?:is|[:=])\s*["']([^"']{1,120})["']/i,
    /باسم\s*["']?([^"'\n]{1,120})["']?/u,
    /اسم\s*الطبقة\s*[:=]\s*["']?([^"'\n]{1,120})["']?/u,
  ]
  for (const p of patterns) {
    const m = query.match(p)
    const v = m?.[1]?.trim()
    if (v) return sanitizeLayerName(v)
  }
  return sanitizeLayerName(fallback)
}

/** Rough WGS84 coordinate pair in user text (longitude often larger magnitude in MENA). */
function parseExplicitLonLatFromText(text: string): { lng: number; lat: number } | null {
  const re = /(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,2}(?:\.\d+)?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const a = parseFloat(m[1])
    const b = parseFloat(m[2])
    if (![a, b].every(Number.isFinite)) continue
    if (Math.abs(a) > 180 || Math.abs(b) > 180) continue
    const aAsLng = Math.abs(a) > 20 && Math.abs(b) <= 90
    const bAsLng = Math.abs(b) > 20 && Math.abs(a) <= 90
    if (aAsLng && !bAsLng) return { lng: a, lat: b }
    if (bAsLng && !aAsLng) return { lng: b, lat: a }
    if (Math.abs(a) <= 180 && Math.abs(b) <= 90) return { lng: a, lat: b }
  }
  return null
}

const EARTH_R_M = 6371008.8

/** Geodesic circle as a GeoJSON Polygon (outer ring closed). */
export function geodesicCirclePolygon(lon: number, lat: number, radiusM: number, steps = 72): Polygon {
  const rad = Math.PI / 180
  const φ1 = lat * rad
  const λ1 = lon * rad
  const δ = radiusM / EARTH_R_M
  const ring: [number, number][] = []
  for (let i = 0; i < steps; i++) {
    const θ = (i / steps) * 2 * Math.PI
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
    const λ2 =
      λ1 +
      Math.atan2(
        Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
        Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
      )
    const outLng = (λ2 / rad + 540) % 360 - 180
    const outLat = Math.max(-89.999, Math.min(89.999, φ2 / rad))
    ring.push([outLng, outLat])
  }
  if (ring.length) ring.push([...ring[0]]!)
  return { type: 'Polygon', coordinates: [ring] }
}

export type GeoAiSpatialAnchorContext = {
  query: string
  pinLngLat: [number, number] | null
  lastMapQueryCoords: [number, number] | null
}

export type GeoAiBufferSpatialResult =
  | { handled: false }
  | { handled: true; ok: false; reply: string }
  | {
      handled: true
      ok: true
      reply: string
      featureCollection: FeatureCollection
      layerName: string
      center: [number, number]
      radiusMeters: number
    }

function wantsBuffer(query: string): boolean {
  const q = query.trim()
  if (!q) return false
  if (!BUFFER_VERBS.test(q)) return false
  return parseRadiusMeters(q) != null
}

function bboxOfFeatureCollection(fc: FeatureCollection): [number, number, number, number] | null {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  const consumeRing = (ring: [number, number][]) => {
    for (const pt of ring) {
      const lng = pt[0]
      const lat = pt[1]
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
      if (lng < minLng) minLng = lng
      if (lat < minLat) minLat = lat
      if (lng > maxLng) maxLng = lng
      if (lat > maxLat) maxLat = lat
    }
  }
  for (const f of fc.features) {
    const g = f.geometry
    if (!g || typeof g !== 'object') continue
    if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
      for (const ring of g.coordinates) consumeRing(ring as [number, number][])
    }
  }
  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return null
  return [minLng, minLat, maxLng, maxLat]
}

/** Fit Mapbox GL map from a ref (`mapRef` from react-map-gl) to a FeatureCollection bounds. */
export function fitMapboxMapToFeatureCollection(mapRef: { current: unknown }, fc: FeatureCollection): void {
  const bbox = bboxOfFeatureCollection(fc)
  if (!bbox) return
  const [minX, minY, maxX, maxY] = bbox
  const raw = mapRef.current as { getMap?: () => unknown } | null | undefined
  const mapInstance = raw && typeof raw === 'object' && typeof raw.getMap === 'function' ? raw.getMap() : raw
  if (!mapInstance || typeof (mapInstance as { fitBounds?: unknown }).fitBounds !== 'function') return
  try {
    ;(mapInstance as { fitBounds: (b: [[number, number], [number, number]], o: object) => void }).fitBounds(
      [
        [minX, minY],
        [maxX, maxY],
      ],
      { padding: 80, duration: 800 },
    )
  } catch {
    /* ignore */
  }
}

export function tryGeoAiBufferSpatialAction(ctx: GeoAiSpatialAnchorContext): GeoAiBufferSpatialResult {
  const query = ctx.query.trim()
  if (!wantsBuffer(query)) return { handled: false }

  const radiusM = parseRadiusMeters(query)
  if (!radiusM) {
    return {
      handled: true,
      ok: false,
      reply:
        'Add a buffer distance with a unit (for example **3 km** or **500 m** / **٣ كم**), then try again.',
    }
  }

  const fromText = parseExplicitLonLatFromText(query)
  const anchor = fromText
    ? ([fromText.lng, fromText.lat] as [number, number])
    : ctx.pinLngLat
      ? ctx.pinLngLat
      : ctx.lastMapQueryCoords
        ? ctx.lastMapQueryCoords
        : null

  if (!anchor) {
    return {
      handled: true,
      ok: false,
      reply:
        'Place a **map pin** on the point (or fly the map and use a prior **MAP_QUERY** anchor), or paste **longitude, latitude** in the message, then ask for the buffer again.',
    }
  }

  const [lng, lat] = anchor
  const poly = geodesicCirclePolygon(lng, lat, radiusM, 80)
  const km = radiusM / 1000
  const defaultName =
    km >= 1 ? `Buffer ${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} km` : `Buffer ${Math.round(radiusM)} m`
  const layerName = extractRequestedLayerName(query, defaultName)

  const fc: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          name: layerName,
          radius_m: radiusM,
          center_lng: lng,
          center_lat: lat,
          source: 'Geo AI buffer',
        },
        geometry: poly,
      },
    ],
  }

  const kmLabel = km >= 1 ? `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} km` : `${Math.round(radiusM)} m`
  const reply =
    `**Buffer applied on the map**\n\n` +
    `- **Layer:** ${layerName}\n` +
    `- **Radius:** ${kmLabel} (geodesic)\n` +
    `- **Center:** ${lng.toFixed(5)}, ${lat.toFixed(5)} (WGS84)\n\n` +
    `The polygon was added to **Layers** and the view zooms to it.`

  return {
    handled: true,
    ok: true,
    reply,
    featureCollection: fc,
    layerName,
    center: [lng, lat],
    radiusMeters: radiusM,
  }
}
