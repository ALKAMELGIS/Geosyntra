/**
 * Geo AI interactive agent — local map actions before/after LLM (Satellite Intelligence).
 * Connects chat prompts to fly-to, routes, buffers, RS toolbox, and copilot JSON traces.
 */

import type { FeatureCollection } from 'geojson'
import type { GeoExplorerPart } from './geoExplorerContracts'
import { parseMapQueryLngLat, stripGeoAiCopilotJsonLine, stripMapQueryLine } from './geoExplorerContracts'
import {
  geocodePlaceCandidates,
  normalizePlaceNameForGeocode,
  pickConfidentGeocode,
} from './geoExplorerGeocode'
import {
  groundingComputeRoute,
  groundingGeocode,
  groundingPlacesSearch,
  fetchGeoGroundingStatus,
} from './geoGroundingLite/groundingApiClient'
import { detectGeoGroundingIntent } from './geoGroundingLite/intentDetector'
import { parseGeoAiCopilotJson } from './geoExplorerSpatialGate'
import {
  tryGeoAiBufferSpatialAction,
  type GeoAiBufferSpatialResult,
  type GeoAiSpatialAnchorContext,
} from './geoAiSpatialActions'
import {
  tryGeoAiRemoteSensingToolboxAction,
  type GeoAiRsLayerOption,
  type GeoAiRsToolboxEffect,
  type GeoAiRsToolboxResult,
} from './geoAiRemoteSensingToolbox'
import {
  buildGeoAiRouteSession,
  detectGeoAiTravelMode,
  type GeoAiRouteEndpoint,
  type GeoAiRouteSession,
  type GroundingRouteLeg,
} from './geoAiRoutePlan'
import { decodeGoogleEncodedPolyline, lineStringFeatureCollectionFromLngLat } from './geoAiPolylineDecode'
import {
  detectGeoAiAgentIntent,
  extractMapPlaceText,
  resolveGeographicPlaceFromQuery,
  validateGeoAiAgentRequest,
  type GeoAiAgentContext,
} from './geoAiAgentIntent'

export type { GeoAiAgentContext } from './geoAiAgentIntent'

export type GeoAiSatelliteAgentFlyTo = {
  coords: [number, number]
  zoom?: number
  label?: string
}

export type GeoAiSatelliteAgentDispatch = {
  flyTo?: GeoAiSatelliteAgentFlyTo
  pinCoords?: [number, number]
  addVectorLayer?: { featureCollection: FeatureCollection; layerName: string }
  routeLayer?: { featureCollection: FeatureCollection; label: string } | null
  routeSession?: GeoAiRouteSession | null
  rsToolboxEffects?: GeoAiRsToolboxEffect[]
  fieldStatus?: string
}

export type GeoAiSatelliteAgentPreflightResult =
  | { handled: false }
  | {
      handled: true
      skipLlm: boolean
      reply: string
      parts?: GeoExplorerPart[]
      dispatch: GeoAiSatelliteAgentDispatch
    }

export type GeoAiSatelliteAgentPostReplyResult = {
  dispatch: GeoAiSatelliteAgentDispatch
  displayReply?: string
}

const FLY_TO_PLACE_RE =
  /\b(?:zoom|fly|go|pan|center|centre)\s+(?:to|on)\s+(.+?)(?:\.|$|\?)/i

const ROUTE_QUERY_RE =
  /\b(directions?|route\b|show\s+me\s+(?:the\s+)?route|route\s+(?:on|in)\s+(?:the\s+)?map|navigate\s+to|drive\s+to|how\s+(?:do\s+i\s+|to\s+)?get\s+to)\b/i

function endpointFromPin(label: string, lngLat: [number, number]): GeoAiRouteEndpoint {
  return { label, lng: lngLat[0], lat: lngLat[1] }
}

function routeReplyMarkdown(
  session: GeoAiRouteSession,
  providerNote: string,
): string {
  const opt = session.options[session.selectedIndex] ?? session.options[0]
  const modeLabel =
    session.travelMode === 'WALK' ? 'Walking' : session.travelMode === 'BICYCLE' ? 'Cycling' : 'Driving'
  const altLine =
    session.options.length > 1
      ? `\n- **Alternatives:** ${session.options.length} paths — use the route panel on the map to compare.\n`
      : ''
  return (
    `**Route on map** (${modeLabel}${providerNote})\n\n` +
    `- **From:** ${session.origin.label}\n` +
    `- **To:** ${session.destination.label}\n` +
    `- **Distance:** ${opt?.distanceLabel ?? '—'}\n` +
    `- **Duration:** ${opt?.durationLabel ?? '—'}\n` +
    altLine +
    `\nThe path is drawn on the map with start/end markers. Ask for another mode (walking, cycling) or **from A to B**.`
  )
}

