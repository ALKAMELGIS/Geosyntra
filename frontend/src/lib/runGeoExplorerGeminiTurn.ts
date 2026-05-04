/**
 * Shared Gemini Geo Explorer / Geo AI turn: same system context, weather, layer lookup, and MAP_QUERY
 * logic for Satellite Imagery and GIS Map.
 */

import { buildGisContentLayersContext } from './geoAiChatClaude'
import { buildGeoAiWeatherSystemAppend, type GeoAiWeatherPopupRef } from './geoAiWeatherContext'
import { geocodePlaceToLngLat, simplifyGeoExplorerUserQuery, stripLayerReferenceForGeocode } from './geoExplorerGeocode'
import {
  GEO_EXPLORER_LAYER_RULES,
  GEO_EXPLORER_SESSION_AND_WEATHER,
  GEO_EXPLORER_SYSTEM_PROMPT,
  geminiGenerateContent,
  messagesToGeminiContents,
  parseMapQueryLngLat,
  stripMapQueryLine,
  type GeoExplorerMessage,
} from './geoExplorerGemini'
import {
  extractGeoExplorerLayerHint,
  findLngLatFromLayerQuery,
  summarizeGeoAiMapLayers,
  type GeoAiMapLayer,
  type LayerQueryMatch,
} from './geoExplorerLayerContext'
import { loadGisMapSavedLayers } from './gisMapLayerStore'

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLng = ((b[0] - a[0]) * Math.PI) / 180
  const lat1 = (a[1] * Math.PI) / 180
  const lat2 = (b[1] * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

export type GeoExplorerGeminiPinSource = 'map_query' | 'layer' | 'geocode'

export type GeoExplorerGeminiMapEffect = {
  coords: [number, number]
  pinSource: GeoExplorerGeminiPinSource
  layerHit: LayerQueryMatch | null
  replyText: string
}

export type RunGeoExplorerGeminiTurnResult = {
  modelMsg: GeoExplorerMessage
  mapEffect: GeoExplorerGeminiMapEffect | null
}

export type RunGeoExplorerGeminiTurnParams = {
  apiKey: string
  historyWithUser: GeoExplorerMessage[]
  userTextForMapFallback: string
  /** Vector layers for this surface (Satellite “added” layers or GIS map layers). */
  primaryVectorLayers: GeoAiMapLayer[]
  mapboxAccessToken?: string
  openWeatherApiKey: string
  pinLngLat: [number, number] | null
  lastMapQueryCoords: [number, number] | null
  mapPopup: GeoAiWeatherPopupRef
  /** First line of the added-layers section, e.g. "### Satellite — Added layers (this page)" */
  addedLayersHeading: string
  /**
   * GIS Map only: merge IndexedDB saved layers + GIS Content prompt block.
   * Satellite must pass `false` so Geo AI stays isolated from GIS Map storage and cannot recurse on huge combined layer sets.
   */
  attachGisSavedLayers?: boolean
  /** Optional extra authoritative blocks (e.g. Develop Dashboard snapshot excerpt). */
  extraSystemAppend?: string
}

export async function runGeoExplorerGeminiTurn(
  params: RunGeoExplorerGeminiTurnParams,
): Promise<RunGeoExplorerGeminiTurnResult> {
  const {
    apiKey,
    historyWithUser,
    userTextForMapFallback,
    primaryVectorLayers,
    mapboxAccessToken,
    openWeatherApiKey,
    pinLngLat,
    lastMapQueryCoords,
    mapPopup,
    addedLayersHeading,
    attachGisSavedLayers,
    extraSystemAppend,
  } = params

  const attachGis = attachGisSavedLayers === true

  let combinedForLookup: GeoAiMapLayer[] = [...primaryVectorLayers]
  let gisBlock =
    '### GIS Content (saved layers from GIS Map)\n(Not attached on this page — open **GIS Map** → Geo AI to use layers saved in IndexedDB.)'

  if (attachGis) {
    const gisSaved = await loadGisMapSavedLayers()
    combinedForLookup = [
      ...primaryVectorLayers,
      ...gisSaved.map(
        (l): GeoAiMapLayer => ({
          name: l.name,
          visible: l.visible,
          source: l.source,
          data: l.data,
          arcgisLayerDefinition: (l as { arcgisLayerDefinition?: unknown }).arcgisLayerDefinition as
            | GeoAiMapLayer['arcgisLayerDefinition']
            | undefined,
        }),
      ),
    ]
    gisBlock = await buildGisContentLayersContext(22000)
  }

  const addedBlock = summarizeGeoAiMapLayers(primaryVectorLayers, 20000)

  let sessionWeatherBlocks = `\n\n${GEO_EXPLORER_SESSION_AND_WEATHER}`
  sessionWeatherBlocks += await buildGeoAiWeatherSystemAppend({
    userText: userTextForMapFallback,
    pinLngLat,
    lastMapQueryCoords,
    combinedLayers: combinedForLookup,
    mapboxAccessToken,
    openWeatherApiKey,
    mapPopup,
  })

  const tail = extraSystemAppend?.trim() ? `\n\n${extraSystemAppend.trim()}` : ''
  const systemInstruction = `${GEO_EXPLORER_SYSTEM_PROMPT}\n\n${GEO_EXPLORER_LAYER_RULES}${sessionWeatherBlocks}\n\n---\n${addedLayersHeading}\n${addedBlock}\n\n${gisBlock}${tail}`

  const reply = await geminiGenerateContent({
    apiKey,
    systemInstruction,
    contents: messagesToGeminiContents(historyWithUser),
  })

  const mapQueryCoords = parseMapQueryLngLat(reply)
  const layerHintTrim = (userTextForMapFallback ? extractGeoExplorerLayerHint(userTextForMapFallback) : null)?.trim() ?? ''
  const layerHit: LayerQueryMatch | null =
    userTextForMapFallback.trim().length > 0
      ? findLngLatFromLayerQuery(userTextForMapFallback, combinedForLookup)
      : null

  let coords: [number, number] | null = null
  let replyText = reply
  let pinSource: GeoExplorerGeminiPinSource = 'geocode'

  const layerPinNote = (hit: LayerQueryMatch) => {
    const hint = hit.matchSummary.trim()
    return `\n\n(Map pin from layer "${hit.layerName}" — matched feature attributes: ${hint.slice(0, 200)}${hint.length > 200 ? '…' : ''})`
  }

  /** Prefer vector layer geometry when the user scoped a layer or MAP_QUERY disagrees strongly with the hit feature. */
  const preferLayerCoords =
    Boolean(layerHit) &&
    (Boolean(layerHintTrim) ||
      Boolean(
        mapQueryCoords &&
          layerHit &&
          haversineKm(mapQueryCoords, [layerHit.lng, layerHit.lat]) > 2 &&
          layerHit.score >= 22,
      ))

  if (preferLayerCoords && layerHit) {
    coords = [layerHit.lng, layerHit.lat]
    pinSource = 'layer'
    replyText = `${stripMapQueryLine(reply).trimEnd()}${layerPinNote(layerHit)}`
  } else if (mapQueryCoords) {
    coords = mapQueryCoords
    pinSource = 'map_query'
    replyText = reply
  } else if (userTextForMapFallback) {
    if (layerHit) {
      coords = [layerHit.lng, layerHit.lat]
      pinSource = 'layer'
      replyText = `${reply.trimEnd()}${layerPinNote(layerHit)}`
    } else {
      const geoQuery = stripLayerReferenceForGeocode(simplifyGeoExplorerUserQuery(userTextForMapFallback))
      if (geoQuery.length >= 2) {
        const geocoded = await geocodePlaceToLngLat(geoQuery, {
          mapboxAccessToken,
        })
        if (geocoded) {
          coords = geocoded
          pinSource = 'geocode'
          replyText = `${reply.trimEnd()}\n\n(Map centered on the best place-name match for your message.)`
        }
      }
    }
  }

  if (coords && !parseMapQueryLngLat(replyText)) {
    replyText = `${replyText.trimEnd()}\nMAP_QUERY:${coords[0]},${coords[1]}`
  }

  const modelId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `geo-m-${Date.now()}`
  const modelMsg: GeoExplorerMessage = {
    id: modelId,
    role: 'model',
    parts: [{ type: 'text', text: replyText }],
  }

  if (!coords) {
    return { modelMsg, mapEffect: null }
  }

  return {
    modelMsg,
    mapEffect: {
      coords,
      pinSource,
      layerHit,
      replyText,
    },
  }
}

export function geoExplorerTargetZoomForPinSource(pinSource: GeoExplorerGeminiPinSource): number {
  if (pinSource === 'layer') return 17
  if (pinSource === 'map_query') return 15.75
  return 13.65
}
