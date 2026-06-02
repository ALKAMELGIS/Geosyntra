import type { GeoGroundingToolId } from './types'

export type GeoGroundingIntent = {
  tools: GeoGroundingToolId[]
  placesQuery: string | null
  geocodeQuery: string | null
  routeEndpoints: { originText: string; destinationText: string } | null
  wantsElevation: boolean
}

const PLACES_RE =
  /\b(nearby|near me|near this place|this place|around here|poi|restaurant|cafe|coffee|hotels?|hotel|hospital|pharmacy|gas station|supermarket|atm|park|museum|find (?:a |some )?|find hotels?|search for|places to|what(?:'s| is) near|hotels?\s+near)\b|(?:مطاعم|مقاهي|قريب|بالقرب|أماكن|مستشفى|صيدلية|فندق|فنادق|بحث عن)/i

const ROUTE_RE =
  /\b(directions?|route\b|show\s+me\s+(?:the\s+)?route|route\s+(?:on|in)\s+(?:the\s+)?map|route\s+analysis|drive\s+to|how\s+(?:do\s+i\s+|to\s+)?get\s+to|walking\s+route|cycling\s+route|navigate\s+to|from\s+.+\s+to\s+)\b|(?:اتجاهات|مسار|كيف أصل|من .+ إلى)/i

const GEOCODE_RE =
  /\b(where is|locate|address of|coordinates of|geocode|find location of|show\s+me|go\s+to|fly\s+to|zoom\s+to|open\s+.+\s+on\s+(?:the\s+)?map)\b|(?:أين|موقع|عنوان|أرني|اعرض\s+لي)/i

const ELEVATION_RE = /\b(elevation|altitude|height above sea)\b|(?:ارتفاع|منسوب)/i

function extractRoutePair(text: string): { originText: string; destinationText: string } | null {
  const fromTo = text.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?:\.|$|\?)/i)
  if (fromTo) return { originText: fromTo[1].trim(), destinationText: fromTo[2].trim() }
  const ar = text.match(/من\s+(.+?)\s+(?:إلى|الى)\s+(.+?)(?:\.|$|\?)/)
  if (ar) return { originText: ar[1].trim(), destinationText: ar[2].trim() }
  const routeTo = text.match(/\b(?:route|directions?|drive)\s+to\s+(.+?)(?:\.|$|\?)/i)
  if (routeTo) return { originText: '', destinationText: routeTo[1].trim() }
  const toThisPlace = /\b(?:route|directions?)\s+to\s+this\s+place\b/i.test(text)
  if (toThisPlace) return { originText: '', destinationText: '__map_pin_destination__' }
  const fromPin = /\b(?:route|directions?)\s+from\s+(?:here|map\s+pin|this\s+pin)\s+to\s+(.+?)(?:\.|$|\?)/i.exec(
    text,
  )
  if (fromPin) return { originText: '__map_pin_origin__', destinationText: fromPin[1].trim() }
  return null
}

function stripIntentPrefixes(text: string): string {
  return text
    .replace(/^(find|search for|show me|list|what are)\s+/i, '')
    .replace(/^(ابحث عن|اعثر على|أرني)\s+/u, '')
    .trim()
}

export function detectGeoGroundingIntent(userText: string): GeoGroundingIntent {
  const t = userText.trim()
  const tools: GeoGroundingToolId[] = []
  let placesQuery: string | null = null
  let geocodeQuery: string | null = null
  let routeEndpoints: GeoGroundingIntent['routeEndpoints'] = null
  let wantsElevation = ELEVATION_RE.test(t)

  if (ROUTE_RE.test(t)) {
    tools.push('compute_route', 'geocode')
    routeEndpoints = extractRoutePair(t)
  }

  if (PLACES_RE.test(t) && !routeEndpoints) {
    tools.push('places_text_search')
    placesQuery = stripIntentPrefixes(t).slice(0, 200) || t.slice(0, 200)
  }

  if (GEOCODE_RE.test(t) && !placesQuery) {
    tools.push('geocode')
    geocodeQuery = stripIntentPrefixes(t).slice(0, 200) || t.slice(0, 200)
  }

  if (wantsElevation) tools.push('elevation')

  if (!tools.length && t.length >= 4 && t.length <= 120 && !/\b(layer|ndvi|aoi|raster|feature|where clause)\b/i.test(t)) {
    tools.push('places_text_search')
    placesQuery = t.slice(0, 160)
  }

  return {
    tools: [...new Set(tools)],
    placesQuery,
    geocodeQuery,
    routeEndpoints,
    wantsElevation,
  }
}