async function computeRouteSession(ctx: {
  origin: GeoAiRouteEndpoint
  destination: GeoAiRouteEndpoint
  travelMode: ReturnType<typeof detectGeoAiTravelMode>
}): Promise<GeoAiRouteSession | null> {
  const resp = await groundingComputeRoute({
    origin: { lat: ctx.origin.lat, lng: ctx.origin.lng },
    destination: { lat: ctx.destination.lat, lng: ctx.destination.lng },
    travelMode: ctx.travelMode,
    alternatives: 3,
  })
  if (!resp) return null

  const legs: GroundingRouteLeg[] = []
  if (Array.isArray(resp.routes) && resp.routes.length) {
    for (const r of resp.routes) legs.push(r)
  } else if (resp.route) {
    legs.push(resp.route)
  }
  if (!legs.length) return null

  return buildGeoAiRouteSession(legs, ctx.origin, ctx.destination, ctx.travelMode, resp.provider)
}

function pickGeocodeForMapAction(candidates: Awaited<ReturnType<typeof geocodePlaceCandidates>>) {
  const ranked = pickConfidentGeocode(candidates)
  if (ranked.chosen) return ranked.chosen
  if (!candidates.length) return null
  const sorted = [...candidates].sort((a, b) => b.score - a.score)
  const top = sorted[0]
  if (top && top.score >= 0.42) return top
  return null
}

async function geocodePlaceForMapAction(
  place: string,
  ctx: { mapboxAccessToken?: string },
  status: Awaited<ReturnType<typeof fetchGeoGroundingStatus>>,
): Promise<{ coords: [number, number]; label: string } | null> {
  const trimmed = normalizePlaceNameForGeocode(place)
  if (trimmed.length < 2) return null
  if (status.configured) {
    const geo = await groundingGeocode(trimmed)
    const g = geo.find(x => x.lat != null && x.lng != null)
    if (g?.lat != null && g?.lng != null) {
      return { coords: [g.lng, g.lat], label: g.label ?? trimmed }
    }
  }
  const candidates = await geocodePlaceCandidates(trimmed, { mapboxAccessToken: ctx.mapboxAccessToken })
  const chosen = pickGeocodeForMapAction(candidates)
  if (chosen) return { coords: [chosen.lng, chosen.lat], label: chosen.label }
  return null
}

