/**
 * Geo AI voice / text → structured GIS JSON (Mapbox GIS assistant).
 * Rule-based normalizer for noisy speech; use GEO_AI_VOICE_GIS_JSON_SYSTEM_PROMPT for LLM fallback.
 */

export type GeoAiVoiceGisIntentType =
  | 'POI_SEARCH'
  | 'AOI_ANALYSIS'
  | 'ROUTE_REQUEST'
  | 'MAP_ACTION'
  | 'LAYER_CONTROL'

export type GeoAiVoiceGisIntent = {
  intent: GeoAiVoiceGisIntentType
  query: string
  category: string
  location: string
  radius: number
  action: string
  confidence: number
}

/** System prompt: LLM must return ONLY JSON matching GeoAiVoiceGisIntent shape. */
export const GEO_AI_VOICE_GIS_JSON_SYSTEM_PROMPT = `You are a GeoAI assistant for a Mapbox GIS system.

Convert user voice/text into structured GIS JSON actions.

Return ONLY JSON.

Intents:
POI_SEARCH (places like hospitals, cafes, schools)
AOI_ANALYSIS (area statistics, spatial analysis)
ROUTE_REQUEST (directions between locations)
MAP_ACTION (zoom, pan, fly-to)
LAYER_CONTROL (toggle/switch layers)

Output format:
{
  "intent": "",
  "query": "",
  "category": "",
  "location": "",
  "radius": 0,
  "action": "",
  "confidence": 0
}

Rules:
No explanations
No markdown
Always return JSON only
Assume voice input is noisy and normalize it
Default to POI_SEARCH if unclear`

const FILLER_RE = /\b(um+|uh+|er+|ah+|like|please|hey)\b/gi

const POI_CATEGORIES: Array<{ re: RegExp; category: string }> = [
  { re: /\b(hospitals?|clinic|medical)\b/i, category: 'hospital' },
  { re: /\b(schools?|universit(y|ies)|college)\b/i, category: 'school' },
  { re: /\b(cafes?|coffee|restaurants?|food)\b/i, category: 'cafe' },
  { re: /\b(hotels?|lodging)\b/i, category: 'hotel' },
  { re: /\b(pharmacies?|drug\s*store)\b/i, category: 'pharmacy' },
  { re: /\b(gas\s+stations?|fuel)\b/i, category: 'fuel' },
  { re: /\b(parks?|playground)\b/i, category: 'park' },
]

function normalizeVoiceText(raw: string): string {
  return raw
    .replace(FILLER_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractRouteEndpoints(q: string): { from: string; to: string } {
  const fromTo = q.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?:\.|$|\?)/i)
  if (fromTo) return { from: fromTo[1]!.trim(), to: fromTo[2]!.trim() }
  const routeTo = q.match(/\b(?:route|directions?|navigate|drive|walk)\s+(?:me\s+)?to\s+(.+?)(?:\.|$|\?)/i)
  if (routeTo) return { from: '', to: routeTo[1]!.trim() }
  const between = q.match(/\bbetween\s+(.+?)\s+and\s+(.+?)(?:\.|$|\?)/i)
  if (between) return { from: between[1]!.trim(), to: between[2]!.trim() }
  return { from: '', to: '' }
}

function extractRadiusMeters(q: string): number {
  const km = q.match(/(\d+(?:\.\d+)?)\s*(?:km|kilometers?)\b/i)
  if (km) return Math.round(Number(km[1]) * 1000)
  const m = q.match(/(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?)\b/i)
  if (m) return Math.round(Number(m[1]))
  if (/\bnear\s+me|nearby\b/i.test(q)) return 2500
  return 0
}

function extractLocationPhrase(q: string): string {
  const near = q.match(/\b(?:near|around|in|at)\s+(.+?)(?:\.|$|\?|,)/i)
  if (near?.[1]) return near[1].trim()
  const show = q.match(/\b(?:show|find|search)\s+(?:for\s+)?(.+?)(?:\.|$|\?)/i)
  if (show?.[1] && !/\b(layer|ndvi|wms)\b/i.test(show[1])) return show[1].trim()
  return ''
}

function emptyIntent(query: string): GeoAiVoiceGisIntent {
  return {
    intent: 'POI_SEARCH',
    query,
    category: '',
    location: '',
    radius: 0,
    action: '',
    confidence: 0.35,
  }
}

/**
 * Parse voice or typed text into GIS JSON intent (no LLM).
 */