async function tryGroundingMapPreflight(ctx: {
  query: string
  pinLngLat: [number, number] | null
  mapboxAccessToken?: string
}): Promise<GeoAiSatelliteAgentPreflightResult | null> {
  const q = ctx.query.trim()
  if (!q) return null

  const flyMatch = q.match(FLY_TO_PLACE_RE)
  const intent = detectGeoGroundingIntent(q)
  const status = await fetchGeoGroundingStatus()

  const dispatch: GeoAiSatelliteAgentDispatch = {}
  const useMapbox = (place: string) =>
    geocodePlaceCandidates(place, { mapboxAccessToken: ctx.mapboxAccessToken }).then(c => pickConfidentGeocode(c))

  const travelMode = detectGeoAiTravelMode(q)
  const routeAsk = Boolean(intent.routeEndpoints) || ROUTE_QUERY_RE.test(q)

  /* "Show me Dubai on the map" / "where is Paris" — geocode + fly (not RS layer toggle). */
  if (!routeAsk) {
    const placeOnMap = extractMapPlaceText(q) ?? resolveGeographicPlaceFromQuery(q)
    if (placeOnMap) {
      const hit = await geocodePlaceForMapAction(placeOnMap, ctx, status)
      if (hit) {
        dispatch.flyTo = { coords: hit.coords, zoom: 12, label: hit.label }
        dispatch.pinCoords = hit.coords
        return {
          handled: true,
          skipLlm: true,
          reply:
            `**Map:** Showing **${hit.label}** (${hit.coords[1].toFixed(4)}°, ${hit.coords[0].toFixed(4)}°).\n\n` +
            `The map is centered on this location. Ask about weather, a route, hotels nearby, or draw an AOI for satellite analysis.`,
          dispatch,
        }
      }
      const placeLabel = normalizePlaceNameForGeocode(placeOnMap)
      const hasMapbox = Boolean(ctx.mapboxAccessToken?.trim())
      const geocodeHint = !hasMapbox
        ? 'Mapbox geocoding is not available yet — the server may still be loading the platform token, or MAPBOX is unset on Hostinger. Esri/OSM basemaps still work.'
        : 'Try a more specific name (e.g. "Dubai, UAE") or confirm Geocoding is enabled on your Mapbox key.'
      return {
        handled: true,
        skipLlm: true,
        reply:
          `Could not find **${placeLabel || placeOnMap}** on the map. ${geocodeHint}`,
        dispatch,
      }
    }
  }

  /* Explicit "fly to Paris" */
  if (flyMatch?.[1] && !intent.routeEndpoints) {
    const place = flyMatch[1].trim()
    if (place.length >= 2) {
      if (status.configured) {
        const geo = await groundingGeocode(place)
        const g = geo.find(x => x.lat != null && x.lng != null)
        if (g?.lat != null && g?.lng != null) {
          const coords: [number, number] = [g.lng, g.lat]
          dispatch.flyTo = { coords, zoom: 12, label: g.label ?? place }
          dispatch.pinCoords = coords
          return {
            handled: true,
            skipLlm: true,
            reply:
              `**Map:** Flying to **${g.label ?? place}** (${coords[1].toFixed(4)}°, ${coords[0].toFixed(4)}°).\n\n` +
              `Ask follow-ups about weather, layers, or analysis for this location.`,
            dispatch,
          }
        }
      }
      const { chosen } = await useMapbox(place)
      if (chosen) {
        const coords: [number, number] = [chosen.lng, chosen.lat]
        dispatch.flyTo = { coords, zoom: 12, label: chosen.label }
        dispatch.pinCoords = coords
        return {
          handled: true,
          skipLlm: true,
          reply:
            `**Map:** Flying to **${chosen.label}**.\n\n` +
            `The pin marks the location — you can run timeline analysis after drawing an AOI.`,
          dispatch,
        }
      }
    }
  }

  const canGeocode = status.configured || Boolean(ctx.mapboxAccessToken?.trim())
  if (!canGeocode && !status.configured) {
    /* routing may still work via ORS without geocode providers — rare */
  }

  /* Routes — explicit endpoints or general route-on-map ask */
  if (routeAsk) {
    let destText = intent.routeEndpoints?.destinationText ?? ''
    let origText = intent.routeEndpoints?.originText ?? ''

    if (origText === '__map_pin_origin__' && ctx.pinLngLat) {
      origText = '__map_pin_origin__'
    }

    const geocodeOne = async (text: string) => {
      if (!text || text.startsWith('__map_pin')) return null
      if (status.configured) {
        const r = await groundingGeocode(text)
        const g = r.find(x => x.lat != null && x.lng != null)
        if (g?.lat != null && g?.lng != null) return { lat: g.lat, lng: g.lng, label: g.label ?? text }
      }
      const { chosen } = await useMapbox(text)
      if (chosen) return { lat: chosen.lat, lng: chosen.lng, label: chosen.label }
      return null
    }

    if (!destText && !intent.routeEndpoints && ROUTE_QUERY_RE.test(q)) {
      if (ctx.pinLngLat) {
        return {
          handled: true,
          skipLlm: true,
          reply:
            `**Route planning**\n\nYour map pin is the start point. Say **to [destination]** (e.g. *route to Alexandria*) or **from [A] to [B]** to draw the path.\n\n` +
            `Supported modes: driving, walking, cycling.`,
          dispatch,
        }
      }
      return {
        handled: true,
        skipLlm: true,
        reply:
          `**Route planning**\n\nDrop a pin on the map or say **from [start] to [destination]** (e.g. *from Cairo to Giza*). I will draw the route with distance and ETA.`,
        dispatch,
      }
    }

    if (!destText) {
      return { handled: true, skipLlm: true, reply: 'Name a destination: **route to [place]** or **from A to B**.', dispatch }
    }

    let dest =
      destText === '__map_pin_destination__' && ctx.pinLngLat
        ? { lat: ctx.pinLngLat[1], lng: ctx.pinLngLat[0], label: 'Map pin (destination)' }
        : await geocodeOne(destText)

    if (!dest) {
      return {
        handled: true,
        skipLlm: true,
        reply:
          `I could not locate **${destText}** on the map. Try a more specific place name or paste coordinates.`,
        dispatch,
      }
    }

    let orig =
      origText === '__map_pin_origin__' && ctx.pinLngLat
        ? { lat: ctx.pinLngLat[1], lng: ctx.pinLngLat[0], label: 'Map pin (start)' }
        : origText
          ? await geocodeOne(origText)
          : null
    if (!orig && ctx.pinLngLat && destText !== '__map_pin_destination__') {
      orig = { lat: ctx.pinLngLat[1], lng: ctx.pinLngLat[0], label: 'Map pin' }
    }

    if (orig) {
      const originEp = endpointFromPin(orig.label, [orig.lng, orig.lat])
      const destEp = endpointFromPin(dest.label, [dest.lng, dest.lat])
      const session = await computeRouteSession({ origin: originEp, destination: destEp, travelMode })
      if (session) {
        const opt = session.options[session.selectedIndex]!
        dispatch.routeSession = session
        dispatch.routeLayer = {
          featureCollection: opt.featureCollection,
          label: `${session.origin.label} → ${session.destination.label}`,
        }
        dispatch.flyTo = { coords: [dest.lng, dest.lat], zoom: 11, label: dest.label }
        dispatch.pinCoords = [dest.lng, dest.lat]
        const providerNote =
          session.provider === 'graphhopper'
            ? ' · GraphHopper'
            : session.provider === 'openrouteservice'
              ? ' · OpenRouteService'
              : ''
        return {
          handled: true,
          skipLlm: true,
          reply: routeReplyMarkdown(session, providerNote),
          dispatch,
        }
      }

      return {
        handled: true,
        skipLlm: true,
        reply:
          `Could not compute a route between **${orig.label}** and **${dest.label}**. ` +
          `Add **OpenRouteService (ORS_API_KEY)** under Settings → API Manager → OpenRouteService, or set **OPENROUTESERVICE_API_KEY** / **GOOGLE_MAPS_SERVER_API_KEY** on the API host, then try again.`,
        dispatch,
      }
    }

    dispatch.flyTo = { coords: [dest.lng, dest.lat], zoom: 12, label: dest.label }
    dispatch.pinCoords = [dest.lng, dest.lat]
    return {
      handled: true,
      skipLlm: true,
      reply:
        `**Map:** Centered on **${dest.label}**.\n\n` +
        `Add a start point: **from [your location] to ${dest.label}** or place a map pin first.`,
      dispatch,
    }
  }

  if (!status.configured && !ctx.mapboxAccessToken?.trim()) return null

  /* Places POI */
  if (intent.placesQuery && status.configured && /\b(hotel|restaurant|near|nearby|poi|places?\s+near)\b/i.test(q)) {
    const bias = ctx.pinLngLat
    const places = await groundingPlacesSearch({
      textQuery: intent.placesQuery,
      lat: bias?.[1],
      lng: bias?.[0],
    })
    const first = places.find(p => p.lat != null && p.lng != null)
    if (first?.lat != null && first?.lng != null) {
      const coords: [number, number] = [first.lng, first.lat]
      dispatch.flyTo = { coords, zoom: 14, label: first.name ?? 'Place' }
      dispatch.pinCoords = coords
      const list = places
        .slice(0, 5)
        .map((p, i) => `${i + 1}. ${p.name ?? '—'}${p.address ? ` — ${p.address}` : ''}`)
        .join('\n')
      return {
        handled: true,
        skipLlm: false,
        reply:
          `**Map:** Focused on **${first.name ?? 'top result'}**.\n\n**Nearby matches:**\n${list}\n\n` +
          `Refine your search or ask for a route to one of these places.`,
        dispatch,
      }
    }
  }

  return null
}

export async function tryGeoAiSatelliteAgentPreflight(ctx: {
  query: string
  pinLngLat: [number, number] | null
  lastMapQueryCoords: [number, number] | null
  layerOptions: GeoAiRsLayerOption[]
  mapboxAccessToken?: string
  agentContext?: GeoAiAgentContext
  /** Subscription gate — returns upgrade message when feature not allowed. */
  subscriptionAccess?: (
    intent: import('./geoAiAgentIntent').GeoAiAgentIntent,
  ) => { allowed: true } | { allowed: false; message: string; messageAr?: string }
}): Promise<GeoAiSatelliteAgentPreflightResult> {
  const anchorCtx: GeoAiSpatialAnchorContext = {
    query: ctx.query,
    pinLngLat: ctx.pinLngLat,
    lastMapQueryCoords: ctx.lastMapQueryCoords,
  }

  const intent = detectGeoAiAgentIntent(ctx.query)

  if (ctx.subscriptionAccess) {
    const access = ctx.subscriptionAccess(intent)
    if (!access.allowed) {
      const useAr = /[\u0600-\u06FF]/.test(ctx.query)
      return {
        handled: true,
        skipLlm: true,
        reply:
          (useAr && access.messageAr ? access.messageAr : access.message) +
          '\n\n_Open **Upgrade** from your profile or the pricing section to unlock Pro._',
        dispatch: {},
      }
    }
  }

  if (ctx.agentContext) {
    const validated = validateGeoAiAgentRequest(intent, ctx.agentContext)
    if (!validated.ok) {
      const useAr = /[\u0600-\u06FF]/.test(ctx.query)
      return {
        handled: true,
        skipLlm: true,
        reply: useAr && validated.reasonAr ? validated.reasonAr : validated.reason,
        dispatch: {},
      }
    }
  }

  const grounding = await tryGroundingMapPreflight(ctx)
  if (grounding) return grounding

  const buf: GeoAiBufferSpatialResult = tryGeoAiBufferSpatialAction(anchorCtx)
  if (buf.handled) {
    if (!buf.ok) {
      return { handled: true, skipLlm: true, reply: buf.reply, dispatch: {} }
    }
    return {
      handled: true,
      skipLlm: true,
      reply: buf.reply,
      dispatch: {
        addVectorLayer: { featureCollection: buf.featureCollection, layerName: buf.layerName },
        flyTo: { coords: buf.center, zoom: 13 },
        pinCoords: buf.center,
        fieldStatus: `Buffer layer "${buf.layerName}" added.`,
      },
    }
  }

  const rs: GeoAiRsToolboxResult = tryGeoAiRemoteSensingToolboxAction({
    query: ctx.query,
    layerOptions: ctx.layerOptions,
  })
  if (rs.handled) {
    return {
      handled: true,
      skipLlm: true,
      reply: rs.reply,
      dispatch: rs.ok
        ? { rsToolboxEffects: rs.effects, fieldStatus: 'Geo AI updated Remote Sensing controls.' }
        : {},
    }
  }

  return { handled: false }
}