export function parseGeoAiVoiceGisIntent(rawInput: string): GeoAiVoiceGisIntent {
  const query = normalizeVoiceText(rawInput)
  if (!query) return emptyIntent('')

  const q = query.toLowerCase()

  if (
    /\b(route|directions?|navigate|drive\s+to|walk(?:ing)?\s+to|how\s+(?:do\s+i\s+)?get\s+to|from\s+.+\s+to\s+)\b/i.test(
      query,
    )
  ) {
    const { from, to } = extractRouteEndpoints(query)
    const location = [from, to].filter(Boolean).join(' → ')
    return {
      intent: 'ROUTE_REQUEST',
      query,
      category: '',
      location,
      radius: 0,
      action: from && to ? 'directions' : 'directions',
      confidence: location ? 0.88 : 0.72,
    }
  }

  if (/\b(zoom|pan|fly\s+to|go\s+to|center|centre|show\s+me\s+.+\s+on\s+(?:the\s+)?map|where\s+is)\b/i.test(query)) {
    const place =
      extractLocationPhrase(query) ||
      query.match(/\b(?:fly\s+to|go\s+to|zoom\s+to|show\s+me)\s+(.+?)(?:\s+on\s+(?:the\s+)?map)?(?:\.|$|\?)/i)?.[1]?.trim() ||
      ''
    let action = 'fly_to'
    if (/\bzoom\s+in\b/i.test(q)) action = 'zoom_in'
    else if (/\bzoom\s+out\b/i.test(q)) action = 'zoom_out'
    else if (/\bpan\b/i.test(q)) action = 'pan'
    return {
      intent: 'MAP_ACTION',
      query,
      category: '',
      location: place,
      radius: 0,
      action,
      confidence: place ? 0.85 : 0.7,
    }
  }

  if (
    /\b(compare\s+layers?|layer\s+compare|toggle\s+layer|show\s+layer|hide\s+layer|turn\s+(?:on|off)|ndvi|ndwi|wms|basemap|legend)\b/i.test(
      query,
    )
  ) {
    let action = 'toggle'
    if (/\bcompare\b/i.test(q)) action = 'compare'
    else if (/\bhide\b/i.test(q)) action = 'hide'
    else if (/\bshow\b/i.test(q)) action = 'show'
    const layer =
      query.match(/\b(ndvi|ndwi|lst|evi|sentinel|wms|basemap|legend)\b/i)?.[1]?.toUpperCase() ?? ''
    return {
      intent: 'LAYER_CONTROL',
      query,
      category: layer,
      location: '',
      radius: 0,
      action,
      confidence: 0.8,
    }
  }

  if (
    /\b(aoi|polygon|zonal|statistics|spatial\s+analysis|mean\s+in|average\s+in|analyze\s+(?:this\s+)?area|heatmap)\b/i.test(
      query,
    )
  ) {
    return {
      intent: 'AOI_ANALYSIS',
      query,
      category: '',
      location: extractLocationPhrase(query),
      radius: extractRadiusMeters(query),
      action: /\bheatmap\b/i.test(q) ? 'heatmap' : 'zonal_stats',
      confidence: 0.82,
    }
  }

  let category = ''
  for (const row of POI_CATEGORIES) {
    if (row.re.test(query)) {
      category = row.category
      break
    }
  }
  if (!category && /\bplaces?\s+near|nearby|poi\b/i.test(q)) category = 'place'

  const location = extractLocationPhrase(query)
  const radius = extractRadiusMeters(query)

  return {
    intent: 'POI_SEARCH',
    query,
    category,
    location,
    radius,
    action: category ? 'search_poi' : 'search',
    confidence: category || location ? 0.75 : 0.45,
  }
}

export function formatGeoAiVoiceGisIntentJson(intent: GeoAiVoiceGisIntent): string {
  return JSON.stringify(intent)
}

/** Build a natural-language prompt for the Geo AI agent from structured intent. */
export function geoAiPromptFromVoiceGisIntent(intent: GeoAiVoiceGisIntent): string {
  switch (intent.intent) {
    case 'ROUTE_REQUEST':
      if (intent.location.includes('→')) {
        const [from, to] = intent.location.split('→').map(s => s.trim())
        return from && to ? `Route from ${from} to ${to}` : `Route to ${intent.location}`
      }
      return intent.location ? `Directions to ${intent.location}` : intent.query
    case 'MAP_ACTION':
      if (intent.location) {
        if (intent.action === 'zoom_in') return `Zoom in on ${intent.location}`
        if (intent.action === 'zoom_out') return `Zoom out on ${intent.location}`
        return `Show ${intent.location} on the map`
      }
      return intent.query
    case 'LAYER_CONTROL':
      if (intent.category) return `${intent.action} ${intent.category} layer`
      return intent.query
    case 'AOI_ANALYSIS':
      return intent.query
    case 'POI_SEARCH':
    default:
      if (intent.category && intent.location) {
        return `Find ${intent.category} near ${intent.location}`
      }
      if (intent.category) return `Find nearby ${intent.category}`
      if (intent.location) return `Search places near ${intent.location}`
      return intent.query
  }
}

export function tryParseGeoAiVoiceGisIntentJson(text: string): GeoAiVoiceGisIntent | null {
  const t = text.trim()
  if (!t.startsWith('{')) return null
  try {
    const o = JSON.parse(t) as Partial<GeoAiVoiceGisIntent>
    const intent = String(o.intent ?? '').toUpperCase() as GeoAiVoiceGisIntentType
    const valid: GeoAiVoiceGisIntentType[] = [
      'POI_SEARCH',
      'AOI_ANALYSIS',
      'ROUTE_REQUEST',
      'MAP_ACTION',
      'LAYER_CONTROL',
    ]
    if (!valid.includes(intent)) return null
    return {
      intent,
      query: String(o.query ?? ''),
      category: String(o.category ?? ''),
      location: String(o.location ?? ''),
      radius: Number(o.radius) || 0,
      action: String(o.action ?? ''),
      confidence: Math.min(1, Math.max(0, Number(o.confidence) || 0.5)),
    }
  } catch {
    return null
  }
}