export function buildGeoAiSatelliteAgentDispatchFromReply(
  _userText: string,
  reply: string,
  ctx: { pinLngLat: [number, number] | null },
): GeoAiSatelliteAgentPostReplyResult {
  const dispatch: GeoAiSatelliteAgentDispatch = {}
  let displayReply = stripGeoAiCopilotJsonLine(stripMapQueryLine(reply)).trim()

  const copilot = parseGeoAiCopilotJson(reply)
  const mapQuery = parseMapQueryLngLat(reply)

  let coords: [number, number] | null = null
  if (mapQuery) {
    coords = mapQuery
  } else if (copilot?.location?.lon != null && copilot?.location?.lat != null) {
    const lon = copilot.location.lon
    const lat = copilot.location.lat
    if (Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90) {
      coords = [lon, lat]
    }
  }

  if (coords && (copilot?.action === 'zoom' || copilot?.action === 'none' || !copilot?.action || mapQuery)) {
    dispatch.flyTo = { coords, zoom: 12 }
    dispatch.pinCoords = coords
  }

  if (copilot?.action === 'highlight' && ctx.pinLngLat) {
    dispatch.pinCoords = ctx.pinLngLat
  }

  return { dispatch, displayReply: displayReply || reply }
}

export function routeFeatureCollectionFromEncodedPolyline(
  encoded: string,
  meta?: { origin?: string; destination?: string; distance?: string; duration?: string },
): FeatureCollection | null {
  const line = decodeGoogleEncodedPolyline(encoded)
  if (line.length < 2) return null
  return lineStringFeatureCollectionFromLngLat(line, {
    name: 'Geo AI route',
    ...meta,
  })
}
